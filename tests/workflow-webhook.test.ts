/** Regression tests for DNS-pinned webhook delivery. */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPinnedLookup } from '../src/main/lib/url-guard';
import { postWebhook } from '../src/main/lib/webhook-request';
import type { WorkflowWebhookPayload } from '../src/shared/types/workflow.types';

const payload: WorkflowWebhookPayload = {
  callId: 'pin-test',
  triggeredAt: '2026-08-14T00:00:00.000Z',
  meeting: {
    recordingId: 1,
    title: 'Pinned webhook test',
    startedAt: '2026-08-14T00:00:00.000Z',
    endedAt: '2026-08-14T00:01:00.000Z',
    durationSeconds: 60,
  },
  videodb: {
    exportedVideoId: 'video-1',
    playerUrl: 'https://example.com/player/video-1',
  },
  content: {},
};

test('pinned lookup returns only the addresses approved by validation', async () => {
  const lookup = createPinnedLookup('hooks.example.com', [
    { address: '203.0.113.10', family: 4 },
    { address: '2001:db8::10', family: 6 },
  ]);

  const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    lookup('hooks.example.com', { family: 4 }, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(typeof address, 'string');
      resolve({ address: address as string, family: family ?? 0 });
    });
  });

  assert.deepEqual(result, { address: '203.0.113.10', family: 4 });
});

test('pinned lookup rejects a different hostname', async () => {
  const lookup = createPinnedLookup('hooks.example.com', [
    { address: '203.0.113.10', family: 4 },
  ]);

  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup('rebound.example.com', { family: 4 }, (error, address) => {
        if (error) return reject(error);
        resolve(address);
      });
    }),
    /unexpected webhook host/
  );
});

test('pinned lookup cannot fall back to an unapproved address family', async () => {
  const lookup = createPinnedLookup('hooks.example.com', [
    { address: '203.0.113.10', family: 4 },
  ]);

  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup('hooks.example.com', { family: 6 }, (error, address) => {
        if (error) return reject(error);
        resolve(address);
      });
    }),
    /approved webhook address/
  );
});

test('webhook request connects to the approved address without re-resolving the host', async (t) => {
  let receivedHost = '';
  let receivedCallId = '';
  const server = http.createServer((request, response) => {
    receivedHost = request.headers.host ?? '';
    receivedCallId = String(request.headers['x-workflow-call-id'] ?? '');
    request.resume();
    response.writeHead(204);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const response = await postWebhook(
    `http://dns-rebind.invalid:${address.port}/hook`,
    payload,
    [{ address: '127.0.0.1', family: 4 }]
  );

  assert.equal(response.ok, true);
  assert.equal(response.status, 204);
  assert.equal(receivedHost, `dns-rebind.invalid:${address.port}`);
  assert.equal(receivedCallId, payload.callId);
});

test('webhook request does not follow redirects to an unvalidated target', async (t) => {
  let redirectTargetCalled = false;
  const target = http.createServer((_request, response) => {
    redirectTargetCalled = true;
    response.writeHead(204);
    response.end();
  });
  const redirector = http.createServer((_request, response) => {
    const targetAddress = target.address();
    assert.ok(targetAddress && typeof targetAddress !== 'string');
    response.writeHead(302, { Location: `http://127.0.0.1:${targetAddress.port}/private` });
    response.end();
  });

  for (const server of [target, redirector]) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => server.close());
  }

  const redirectAddress = redirector.address();
  assert.ok(redirectAddress && typeof redirectAddress !== 'string');

  const response = await postWebhook(
    `http://redirect.invalid:${redirectAddress.port}/hook`,
    payload,
    [{ address: '127.0.0.1', family: 4 }]
  );

  assert.equal(response.status, 302);
  assert.equal(response.ok, false);
  assert.equal(redirectTargetCalled, false);
});

test('webhook timeout remains active until the response body ends', async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('partial body');
    // Deliberately leave the response open past the client deadline.
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  await assert.rejects(
    postWebhook(
      `http://stalled.invalid:${address.port}/hook`,
      payload,
      [{ address: '127.0.0.1', family: 4 }],
      50
    ),
    /abort/i
  );
});
