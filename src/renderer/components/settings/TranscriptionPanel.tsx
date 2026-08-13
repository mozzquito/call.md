/**
 * Transcription Settings Panel
 *
 * Picks the language used for real-time transcription. The choice is stored in
 * the main process and sent to VideoDB as `language_code` when a meeting starts.
 */

import React, { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import {
  AUTO_LANGUAGE,
  TRANSCRIPTION_LANGUAGES,
} from '../../../shared/constants/languages';
import { useConfigStore } from '../../stores/config.store';

export function TranscriptionPanel() {
  const transcriptionLanguage = useConfigStore((state) => state.transcriptionLanguage);
  const setConfig = useConfigStore((state) => state.setConfig);

  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedAt === null) return;
    const timeout = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(timeout);
  }, [savedAt]);

  const handleSelect = async (code: string) => {
    if (code === transcriptionLanguage) return;

    const previous = transcriptionLanguage;
    setConfig({ transcriptionLanguage: code });
    setIsSaving(true);
    setError(null);

    try {
      const result = await window.electronAPI.app.saveSettings({ transcriptionLanguage: code });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save language');
      }
      setSavedAt(Date.now());
    } catch (err) {
      // Put the store back so the UI keeps matching what is stored on disk.
      setConfig({ transcriptionLanguage: previous });
      setError(err instanceof Error ? err.message : 'Failed to save language');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="bg-white border border-[#e4e4ec] rounded-[14px] overflow-hidden">
        <div className="flex items-center justify-between px-[20px] py-[16px] border-b border-[#ededf3]">
          <div>
            <h3 className="text-[16px] font-semibold text-[#141420] leading-[22.5px]">
              Transcription Language
            </h3>
            <p className="text-[13px] text-[#969696] mt-[2px]">
              Applies to the next meeting you record
            </p>
          </div>
          {isSaving ? (
            <Loader2 className="w-[16px] h-[16px] text-[#ec5b16] animate-spin" />
          ) : savedAt ? (
            <span className="flex items-center gap-[4px] text-[13px] font-medium text-[#059669]">
              <Check className="w-[16px] h-[16px]" />
              Saved
            </span>
          ) : null}
        </div>

        <div className="max-h-[360px] overflow-auto">
          {TRANSCRIPTION_LANGUAGES.map((language, index) => {
            const isSelected = language.code === transcriptionLanguage;

            return (
              <button
                key={language.code}
                onClick={() => handleSelect(language.code)}
                disabled={isSaving}
                className={`flex items-center justify-between w-full px-[20px] py-[14px] text-left transition-colors disabled:opacity-60 ${
                  index < TRANSCRIPTION_LANGUAGES.length - 1 ? 'border-b border-[#ededf3]' : ''
                } ${isSelected ? 'bg-[rgba(255,64,0,0.04)]' : 'hover:bg-[#f7f7f7]'}`}
              >
                <span className="flex flex-col">
                  <span
                    className={`text-[14px] font-medium ${
                      isSelected ? 'text-[#ff4000]' : 'text-[#464646]'
                    }`}
                  >
                    {language.label}
                  </span>
                  <span className="text-[13px] text-[#969696]">{language.nativeLabel}</span>
                </span>
                {isSelected && <Check className="w-[18px] h-[18px] text-[#ff4000]" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-[8px] p-[12px] bg-[rgba(209,36,47,0.06)] border border-[rgba(209,36,47,0.19)] rounded-[10px]">
          <AlertCircle className="w-[16px] h-[16px] text-[#d1242f] shrink-0 mt-[1px]" />
          <span className="text-[13px] text-[#d1242f]">{error}</span>
        </div>
      )}

      {transcriptionLanguage !== AUTO_LANGUAGE && (
        <p className="text-[13px] text-[#969696] leading-[18px]">
          Language support depends on the VideoDB transcription backend. If the selected language
          is unavailable, transcription falls back to the engine default instead of failing.
        </p>
      )}
    </div>
  );
}

export default TranscriptionPanel;
