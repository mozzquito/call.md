/**
 * Notifications Panel Component
 *
 * Settings panel for managing notification preferences.
 * Handles notification timing and recording behavior settings.
 */

import React, { useState, useEffect } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useNotificationPermission } from '../../hooks/useNotificationPermission';

type RecordingBehavior = 'always_ask' | 'default_record' | 'no_notification';

// Toggle Component
function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`w-[38px] h-[22px] rounded-full relative transition-colors ${
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div
        className={`absolute size-[18px] bg-primary-foreground rounded-full top-[2px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.15)] transition-all ${
          enabled ? 'left-[18px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

// Recording icon
function RecordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="7.5" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill="hsl(var(--primary))" />
    </svg>
  );
}

// Settings Card wrapper
function SettingsCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-card border border-border rounded-[14px] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

// Card header
function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-[20px] py-[16px] border-b border-border">
      <h3 className="text-[16px] font-semibold text-foreground leading-[22.5px]">
        {title}
      </h3>
      {description && (
        <p className="text-[13px] text-muted-foreground mt-[4px]">{description}</p>
      )}
    </div>
  );
}

export function NotificationsPanel() {
  // System notification permission
  const { enabled: systemNotificationsEnabled, openSettings: openNotificationSettings } =
    useNotificationPermission();

  // Preferences state
  const [notifyMinutes, setNotifyMinutes] = useState<number>(2);
  const [recordingBehavior, setRecordingBehavior] = useState<RecordingBehavior>('always_ask');
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const preferencesQuery = trpc.settings.getCalendarPreferences.useQuery();
  const updatePreferences = trpc.settings.updateCalendarPreferences.useMutation();

  // Load preferences when query completes
  useEffect(() => {
    if (preferencesQuery.data) {
      setNotifyMinutes(preferencesQuery.data.notifyMinutesBefore ?? 2);
      setRecordingBehavior(preferencesQuery.data.recordingBehavior ?? 'always_ask');
    }
  }, [preferencesQuery.data]);

  const handleNotifyMinutesChange = async (minutes: number) => {
    setNotifyMinutes(minutes);
    setIsSavingPrefs(true);
    try {
      await updatePreferences.mutateAsync({ notifyMinutesBefore: minutes });
    } catch (err) {
      console.error('Failed to update notification timing:', err);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleRecordingBehaviorChange = async (behavior: RecordingBehavior) => {
    setRecordingBehavior(behavior);
    setIsSavingPrefs(true);
    try {
      await updatePreferences.mutateAsync({ recordingBehavior: behavior });
    } catch (err) {
      console.error('Failed to update recording behavior:', err);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const notifyOptions = [
    { value: 1, label: '1 min' },
    { value: 2, label: '2 mins' },
    { value: 5, label: '5 mins' },
  ];

  const behaviorOptions: { value: RecordingBehavior; title: string; description: string }[] = [
    {
      value: 'always_ask',
      title: 'Ask me every time',
      description: "You'll get a notification to confirm before each meeting",
    },
    {
      value: 'default_record',
      title: 'Record all meetings',
      description: 'Automatically join and record every calendar event',
    },
    {
      value: 'no_notification',
      title: 'Start recording via app only',
      description: 'Only records when you manually start a session',
    },
  ];

  return (
    <div className="flex flex-col gap-[20px]">
      {/* System Notifications Card */}
      <SettingsCard>
        <CardHeader
          title="System Notifications"
          description="Allow Call.md to send desktop notifications"
        />
        <div className="px-[20px] py-[16px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[12px]">
              <div className="w-[36px] h-[36px] bg-secondary rounded-[10px] flex items-center justify-center">
                <Bell className="w-[18px] h-[18px] text-muted-foreground" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  Desktop Notifications
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {systemNotificationsEnabled ? 'Enabled' : 'Disabled in System Preferences'}
                </p>
              </div>
            </div>
            <Toggle
              enabled={systemNotificationsEnabled}
              onChange={() => openNotificationSettings()}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Meeting Notifications Card */}
      <SettingsCard>
        <CardHeader
          title="Meeting Notifications"
          description="Configure when and how you want to be notified about meetings"
        />
        <div className="px-[20px] py-[20px] space-y-[24px]">
          {/* Notify before meetings */}
          <div className="space-y-[10px]">
            <div className="flex items-center gap-[8px]">
              <Bell className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="text-[14px] font-medium text-foreground">
                Notify me before meetings
              </span>
              {isSavingPrefs && (
                <Loader2 className="h-[14px] w-[14px] text-muted-foreground animate-spin ml-auto" />
              )}
            </div>
            <div className="flex gap-[8px]">
              {notifyOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleNotifyMinutesChange(option.value)}
                  disabled={isSavingPrefs}
                  className={`flex-1 py-[11px] rounded-[8px] text-[13px] font-medium leading-[19.5px] transition-colors disabled:opacity-60 ${
                    notifyMinutes === option.value
                      ? 'bg-primary/5 border border-primary text-primary'
                      : 'border border-input text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recording behavior */}
          <div className="space-y-[10px]">
            <div className="flex items-center gap-[8px]">
              <RecordIcon />
              <span className="text-[14px] font-medium text-foreground">
                Default recording behavior
              </span>
            </div>
            <div className="flex flex-col gap-[8px]">
              {behaviorOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleRecordingBehaviorChange(option.value)}
                  disabled={isSavingPrefs}
                  className={`w-full flex items-center gap-[12px] px-[17px] py-[15px] rounded-[10px] text-left transition-colors disabled:opacity-60 ${
                    recordingBehavior === option.value
                      ? 'bg-primary/5 border border-primary'
                      : 'border border-input hover:bg-secondary'
                  }`}
                >
                  <div className="flex-1 flex flex-col gap-[2px]">
                    <span className="text-[14px] font-medium text-foreground">
                      {option.title}
                    </span>
                    <span className="text-[12px] font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                  {/* Radio indicator */}
                  <div
                    className={`w-[18px] h-[18px] rounded-[9px] border-2 flex items-center justify-center shrink-0 ${
                      recordingBehavior === option.value
                        ? 'border-primary'
                        : 'border-input'
                    }`}
                  >
                    {recordingBehavior === option.value && (
                      <div className="w-[8px] h-[8px] rounded-[4px] bg-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

export default NotificationsPanel;
