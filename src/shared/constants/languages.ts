/**
 * Transcription Languages
 *
 * Language options offered for real-time transcription. The code is sent to
 * VideoDB as `language_code` when starting an RTStream transcript.
 *
 * `auto` means "send nothing" and lets the transcription engine pick, which is
 * the historical behaviour.
 */

export const AUTO_LANGUAGE = 'auto';

export interface TranscriptionLanguage {
  /** BCP-47 code sent to the API, or `auto`. */
  code: string;
  /** English name, for the settings list. */
  label: string;
  /** Endonym, shown alongside the label. */
  nativeLabel: string;
}

export const TRANSCRIPTION_LANGUAGES: TranscriptionLanguage[] = [
  { code: AUTO_LANGUAGE, label: 'Automatic', nativeLabel: 'Detect from audio' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
];

const LANGUAGE_CODES = new Set(TRANSCRIPTION_LANGUAGES.map((language) => language.code));

export function isSupportedLanguage(code: string): boolean {
  return LANGUAGE_CODES.has(code);
}

/**
 * Normalises a stored preference into the code to send to the API.
 * Returns `undefined` for `auto`, an unknown code, or nothing set.
 */
export function toLanguageCode(preference: string | undefined): string | undefined {
  if (!preference || preference === AUTO_LANGUAGE) return undefined;
  return isSupportedLanguage(preference) ? preference : undefined;
}

export function getLanguageLabel(code: string): string {
  return TRANSCRIPTION_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}
