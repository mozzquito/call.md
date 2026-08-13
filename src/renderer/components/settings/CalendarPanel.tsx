/**
 * Calendar Panel Component
 *
 * Settings panel for connecting/disconnecting Google Calendar.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Check,
  Loader2,
  LogOut,
  RefreshCw,
  AlertCircle,
  Bell,
} from 'lucide-react';
import type { UpcomingMeeting } from '../../../shared/types/calendar.types';
import { trpc } from '../../api/trpc';

type RecordingBehavior = 'always_ask' | 'default_record' | 'no_notification';

type CalendarStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Status Badge Component
function StatusBadge({ status }: { status: CalendarStatus }) {
  switch (status) {
    case 'connected':
      return (
        <div className="flex items-center gap-[6px] px-[10px] py-[4px] bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-[8px]">
          <Check className="h-[14px] w-[14px] text-emerald-600 dark:text-emerald-400" />
          <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
        </div>
      );
    case 'connecting':
      return (
        <div className="flex items-center gap-[6px] px-[10px] py-[4px] bg-accent border border-primary/30 rounded-[8px] animate-pulse">
          <Loader2 className="h-[14px] w-[14px] text-primary animate-spin" />
          <span className="text-[13px] font-medium text-primary">Connecting...</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-[6px] px-[10px] py-[4px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-[8px]">
          <AlertCircle className="h-[14px] w-[14px] text-red-600 dark:text-red-400" />
          <span className="text-[13px] font-medium text-red-600 dark:text-red-400">Error</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-[6px] px-[10px] py-[4px] bg-secondary border border-border rounded-[8px]">
          <span className="text-[13px] font-medium text-muted-foreground">Not Connected</span>
        </div>
      );
  }
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

export function CalendarPanel() {
  const [status, setStatus] = useState<CalendarStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingMeeting[]>([]);

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

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();

    // Listen for events updates
    const unsubscribe = window.electronAPI.calendarOn.onEventsUpdated((events) => {
      setUpcomingEvents(events);
    });

    // Listen for auth required
    const unsubAuthRequired = window.electronAPI.calendarOn.onAuthRequired(() => {
      setStatus('error');
      setError('Calendar session expired. Please reconnect.');
    });

    return () => {
      unsubscribe();
      unsubAuthRequired();
    };
  }, []);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.calendar.isSignedIn();
      if (result.success && result.isSignedIn) {
        setStatus('connected');
        // Fetch initial events
        const eventsResult = await window.electronAPI.calendar.getUpcomingEvents(24);
        if (eventsResult.success && eventsResult.events) {
          setUpcomingEvents(eventsResult.events);
        }
      } else {
        setStatus('disconnected');
      }
      setError(null);
    } catch (err) {
      setStatus('error');
      setError('Failed to check calendar status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setStatus('connecting');
    setError(null);
    try {
      const result = await window.electronAPI.calendar.signIn();
      if (result.success) {
        setStatus('connected');
        // Fetch events after connecting
        const eventsResult = await window.electronAPI.calendar.getUpcomingEvents(24);
        if (eventsResult.success && eventsResult.events) {
          setUpcomingEvents(eventsResult.events);
        }
      } else {
        setStatus('error');
        setError(result.error || 'Failed to connect');
      }
    } catch (err) {
      setStatus('error');
      setError('Connection failed');
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.calendar.signOut();
      setStatus('disconnected');
      setUpcomingEvents([]);
      setError(null);
    } catch (err) {
      setError('Failed to disconnect');
    } finally {
      setIsLoading(false);
    }
  };

  const formatEventTime = (event: UpcomingMeeting) => {
    if (event.isAllDay) return 'All day';
    return event.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
    <div className="space-y-[16px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-foreground flex items-center gap-[8px]">
            <Calendar className="h-[18px] w-[18px]" />
            Google Calendar
          </h2>
          <p className="text-[13px] text-muted-foreground mt-[2px]">
            Get notified before your meetings start
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <StatusBadge status={status} />
          {status === 'connected' && (
            <button
              onClick={checkAuthStatus}
              disabled={isLoading}
              className="w-[32px] h-[32px] flex items-center justify-center border border-border rounded-[8px] bg-card hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-[14px] w-[14px] text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Connection Card */}
      <div className="bg-card border border-border rounded-[12px] shadow-[0px_1.272px_15.267px_0px_rgba(0,0,0,0.05)]">
        <div className="px-[20px] py-[16px] border-b border-border">
          <h3 className="text-[15px] font-semibold text-foreground">Calendar Connection</h3>
          <p className="text-[13px] text-muted-foreground mt-[4px]">
            Connect your Google Calendar to receive notifications 2 minutes before meetings start.
          </p>
        </div>
        <div className="px-[20px] py-[20px]">
          {error && (
            <div className="p-[12px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-[10px] mb-[16px]">
              <p className="text-[13px] text-red-600 dark:text-red-400 flex items-center gap-[8px]">
                <AlertCircle className="h-[14px] w-[14px]" />
                {error}
              </p>
            </div>
          )}

          {status === 'disconnected' && (
            <div className="flex flex-col items-center py-[32px]">
              <div className="w-[48px] h-[48px] flex items-center justify-center bg-secondary rounded-[12px] mb-[16px]">
                <Calendar className="h-[24px] w-[24px] text-muted-foreground" />
              </div>
              <p className="text-[14px] text-muted-foreground text-center mb-[16px]">
                Connect your Google Calendar to get started
              </p>
              <button
                onClick={handleConnect}
                className="flex items-center gap-[8px] px-[16px] py-[10px] bg-primary hover:bg-primary/90 text-white text-[14px] font-medium rounded-[10px] transition-colors"
              >
                <Calendar className="h-[16px] w-[16px]" />
                Connect Google Calendar
              </button>
            </div>
          )}

          {status === 'connecting' && (
            <div className="flex flex-col items-center py-[32px]">
              <Loader2 className="h-[48px] w-[48px] text-primary mb-[16px] animate-spin" />
              <p className="text-[14px] text-muted-foreground text-center">
                Connecting to Google Calendar...
              </p>
              <p className="text-[12px] text-muted-foreground text-center mt-[8px]">
                A browser window will open for authorization
              </p>
            </div>
          )}

          {status === 'connected' && (
            <div className="space-y-[16px]">
              <div className="flex items-center justify-between p-[12px] bg-emerald-50 dark:bg-emerald-950/30 rounded-[10px]">
                <div className="flex items-center gap-[8px]">
                  <Check className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[14px] font-medium text-emerald-600 dark:text-emerald-400">
                    Calendar connected
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="flex items-center gap-[6px] px-[12px] py-[6px] border border-border rounded-[8px] bg-card hover:bg-secondary text-[13px] font-medium text-muted-foreground transition-colors disabled:opacity-50"
                >
                  <LogOut className="h-[14px] w-[14px]" />
                  Disconnect
                </button>
              </div>

              {/* Upcoming Events Preview */}
              {upcomingEvents.length > 0 && (
                <div className="space-y-[8px]">
                  <h4 className="text-[14px] font-medium text-foreground">
                    Upcoming Meetings (next 24h)
                  </h4>
                  <div className="space-y-[8px] max-h-[192px] overflow-y-auto">
                    {upcomingEvents.slice(0, 5).map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-[10px] bg-secondary rounded-[8px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-foreground truncate">{event.summary}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {formatEventTime(event)}
                            {event.minutesUntil > 0 && event.minutesUntil <= 60 && (
                              <span className="ml-[8px] text-primary">
                                in {event.minutesUntil}m
                              </span>
                            )}
                          </p>
                        </div>
                        {event.meetLink && (
                          <div className="px-[8px] py-[2px] bg-card border border-border rounded-[6px] ml-[8px]">
                            <span className="text-[11px] font-medium text-muted-foreground">Meet</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {upcomingEvents.length > 5 && (
                    <p className="text-[12px] text-muted-foreground text-center">
                      +{upcomingEvents.length - 5} more events
                    </p>
                  )}
                </div>
              )}

              {upcomingEvents.length === 0 && (
                <p className="text-[14px] text-muted-foreground text-center py-[16px]">
                  No upcoming meetings in the next 24 hours
                </p>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center py-[32px]">
              <div className="w-[48px] h-[48px] flex items-center justify-center bg-red-50 dark:bg-red-950/30 rounded-[12px] mb-[16px]">
                <AlertCircle className="h-[24px] w-[24px] text-red-600 dark:text-red-400" />
              </div>
              <p className="text-[14px] text-muted-foreground text-center mb-[16px]">
                {error || 'Something went wrong'}
              </p>
              <button
                onClick={handleConnect}
                className="flex items-center gap-[8px] px-[16px] py-[10px] bg-primary hover:bg-primary/90 text-white text-[14px] font-medium rounded-[10px] transition-colors"
              >
                <RefreshCw className="h-[16px] w-[16px]" />
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notification Preferences Card - Only show when connected */}
      {status === 'connected' && (
        <div className="bg-card border border-border rounded-[12px] shadow-[0px_1.272px_15.267px_0px_rgba(0,0,0,0.05)]">
          <div className="px-[20px] py-[16px] border-b border-border">
            <h3 className="text-[15px] font-semibold text-foreground">Notification Preferences</h3>
            <p className="text-[13px] text-muted-foreground mt-[4px]">
              Configure when and how you want to be notified about meetings
            </p>
          </div>
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
        </div>
      )}

    </div>
  );
}

export default CalendarPanel;
