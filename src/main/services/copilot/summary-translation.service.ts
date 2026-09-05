/**
 * Summary Translation Service (Feature 4)
 *
 * Completes the Thai-localization loop started by Feature 1 (live
 * per-segment translation overlay): that feature only translates the LIVE
 * view, so a live English meeting's SAVED summary (shortOverview/keyPoints/
 * postMeetingChecklist) stayed English even with the translation setting
 * on. This translates the final summary too, once, right after it's
 * generated - reusing the same setting rather than adding a second toggle.
 *
 * Skips translation (returns null) when the summary is already
 * predominantly Thai - an imported recording whose batch transcript was
 * already Thai (see import.service.ts) already gets a Thai summary
 * straight from SummaryGeneratorService; translating Thai to Thai again
 * would just be wasted LLM calls.
 */

import { logger } from '../../lib/logger';
import { getLLMService } from '../llm.service';
import type { PostMeetingSummary, KeyPoint } from './summary-generator.service';

const log = logger.child({ module: 'summary-translation' });

const THAI_CHAR_RANGE = /[\u0E00-\u0E7F]/g;
const THAI_DOMINANCE_THRESHOLD = 0.3;

function isPredominantlyThai(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return false;
  const thaiChars = (stripped.match(THAI_CHAR_RANGE) || []).length;
  return thaiChars / stripped.length > THAI_DOMINANCE_THRESHOLD;
}

function stripJsonFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned;
}

function isValidKeyPoints(value: unknown, expectedLength: number): value is KeyPoint[] {
  return (
    Array.isArray(value) &&
    value.length === expectedLength &&
    value.every(
      (kp) =>
        kp &&
        typeof kp === 'object' &&
        typeof (kp as KeyPoint).topic === 'string' &&
        Array.isArray((kp as KeyPoint).points) &&
        (kp as KeyPoint).points.every((p) => typeof p === 'string')
    )
  );
}

function isValidStringArray(value: unknown, expectedLength: number): value is string[] {
  return Array.isArray(value) && value.length === expectedLength && value.every((s) => typeof s === 'string');
}

/**
 * Translates the overview paragraph. Returns null (not the English
 * original) on any failure - callers must treat null as "no Thai available
 * for this section" and skip rendering it, never fall back to showing the
 * English text a second time mislabeled as a translation.
 */
async function translateOverview(shortOverview: string): Promise<string | null> {
  const response = await getLLMService().complete(
    shortOverview,
    'Translate the following meeting summary paragraph into natural, professional Thai. ' +
      'Respond with the translation only - no preamble, no quotes, no markdown.'
  );
  return response.success && response.content ? response.content.trim() : null;
}

async function translateKeyPoints(keyPoints: KeyPoint[]): Promise<KeyPoint[] | null> {
  if (keyPoints.length === 0) return [];
  const systemPrompt =
    'Translate the "topic" and each string in "points" into natural, professional Thai. ' +
    'Preserve the exact JSON structure - same number of topics, same number of points per topic, ' +
    'same key names. Respond ONLY with the JSON array, no markdown fences, no preamble.';
  const response = await getLLMService().complete(JSON.stringify(keyPoints), systemPrompt);
  if (!response.success || !response.content) return null;
  try {
    const parsed = JSON.parse(stripJsonFences(response.content));
    // Validated, not just parsed - an LLM deviating from the requested shape
    // (wrong length, points not an array, non-string entries) would
    // otherwise reach the renderer's `.map()` calls and crash the page.
    if (isValidKeyPoints(parsed, keyPoints.length)) return parsed;
    log.warn({ recordingContext: 'keyPoints' }, 'Translated key points failed shape/length validation, discarding');
  } catch (error) {
    log.warn({ error }, 'Failed to parse translated key points');
  }
  return null;
}

async function translateChecklist(checklist: string[]): Promise<string[] | null> {
  if (checklist.length === 0) return [];
  const systemPrompt =
    'Translate each action item into natural, professional Thai. Preserve the exact array ' +
    'length and order. Respond ONLY with a JSON array of strings, no markdown fences, no preamble.';
  const response = await getLLMService().complete(JSON.stringify(checklist), systemPrompt);
  if (!response.success || !response.content) return null;
  try {
    const parsed = JSON.parse(stripJsonFences(response.content));
    // Length is validated because the renderer aligns checklistTh[idx] with
    // checklist[idx] by position - a length mismatch would silently show
    // the wrong translation next to the wrong action item.
    if (isValidStringArray(parsed, checklist.length)) return parsed;
    log.warn({ recordingContext: 'checklist' }, 'Translated checklist failed shape/length validation, discarding');
  } catch (error) {
    log.warn({ error }, 'Failed to parse translated checklist');
  }
  return null;
}

export interface SummaryTranslation {
  shortOverviewTh: string | null;
  keyPointsTh: KeyPoint[] | null;
  postMeetingChecklistTh: string[] | null;
}

/**
 * Translates a generated summary to Thai, or returns null if translation is
 * disabled or the summary is already predominantly Thai. Each of the three
 * sections translates and validates independently - one section failing
 * (LLM error, or output that doesn't match the expected shape/length) only
 * nulls out that section rather than discarding the other two. Never
 * throws - a thrown error from Promise.all itself (unlikely, since each
 * helper already catches its own errors) still resolves to null here.
 */
export async function maybeTranslateSummaryToThai(
  summary: PostMeetingSummary,
  translationEnabled: boolean
): Promise<SummaryTranslation | null> {
  if (!translationEnabled) return null;
  if (!summary.shortOverview || isPredominantlyThai(summary.shortOverview)) return null;

  try {
    const [shortOverviewTh, keyPointsTh, postMeetingChecklistTh] = await Promise.all([
      translateOverview(summary.shortOverview),
      translateKeyPoints(summary.keyPoints),
      translateChecklist(summary.postMeetingChecklist),
    ]);
    return { shortOverviewTh, keyPointsTh, postMeetingChecklistTh };
  } catch (error) {
    log.error({ error }, 'Summary translation failed');
    return null;
  }
}
