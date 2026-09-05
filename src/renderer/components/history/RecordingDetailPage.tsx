/**
 * Recording Detail Page
 *
 * Full page view for a recording with:
 * - Header: back button, title, metadata, actions
 * - Left panel: Meeting summary, key points, checklist
 * - Right panel: Video player, chat button
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  List,
  CheckSquare,
  MessageCircle,
  Sparkles,
  Upload,
  Link2,
  ChevronDown,
  Check,
  Loader2,
  Video,
  Copy,
} from 'lucide-react';
import { trpc } from '../../api/trpc';
import type { Recording } from '../../../shared/schemas/recording.schema';
import { formatDate, formatDurationMinutes, cn } from '../../lib/utils';

interface RecordingDetailPageProps {
  recordingId: number;
  onBack: () => void;
}

export function RecordingDetailPage({ recordingId, onBack }: RecordingDetailPageProps) {
  const [showAllKeyPoints, setShowAllKeyPoints] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  // Fetch recording data
  const { data: recording, isLoading } = trpc.recordings.get.useQuery(
    { recordingId },
    { enabled: !!recordingId }
  );

  // Populate collectionId if missing
  const populateCollectionIdMutation = trpc.recordings.populateCollectionId.useMutation();

  useEffect(() => {
    if (recording?.videoId && !recording?.collectionId && !collectionId) {
      populateCollectionIdMutation.mutateAsync({ recordingId }).then((result) => {
        if (result.collectionId) {
          setCollectionId(result.collectionId);
        }
      });
    } else if (recording?.collectionId) {
      setCollectionId(recording.collectionId);
    }
  }, [recording?.videoId, recording?.collectionId, recordingId]);

  if (isLoading) {
    return (
      <div className="bg-[#f7f7f7] h-full flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#ec5b16] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="bg-[#f7f7f7] h-full flex flex-col items-center justify-center gap-4">
        <p className="text-[#464646]">Recording not found</p>
        <button
          onClick={onBack}
          className="text-[#ec5b16] hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const title = recording.meetingName || `Recording - ${formatDate(recording.createdAt)}`;
  const isVideoReady = recording.status === 'available' && !!recording.playerUrl;

  return (
    <div className="bg-[#f7f7f7] h-full flex flex-col pt-[10px] px-[10px]">
      {/* Header */}
      <Header
        title={title}
        recordingId={recordingId}
        createdAt={recording.createdAt}
        duration={recording.duration}
        playerUrl={recording.playerUrl}
        onBack={onBack}
      />

      {/* Main Content */}
      <div className="flex-1 bg-white border border-[#efefef] rounded-[20px] p-[20px] pb-[40px] flex gap-[30px] overflow-hidden mb-[10px]">
        {/* Left Panel - Meeting Insights (scrollable) */}
        <div className="flex-1 flex flex-col gap-[30px] min-w-0 overflow-y-auto pr-[10px]">
          {/* Section Header */}
          <div className="flex items-center gap-[4px]">
            <Sparkles className="h-5 w-5 text-[#ec5b16]" />
            <h2 className="text-[18px] font-semibold text-black tracking-[0.09px]">
              Meeting Insights
            </h2>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-[20px] pb-[20px]">
            {/* Meeting Summary Card */}
            <SummaryCard summary={recording.shortOverview} summaryTh={recording.shortOverviewTh} />

            {/* Key Points Card */}
            <KeyPointsCard
              keyPoints={recording.keyPoints}
              keyPointsTh={recording.keyPointsTh}
              expanded={showAllKeyPoints}
              onToggle={() => setShowAllKeyPoints(!showAllKeyPoints)}
            />

            {/* Action Items Card (Post-Meeting Checklist) */}
            <ActionItemsCard
              recordingId={recordingId}
              checklist={recording.postMeetingChecklist}
              checklistTh={recording.postMeetingChecklistTh}
              completedIndices={recording.postMeetingChecklistCompleted}
            />

            {/* Second-Opinion Summaries (zcode + agy). Keyed by recordingId so
                switching recordings remounts it cleanly - otherwise stale
                results (or an in-flight generation's .then) from the
                previous recording could bleed into the new one's state. */}
            <SecondOpinionSection key={recordingId} recordingId={recordingId} />
          </div>
        </div>

        {/* Right Panel - Video & Transcript (sticky) */}
        <div className="flex-1 flex flex-col gap-[30px] min-w-0 sticky top-0 self-start">
          {/* Video Player */}
          <VideoPlayerSection
            playerUrl={recording.playerUrl}
            isReady={isVideoReady}
          />

          {/* Chat with Video Button */}
          <div className="flex justify-center">
            <ChatWithVideoButton
              title={title}
              videoId={recording.videoId}
              collectionId={collectionId}
              disabled={!isVideoReady}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface HeaderProps {
  title: string;
  recordingId: number;
  createdAt: string;
  duration: number | null;
  playerUrl: string | null | undefined;
  onBack: () => void;
}

function Header({ title, recordingId, createdAt, duration, playerUrl, onBack }: HeaderProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [exportOpen, setExportOpen] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState(false);

  const downloadVideoMutation = trpc.recordings.downloadVideo.useMutation();

  const handleCopyLink = async () => {
    if (!playerUrl || copyState !== 'idle') return;

    setCopyState('copying');
    await navigator.clipboard.writeText(playerUrl);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  const handleDownloadVideo = async () => {
    setDownloadingVideo(true);
    setExportOpen(false);
    try {
      const result = await downloadVideoMutation.mutateAsync({ recordingId });
      window.open(result.downloadUrl, '_blank');
    } catch (error) {
      console.error('Failed to download video:', error);
    } finally {
      setDownloadingVideo(false);
    }
  };

  return (
    <div className="flex gap-[12px] items-start p-[20px]">
      {/* Left: Back + Title */}
      <div className="flex-1 flex gap-[16px] items-start">
        {/* Back Button */}
        <div className="pt-[2px]">
          <button
            onClick={onBack}
            className="w-[28px] h-[28px] bg-white border border-black/20 rounded-[6.5px] flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-[15px] w-[15px] text-black" />
          </button>
        </div>

        {/* Title & Metadata */}
        <div className="flex-1 flex flex-col gap-[10px]">
          <h1 className="text-[24px] font-semibold text-black tracking-[0.12px]">
            {title}
          </h1>
          <div className="flex items-center gap-[20px]">
            {/* Date */}
            <div className="flex items-center gap-[4px]">
              <Calendar className="h-4 w-4 text-[#969696]" />
              <span className="text-[14px] text-[#464646] tracking-[0.07px]">
                {formatDate(createdAt)}
              </span>
            </div>
            {/* Duration */}
            {duration && (
              <div className="flex items-center gap-[8px]">
                <Clock className="h-4 w-4 text-[#969696]" />
                <span className="text-[14px] text-[#464646] tracking-[0.07px]">
                  {formatDurationMinutes(duration)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex gap-[12px] items-start">
        {/* Export Button with Dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            disabled={downloadingVideo}
            className={cn(
              "flex items-center gap-[6px] border rounded-[12px] px-[16px] py-[12px] shadow-[0px_1.27px_15.27px_0px_rgba(0,0,0,0.05)] transition-colors",
              exportOpen
                ? "bg-[#fff5ec] border-[#ffcfa5]"
                : "bg-white border-[#efefef] hover:bg-[#efefef] hover:border-[#969696]"
            )}
          >
            {downloadingVideo ? (
              <Loader2 className="h-5 w-5 text-black animate-spin" />
            ) : (
              <Upload className="h-5 w-5 text-black" />
            )}
            <span className="text-[14px] font-semibold text-black tracking-[-0.28px]">
              Export
            </span>
            <ChevronDown className="h-5 w-5 text-black" />
          </button>

          {/* Dropdown Menu */}
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-[#efefef] rounded-[12px] shadow-[0px_17px_17px_0px_rgba(0,0,0,0.12),0px_4px_9px_0px_rgba(0,0,0,0.14)] p-[8px] min-w-[180px]">
                <button
                  onClick={handleDownloadVideo}
                  className="w-full flex items-center gap-[6px] px-[10px] py-[8px] rounded-[10px] hover:bg-[#efefef] transition-colors"
                >
                  <Video className="h-5 w-5 text-black" />
                  <span className="text-[13px] font-medium text-black">Video</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Copy Video Link Button */}
        <button
          onClick={handleCopyLink}
          disabled={!playerUrl || copyState !== 'idle'}
          className={cn(
            "flex items-center gap-[4px] rounded-[12px] px-[14px] py-[12px] shadow-[0px_1.27px_15.27px_0px_rgba(0,0,0,0.05)] transition-colors",
            copyState === 'copied' ? "bg-[#007657]" :
            copyState === 'copying' ? "bg-[#ff7e32]" :
            "bg-[#ff4000] hover:bg-[#cc2b02]",
            !playerUrl && "opacity-50 cursor-not-allowed"
          )}
        >
          {copyState === 'copied' ? (
            <Check className="h-5 w-5 text-white" />
          ) : copyState === 'copying' ? (
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Link2 className="h-5 w-5 text-white" />
          )}
          <span className="text-[14px] font-semibold text-white tracking-[-0.28px]">
            {copyState === 'copied' ? "Link copied!" :
             copyState === 'copying' ? "Creating link..." :
             "Copy video link"}
          </span>
        </button>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  summary: string | null | undefined;
  summaryTh?: string | null;
}

function SummaryCard({ summary, summaryTh }: SummaryCardProps) {
  const [copied, setCopied] = useState(false);

  if (!summary) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summaryTh ? `${summary}\n\n${summaryTh}` : summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#fff5ec] border border-[#ffe9d3] rounded-[16px] p-[20px] flex flex-col gap-[16px]">
      {/* Header */}
      <div className="flex items-center gap-[8px]">
        <FileText className="h-5 w-5 text-[#ec5b16]" />
        <h3 className="flex-1 text-[16px] font-medium text-black tracking-[0.08px]">
          Meeting Summary
        </h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] text-[12px] font-medium text-[#ec5b16] hover:bg-[#ffe9d3] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {/* Content */}
      <p className="text-[14px] text-[#2d2d2d] leading-[20px] tracking-[0.07px]">
        {summary}
      </p>
      {/* Thai translation (Feature 4) */}
      {summaryTh && (
        <>
          <div className="border-t border-[#ffe9d3]" />
          <p className="text-[14px] text-[#464646] leading-[20px] tracking-[0.07px]">
            {summaryTh}
          </p>
        </>
      )}
    </div>
  );
}

interface KeyPointsCardProps {
  keyPoints: Array<{ topic: string; points: string[] }> | null | undefined;
  keyPointsTh?: Array<{ topic: string; points: string[] }> | null;
  expanded: boolean;
  onToggle: () => void;
}

function KeyPointsCard({ keyPoints, keyPointsTh, expanded, onToggle }: KeyPointsCardProps) {
  const [copied, setCopied] = useState(false);

  if (!keyPoints || keyPoints.length === 0) return null;

  const formatKeyPoints = (points: Array<{ topic: string; points: string[] }>) =>
    points.map((kp, idx) => {
      const items = kp.points.map(p => `  • ${p}`).join('\n');
      return `${idx + 1}. ${kp.topic}\n${items}`;
    }).join('\n\n');

  const handleCopy = async () => {
    let text = formatKeyPoints(keyPoints);
    if (keyPointsTh && keyPointsTh.length > 0) {
      text += `\n\n${formatKeyPoints(keyPointsTh)}`;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "bg-[#fff5ec] border border-[#ffe9d3] rounded-[16px] p-[20px] flex flex-col gap-[16px] relative overflow-hidden",
      !expanded && "max-h-[200px]"
    )}>
      {/* Header */}
      <div className="flex items-center gap-[8px]">
        <List className="h-5 w-5 text-[#ec5b16]" />
        <h3 className="flex-1 text-[16px] font-medium text-black tracking-[0.08px]">
          Key Points
        </h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] text-[12px] font-medium text-[#ec5b16] hover:bg-[#ffe9d3] transition-colors z-20"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col text-[14px] text-[#2d2d2d]">
        {keyPoints.map((kp, idx) => (
          <div key={idx} className="mb-2">
            <p className="font-semibold leading-[24px]">
              {idx + 1}. {kp.topic}
            </p>
            <ul className="list-disc ml-[42px]">
              {kp.points.map((point, pIdx) => (
                <li key={pIdx} className="leading-[24px]">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Thai translation (Feature 4) */}
      {keyPointsTh && keyPointsTh.length > 0 && (
        <>
          <div className="border-t border-[#ffe9d3]" />
          <div className="flex flex-col text-[14px] text-[#464646]">
            {keyPointsTh.map((kp, idx) => (
              <div key={idx} className="mb-2">
                <p className="font-semibold leading-[24px]">
                  {idx + 1}. {kp.topic}
                </p>
                <ul className="list-disc ml-[42px]">
                  {kp.points.map((point, pIdx) => (
                    <li key={pIdx} className="leading-[24px]">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Gradient Overlay & See More Button */}
      {!expanded && (
        <>
          <div className="absolute bottom-0 left-0 right-0 h-[52px] bg-gradient-to-t from-[#fff5ec] to-transparent pointer-events-none" />
          <button
            onClick={onToggle}
            className="absolute bottom-[6px] left-1/2 -translate-x-1/2 flex items-center gap-px bg-white border border-[#ffcfa5] rounded-full px-[12px] py-[8px] hover:bg-gray-50 transition-colors"
          >
            <span className="text-[13px] font-medium text-[#1f2937] tracking-[0.065px] px-[4px]">
              See more
            </span>
            <ChevronDown className="h-4 w-4 text-[#1f2937]" />
          </button>
        </>
      )}
    </div>
  );
}

interface ActionItemsCardProps {
  recordingId: number;
  checklist: string[] | null | undefined;
  checklistTh?: string[] | null;
  completedIndices: number[] | null | undefined;
}

function ActionItemsCard({ recordingId, checklist, checklistTh, completedIndices }: ActionItemsCardProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set(completedIndices || []));
  const [copied, setCopied] = useState(false);
  const updateChecklistMutation = trpc.recordings.updateChecklistCompletion.useMutation();

  // Sync local state when completedIndices changes
  useEffect(() => {
    setChecked(new Set(completedIndices || []));
  }, [completedIndices]);

  const handleCopy = async () => {
    if (!checklist) return;
    // Thai goes as an indented annotation under each item rather than a
    // second full block (KeyPointsCard's pattern) - a checklist repeated
    // twice with checkboxes both times would read as double the items.
    const lines = checklist.map((item, idx) => {
      const box = checked.has(idx) ? '[x]' : '[ ]';
      const line = `- ${box} ${item}`;
      const th = checklistTh?.[idx];
      // 2-space indent, not more: GFM treats >=4 spaces under a `- ` list
      // item as an indented code block, which would render the Thai line
      // as monospaced code in GitHub/Slack/Obsidian instead of plain text.
      return th ? `${line}\n  ${th}` : line;
    });
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = (idx: number) => {
    setChecked(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      // Persist to DB
      updateChecklistMutation.mutate({
        recordingId,
        completedIndices: Array.from(newSet),
      });
      return newSet;
    });
  };

  const isEmpty = !checklist || checklist.length === 0;

  return (
    <div className="bg-[#f7f7f7] border border-[#efefef] rounded-[16px] p-[20px] flex flex-col gap-[16px]">
      {/* Header */}
      <div className="flex items-center gap-[8px]">
        <CheckSquare className="h-5 w-5 text-[#ec5b16]" />
        <h3 className="flex-1 text-[16px] font-medium text-black tracking-[0.08px]">
          Action Items
        </h3>
        {!isEmpty && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-[4px] px-[10px] py-[6px] rounded-[8px] text-[12px] font-medium text-[#ec5b16] hover:bg-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>

      {/* Content */}
      {isEmpty ? (
        <p className="text-[14px] text-[#969696] italic">
          No post meeting agenda detected
        </p>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {checklist.map((item, idx) => {
            const isChecked = checked.has(idx);
            return (
              <div
                key={idx}
                onClick={() => handleToggle(idx)}
                className="bg-white border border-[#efefef] rounded-[8px] px-[16px] py-[12px] flex items-start gap-[12px] cursor-pointer hover:bg-gray-50 transition-colors"
              >
                {/* Checkbox */}
                <div className={cn(
                  "w-4 h-4 shrink-0 rounded border flex items-center justify-center mt-[2px]",
                  isChecked ? "bg-[#ec5b16] border-[#ec5b16]" : "border-[#ec5b16]"
                )}>
                  {isChecked && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="flex flex-col gap-[2px]">
                  <span className={cn(
                    "text-[14px] leading-[20px] tracking-[0.07px]",
                    isChecked ? "text-[#969696] line-through" : "text-black"
                  )}>
                    {item}
                  </span>
                  {/* Thai translation (Feature 4) - checklistTh is the same
                      length/order as checklist, so index alignment holds. */}
                  {checklistTh?.[idx] && (
                    <span className={cn(
                      "text-[13px] leading-[19px] tracking-[0.065px]",
                      isChecked ? "text-[#c0c0c0] line-through" : "text-[#969696]"
                    )}>
                      {checklistTh[idx]}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SecondOpinionProvider = 'zcode' | 'agy';

interface SecondOpinionState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  content?: string;
  error?: string;
}

const SECOND_OPINION_LABELS: Record<SecondOpinionProvider, string> = {
  zcode: 'zcode (GLM)',
  agy: 'agy (Gemini/Sonnet)',
};

interface SecondOpinionSectionProps {
  recordingId: number;
}

function SecondOpinionSection({ recordingId }: SecondOpinionSectionProps) {
  const [results, setResults] = useState<Record<SecondOpinionProvider, SecondOpinionState>>({
    zcode: { status: 'idle' },
    agy: { status: 'idle' },
  });

  // Load any previously-generated second opinions for this recording.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.secondOpinion.list({ recordingId }).then((res) => {
      if (cancelled || !res.success || !res.results) return;
      setResults((prev) => {
        const next = { ...prev };
        for (const row of res.results!) {
          if (row.provider !== 'zcode' && row.provider !== 'agy') continue;
          // Rows are ordered oldest-first; last one wins if generated more than once.
          next[row.provider] = row.status === 'ready'
            ? { status: 'ready', content: row.content ?? undefined }
            : { status: 'failed', error: row.error ?? undefined };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  const runProvider = (provider: SecondOpinionProvider) => {
    setResults((prev) => ({ ...prev, [provider]: { status: 'loading' } }));
    window.electronAPI.secondOpinion
      .generate({ recordingId, provider })
      .then((res) => {
        setResults((prev) => ({
          ...prev,
          [provider]: res.success
            ? { status: 'ready', content: res.content }
            : { status: 'failed', error: res.error },
        }));
      })
      .catch((err) => {
        setResults((prev) => ({
          ...prev,
          [provider]: { status: 'failed', error: err instanceof Error ? err.message : 'Request failed' },
        }));
      });
  };

  const handleGetSecondOpinion = () => {
    // Fired independently, not awaited sequentially - zcode and agy can
    // differ by 10s to 3 minutes, each card updates as its own call resolves.
    runProvider('zcode');
    runProvider('agy');
  };

  const isAnyLoading = results.zcode.status === 'loading' || results.agy.status === 'loading';
  const hasAnyResult = results.zcode.status !== 'idle' || results.agy.status !== 'idle';

  return (
    <div className="bg-[#f7f7f7] border border-[#efefef] rounded-[16px] p-[20px] flex flex-col gap-[16px]">
      <div className="flex items-center gap-[8px]">
        <Sparkles className="h-5 w-5 text-[#ec5b16]" />
        <h3 className="flex-1 text-[16px] font-medium text-black tracking-[0.08px]">
          Second Opinion
        </h3>
        <button
          onClick={handleGetSecondOpinion}
          disabled={isAnyLoading}
          className="flex items-center gap-[6px] px-[12px] py-[6px] rounded-[8px] text-[13px] font-medium text-[#ec5b16] border border-[#ffe9d3] hover:bg-[#fff5ec] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAnyLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {hasAnyResult ? 'Regenerate' : 'Get second opinion'}
        </button>
      </div>

      {!hasAnyResult ? (
        <p className="text-[13px] text-[#969696] italic">
          Runs the transcript through zcode and agy for an alternate summary. Can take up to a
          few minutes per provider.
        </p>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {(['zcode', 'agy'] as const).map((provider) => {
            const state = results[provider];
            if (state.status === 'idle') return null;
            return (
              <div key={provider} className="bg-white border border-[#efefef] rounded-[10px] p-[14px] flex flex-col gap-[8px]">
                <span className="text-[13px] font-semibold text-black">{SECOND_OPINION_LABELS[provider]}</span>
                {state.status === 'loading' && (
                  <span className="flex items-center gap-[6px] text-[13px] text-[#969696]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...
                  </span>
                )}
                {state.status === 'ready' && (
                  <p className="text-[13px] text-[#2d2d2d] leading-[19px] whitespace-pre-wrap">{state.content}</p>
                )}
                {state.status === 'failed' && (
                  <span className="text-[13px] text-[#d1242f]">{state.error || 'Failed to generate'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface VideoPlayerSectionProps {
  playerUrl: string | null | undefined;
  isReady: boolean;
}

function VideoPlayerSection({ playerUrl, isReady }: VideoPlayerSectionProps) {
  const embedUrl = playerUrl?.replace('/watch', '/embed');

  return (
    <div className="border border-[#efefef] rounded-[16px] px-[6px] py-[5px]">
      <div className="aspect-video rounded-[16px] border border-black/10 overflow-hidden bg-gray-100">
        {isReady && embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[#969696]">
            <Loader2 className="h-8 w-8 animate-spin text-[#ec5b16]" />
            <p className="text-[14px]">Loading the video...</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatWithVideoButtonProps {
  title: string
  videoId: string | null | undefined;
  collectionId: string | null | undefined;
  disabled: boolean;
}

function ChatWithVideoButton({ title, videoId, collectionId, disabled }: ChatWithVideoButtonProps) {
  const handleClick = () => {
    if (!videoId || !collectionId) return;
    const chatUrl = `https://chat.videodb.io?video_id=${videoId}&collection_id=${collectionId}&prompt=${title}`;
    window.electronAPI?.app.openExternalLink(chatUrl);
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || !videoId || !collectionId}
      className={cn(
        "w-[248px] h-[52px] rounded-[32px] shadow-[0px_2px_3px_0px_rgba(0,0,0,0.18)] relative overflow-hidden",
        (disabled || !videoId || !collectionId) && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Gradient Background */}
      <div
        className="absolute inset-0 rounded-[32px] border-2 border-[#494949]"
        style={{
          background: 'linear-gradient(260deg, rgb(0, 0, 0) 4.66%, rgb(30, 30, 30) 99.38%)',
        }}
      >
        <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_4px_4px_0px_rgba(255,255,255,0.32)]" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center gap-[6px]">
        <MessageCircle className="h-5 w-5 text-white" />
        <span className="text-[16px] font-medium text-white tracking-[-0.08px]">
          Chat with video
        </span>
      </div>
    </button>
  );
}

export default RecordingDetailPage;
