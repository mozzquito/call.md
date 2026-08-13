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
import net from 'net';

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** IPv4 CIDR blocks that must never be reachable from a webhook. */
const BLOCKED_V4_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: '0.0.0.0/8', label: 'unspecified' },
  { cidr: '10.0.0.0/8', label: 'private' },
  { cidr: '100.64.0.0/10', label: 'carrier-grade NAT' },
  { cidr: '127.0.0.0/8', label: 'loopback' },
  { cidr: '169.254.0.0/16', label: 'link-local / cloud metadata' },
  { cidr: '172.16.0.0/12', label: 'private' },
  { cidr: '192.0.0.0/24', label: 'IETF protocol assignments' },
  { cidr: '192.168.0.0/16', label: 'private' },
  { cidr: '198.18.0.0/15', label: 'benchmarking' },
  { cidr: '224.0.0.0/4', label: 'multicast' },
  { cidr: '240.0.0.0/4', label: 'reserved' },
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

    // IPv4-mapped (::ffff:127.0.0.1) — judge on the embedded IPv4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);

    if (lower === '::' || lower === '::1') {
      return { blocked: true, reason: `loopback address (${normalized})` };
    }
    // fc00::/7 unique-local, fe80::/10 link-local
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) {
      return { blocked: true, reason: `private address (${normalized})` };
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
  if (net.isIP(hostname)) return { valid: true };

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

  return { valid: true };
}
