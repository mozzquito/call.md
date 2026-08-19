import dns from 'dns';
import http from 'http';
import https from 'https';
import type { WorkflowWebhookPayload } from '../../shared/types/workflow.types';
import { createPinnedLookup } from './url-guard';

const WEBHOOK_TIMEOUT_MS = 30000;

/** Sends a webhook only to addresses approved by URL validation. */
export async function postWebhook(
  webhookUrl: string,
  payload: WorkflowWebhookPayload,
  approvedAddresses: dns.LookupAddress[],
  timeoutMs: number = WEBHOOK_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(webhookUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const requestModule = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await new Promise((resolve, reject) => {
      const request = requestModule.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'Call.md/1.0',
            'X-Workflow-Call-Id': payload.callId,
          },
          lookup: createPinnedLookup(hostname, approvedAddresses),
          signal: controller.signal,
        },
        (response) => {
          // Redirects are returned to the caller rather than followed because
          // their target has not passed URL or address validation.
          const status = response.statusCode ?? 0;
          response.on('error', reject);
          response.on('end', () => {
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: response.statusMessage ?? '',
            });
          });
          response.resume();
        }
      );

      request.on('error', reject);
      request.end(body);
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
