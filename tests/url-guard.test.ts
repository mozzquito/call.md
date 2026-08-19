/**
 * Tests for the webhook URL guard (issue #27, SSRF).
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWebhookUrlSyntax,
  validateWebhookUrl,
  isBlockedAddress,
} from '../src/main/lib/url-guard';

test('accepts ordinary public webhook URLs', () => {
  for (const url of [
    'https://hooks.zapier.com/hooks/catch/123/abc',
    'https://n8n.example.com/webhook/meeting-done',
    'http://example.com/hook',
    'https://example.com:8443/hook?token=x',
  ]) {
    assert.equal(validateWebhookUrlSyntax(url).valid, true, url);
  }
});

test('rejects non-HTTP schemes', () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)']) {
    const result = validateWebhookUrlSyntax(url);
    assert.equal(result.valid, false, url);
  }
});

test('rejects loopback and local hostnames', () => {
  for (const url of [
    'http://127.0.0.1:51731/api/trpc',
    'http://localhost:51731/api',
    'http://[::1]:51731/api',
    'http://[::ffff:127.0.0.1]:51731/api',
    'http://[::ffff:7f00:1]:51731/api',
    'http://myapp.local/hook',
    'http://0.0.0.0/hook',
  ]) {
    assert.equal(validateWebhookUrlSyntax(url).valid, false, url);
  }
});

test('rejects private and link-local ranges', () => {
  for (const url of [
    'http://10.1.2.3/hook',
    'http://172.16.5.4/hook',
    'http://192.168.1.10/hook',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://100.64.0.1/hook', // carrier-grade NAT
  ]) {
    assert.equal(validateWebhookUrlSyntax(url).valid, false, url);
  }
});

test('rejects non-global IPv4 special-purpose ranges', () => {
  for (const url of [
    'http://192.0.2.1/hook',
    'http://192.88.99.1/hook',
    'http://198.51.100.1/hook',
    'http://203.0.113.1/hook',
  ]) {
    assert.equal(validateWebhookUrlSyntax(url).valid, false, url);
  }
});

test('rejects credentials embedded in the URL', () => {
  assert.equal(validateWebhookUrlSyntax('https://user:pass@example.com/hook').valid, false);
});

test('rejects empty and malformed input', () => {
  assert.equal(validateWebhookUrlSyntax('').valid, false);
  assert.equal(validateWebhookUrlSyntax('   ').valid, false);
  assert.equal(validateWebhookUrlSyntax('not a url').valid, false);
});

test('classifies IPv6 forms', () => {
  assert.equal(isBlockedAddress('::1').blocked, true);
  assert.equal(isBlockedAddress('fe80::1').blocked, true);
  assert.equal(isBlockedAddress('fd00::1').blocked, true);
  assert.equal(isBlockedAddress('::ffff:127.0.0.1').blocked, true);
  assert.equal(isBlockedAddress('::ffff:7f00:1').blocked, true);
  assert.equal(isBlockedAddress('0:0:0:0:0:ffff:7f00:1').blocked, true);
  assert.equal(isBlockedAddress('::7f00:1').blocked, true);
  assert.equal(isBlockedAddress('fec0::1').blocked, true);
  assert.equal(isBlockedAddress('ff02::1').blocked, true);
  assert.equal(isBlockedAddress('2001:db8::1').blocked, true);
  assert.equal(isBlockedAddress('100::1').blocked, true);
  assert.equal(isBlockedAddress('100:0:0:1::1').blocked, true);
  assert.equal(isBlockedAddress('2001:2::1').blocked, true);
  assert.equal(isBlockedAddress('3fff::1').blocked, true);
  assert.equal(isBlockedAddress('5f00::1').blocked, true);
  assert.equal(isBlockedAddress('::ffff:8.8.8.8').blocked, false);
  assert.equal(isBlockedAddress('2606:4700:4700::1111').blocked, false);
});

test('rejects special-use IPv6 webhook literals', () => {
  for (const url of [
    'http://[::7f00:1]/hook',
    'http://[fec0::1]/hook',
    'http://[ff02::1]/hook',
    'http://[2001:db8::1]/hook',
    'http://[100::1]/hook',
    'http://[100:0:0:1::1]/hook',
    'http://[2001:2::1]/hook',
    'http://[3fff::1]/hook',
    'http://[5f00::1]/hook',
  ]) {
    assert.equal(validateWebhookUrlSyntax(url).valid, false, url);
  }
});

test('keeps public IPv4 addresses next to blocked ranges usable', () => {
  // Boundary checks - one address either side of each blocked block.
  assert.equal(isBlockedAddress('9.255.255.255').blocked, false);
  assert.equal(isBlockedAddress('10.0.0.0').blocked, true);
  assert.equal(isBlockedAddress('11.0.0.0').blocked, false);
  assert.equal(isBlockedAddress('172.15.255.255').blocked, false);
  assert.equal(isBlockedAddress('172.32.0.0').blocked, false);
  assert.equal(isBlockedAddress('169.253.0.1').blocked, false);
  assert.equal(isBlockedAddress('8.8.8.8').blocked, false);
});

test('resolves hostnames before allowing them', async () => {
  // localhost.localtest.me and friends resolve to 127.0.0.1; use a name that is
  // guaranteed to fail resolution instead of depending on the network.
  const result = await validateWebhookUrl('https://this-host-does-not-exist.invalid/hook');
  assert.equal(result.valid, false);
  assert.match(result.error ?? '', /resolve/i);
});

test('literal public IPs skip the DNS lookup and pass', async () => {
  const result = await validateWebhookUrl('https://8.8.8.8/hook');
  assert.equal(result.valid, true);
  assert.deepEqual(result.addresses, [{ address: '8.8.8.8', family: 4 }]);
});
