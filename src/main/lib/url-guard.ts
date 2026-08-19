/**
 * URL Guard
 *
 * Validation for user-supplied outbound URLs (workflow webhooks).
 *
 * Webhooks are fired from the main process, which sits behind the user's
 * firewall and next to this app's own loopback API. An unvalidated URL turns
 * that into a server-side request forgery primitive: `http://127.0.0.1:51731`
 * would replay meeting data into the local API, and `http://169.254.169.254`
 * reaches the cloud metadata service on a hosted runner.
 *
 * Names are resolved before the verdict, so `evil.test` pointing at 127.0.0.1
 * is rejected too.
 */

import dns from 'dns';
import http from 'http';
import net from 'net';
import { Address6 } from 'ip-address';

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  /** Addresses approved by the same lookup that must be used for delivery. */
  addresses?: dns.LookupAddress[];
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Creates a resolver that can return only addresses from the guard's lookup.
 * This closes the validation/use gap where DNS could otherwise change between
 * validation and the actual connection.
 */
export function createPinnedLookup(
  expectedHostname: string,
  approvedAddresses: dns.LookupAddress[]
): NonNullable<http.RequestOptions['lookup']> {
  return (hostname, options, callback) => {
    if (hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
      const error = new Error(`Refusing to resolve unexpected webhook host "${hostname}"`) as NodeJS.ErrnoException;
      error.code = 'EAI_FAIL';
      callback(error, '', 0);
      return;
    }

    const family = typeof options.family === 'number' ? options.family : 0;
    const candidates = family
      ? approvedAddresses.filter((address) => address.family === family)
      : approvedAddresses;

    if (candidates.length === 0) {
      const error = new Error('No approved webhook address matches the requested family') as NodeJS.ErrnoException;
      error.code = 'EAI_ADDRFAMILY';
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    callback(null, candidates[0].address, candidates[0].family);
  };
}

/** IPv4 CIDR blocks that must never be reachable from a webhook. */
const BLOCKED_V4_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: '0.0.0.0/8', label: 'unspecified' },
  { cidr: '10.0.0.0/8', label: 'private' },
  { cidr: '100.64.0.0/10', label: 'carrier-grade NAT' },
  { cidr: '127.0.0.0/8', label: 'loopback' },
  { cidr: '169.254.0.0/16', label: 'link-local / cloud metadata' },
  { cidr: '172.16.0.0/12', label: 'private' },
  { cidr: '192.0.0.0/24', label: 'IETF protocol assignments' },
  { cidr: '192.0.2.0/24', label: 'documentation' },
  { cidr: '192.88.99.0/24', label: 'deprecated relay' },
  { cidr: '192.168.0.0/16', label: 'private' },
  { cidr: '198.18.0.0/15', label: 'benchmarking' },
  { cidr: '198.51.100.0/24', label: 'documentation' },
  { cidr: '203.0.113.0/24', label: 'documentation' },
  { cidr: '224.0.0.0/4', label: 'multicast' },
  { cidr: '240.0.0.0/4', label: 'reserved' },
];

/** Current non-global IPv6 blocks from the IANA special-purpose registry. */
const BLOCKED_V6_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: '100::/64', label: 'discard-only' },
  { cidr: '100:0:0:1::/64', label: 'dummy' },
  // Conservative umbrella for IETF assignments. It includes a few global
  // anycast exceptions, none of which are valid webhook hosting ranges.
  { cidr: '2001::/23', label: 'IETF protocol assignment' },
  { cidr: '3fff::/20', label: 'documentation' },
  { cidr: '5f00::/16', label: 'segment-routing SID' },
  { cidr: 'fc00::/7', label: 'unique-local' },
  { cidr: 'fe80::/10', label: 'link-local' },
  { cidr: 'fec0::/10', label: 'deprecated site-local' },
  { cidr: 'ff00::/8', label: 'multicast' },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isInV4Range(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  // `<<` is a 32-bit signed op in JS; `>>> 0` keeps the mask unsigned.
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal.
 *
 * WHATWG URL canonicalisation rewrites `::ffff:127.0.0.1` to
 * `::ffff:7f00:1`, so checking only the dotted spelling leaves a loopback
 * bypass. Expanding the eight IPv6 words handles both representations.
 */
function extractMappedIpv4(address: string): string | null {
  let value = address.toLowerCase();

  const dottedMatch = value.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMatch) {
    const ipv4 = ipv4ToInt(dottedMatch[1]);
    if (ipv4 === null) return null;
    value = value.slice(0, dottedMatch.index) +
      `${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const words = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'),
    ...right,
  ].map((word) => Number.parseInt(word, 16));

  if (
    words.length !== 8 ||
    words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff) ||
    words.slice(0, 5).some((word) => word !== 0) ||
    words[5] !== 0xffff
  ) {
    return null;
  }

  return [words[6] >>> 8, words[6] & 0xff, words[7] >>> 8, words[7] & 0xff].join('.');
}

/**
 * True when the address is loopback, private, link-local or otherwise
 * unroutable on the public internet.
 */
export function isBlockedAddress(address: string): { blocked: boolean; reason?: string } {
  const normalized = address.replace(/^\[|\]$/g, '');
  const version = net.isIP(normalized);

  if (version === 4) {
    for (const { cidr, label } of BLOCKED_V4_RANGES) {
      if (isInV4Range(normalized, cidr)) {
        return { blocked: true, reason: `${label} address (${normalized})` };
      }
    }
    return { blocked: false };
  }

  if (version === 6) {
    const lower = normalized.toLowerCase();

    // IPv4-mapped (::ffff:127.0.0.1 / ::ffff:7f00:1) — judge the IPv4 target.
    const mapped = extractMappedIpv4(lower);
    if (mapped) return isBlockedAddress(mapped);

    const parsed = new Address6(lower);
    const embedded = parsed.embeddedIPv4();
    if (embedded) return isBlockedAddress(embedded.correctForm());

    for (const { cidr, label } of BLOCKED_V6_RANGES) {
      if (parsed.isHostInSubnet(new Address6(cidr))) {
        return { blocked: true, reason: `${label} address (${normalized})` };
      }
    }

    if (parsed.isLoopback() || parsed.isUnspecified()) {
      return { blocked: true, reason: `loopback address (${normalized})` };
    }
    if (parsed.isPrivate() || parsed.isLinkLocal()) {
      return { blocked: true, reason: `private address (${normalized})` };
    }
    if (parsed.isMulticast()) {
      return { blocked: true, reason: `multicast address (${normalized})` };
    }

    if (parsed.isHostInSubnet(new Address6('::/96'))) {
      return { blocked: true, reason: `non-public address (${normalized})` };
    }

    // Public webhooks need a globally routable unicast destination. This also
    // rejects deprecated site-local space (fec0::/10), documentation ranges,
    // IPv4-compatible ::/96 spellings, Teredo and other special-use prefixes.
    if (parsed.getType() !== 'Global unicast') {
      return { blocked: true, reason: `non-public address (${normalized})` };
    }

    return { blocked: false };
  }

  return { blocked: false };
}

/**
 * Checks the shape of a webhook URL without touching the network.
 * Use before persisting a workflow; `validateWebhookUrl` adds DNS resolution.
 */
export function validateWebhookUrlSyntax(rawUrl: string): UrlValidationResult {
  if (!rawUrl || !rawUrl.trim()) {
    return { valid: false, error: 'Webhook URL is required' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Webhook URL is not a valid URL' };
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return {
      valid: false,
      error: `Webhook URL must use http or https (got "${url.protocol.replace(':', '')}")`,
    };
  }

  if (url.username || url.password) {
    return { valid: false, error: 'Webhook URL must not embed credentials' };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { valid: false, error: 'Webhook URL must include a host' };
  }

  // Catch literal IPs and obvious local names before any DNS lookup.
  const literal = isBlockedAddress(hostname);
  if (literal.blocked) {
    return { valid: false, error: `Webhook URL points at a ${literal.reason}` };
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { valid: false, error: 'Webhook URL must not point at the local machine' };
  }

  return { valid: true };
}

/**
 * Full validation: syntax, then every address the host resolves to.
 *
 * A hostname can resolve to several addresses; all of them must be public,
 * otherwise the request could still land internally.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<UrlValidationResult> {
  const syntax = validateWebhookUrlSyntax(rawUrl);
  if (!syntax.valid) return syntax;

  const hostname = new URL(rawUrl.trim()).hostname.replace(/^\[|\]$/g, '');

  // Literal IPs were already checked and need no lookup.
  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    return { valid: true, addresses: [{ address: hostname, family: literalFamily }] };
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    return { valid: false, error: `Could not resolve webhook host "${hostname}"` };
  }

  for (const { address } of addresses) {
    const { blocked, reason } = isBlockedAddress(address);
    if (blocked) {
      return { valid: false, error: `Webhook host "${hostname}" resolves to a ${reason}` };
    }
  }

  if (addresses.length === 0) {
    return { valid: false, error: `Could not resolve webhook host "${hostname}"` };
  }

  return { valid: true, addresses };
}
