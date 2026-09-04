/**
 * Translation Service
 *
 * Translates finalized transcript segments to Thai using the existing
 * VideoDB-proxied LLM client (no new credentials). Runs behind a small
 * concurrency-limited queue so a burst of fast speech doesn't fire a dozen
 * concurrent LLM calls at once.
 */

import { logger } from '../../lib/logger';
import { getLLMService } from '../llm.service';

const log = logger.child({ module: 'translation-service' });

const SYSTEM_PROMPT = `You are a live meeting interpreter. Translate the LATEST LINE into natural,
conversational Thai. Use the previous lines only as context to resolve pronouns and honorifics
(ครับ/ค่ะ) correctly - do not translate them again.

Rules:
- Respond with the Thai translation only. No explanation, no quotes, no romanization.
- Keep names, numbers, and technical terms as-is where a direct translation would be unnatural.
- Match the register of a spoken conversation, not written prose.`;

interface QueueTask {
  run: () => Promise<void>;
}

class TranslationQueue {
  private readonly concurrency = 2;
  private active = 0;
  private pending: QueueTask[] = [];

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pending.push({
        run: async () => {
          try {
            resolve(await fn());
          } catch (error) {
            reject(error);
          }
        },
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active++;
      task.run().finally(() => {
        this.active--;
        this.drain();
      });
    }
  }
}

const queue = new TranslationQueue();

/**
 * Translate one finalized segment to Thai. `priorContext` must be captured by
 * the caller BEFORE enqueueing, not read here - the queue can execute this
 * task several segments later (concurrency 2), by which point the transcript
 * buffer has moved on and "recent context" read at execution time would be
 * wrong (could include lines that came after this segment, or miss lines that
 * came before it). Returns null on failure - callers should treat that as
 * "translation unavailable for this segment" rather than retry indefinitely.
 */
export async function translateSegment(
  sessionId: string,
  text: string,
  priorContext: string
): Promise<string | null> {
  return queue.enqueue(async () => {
    const llm = getLLMService();

    const userPrompt = priorContext
      ? `Previous lines (context only, do not re-translate):\n${priorContext}\n\nLATEST LINE:\n${text}`
      : `LATEST LINE:\n${text}`;

    try {
      const response = await llm.complete(userPrompt, SYSTEM_PROMPT);
      if (response.success && response.content) {
        return response.content.trim();
      }
      log.warn({ sessionId, error: response.error }, 'Translation request failed');
      return null;
    } catch (error) {
      log.error({ error, sessionId }, 'Translation request threw');
      return null;
    }
  });
}
