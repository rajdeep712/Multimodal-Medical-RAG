import React, { useRef, useEffect, useState } from 'react';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import {
  Menu,
  Sparkles,
  MessageSquare,
  HelpCircle,
  FileCheck,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  PanelLeftOpen,
  PanelRightOpen,
  Download,
  FileText,
  Printer,
} from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';
import { ChatMessage } from './ChatMessage.tsx';
import { ChatComposer } from './ChatComposer.tsx';
import { ConversationSidebar } from './ConversationSidebar.tsx';
import { ProfileDropdown } from '../profile/ProfileDropdown.tsx';

/** Centered date chip label for the chat stream: Today / Yesterday /
    weekday (within a week) / full date for older days. */
const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  const daysBack = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (daysBack < 7) return format(d, 'EEEE');
  return format(d, 'dd MMMM yyyy');
};

const SUGGESTED_PROMPTS = [
  {
    title: 'Summarize my latest blood report',
    description: 'Get an overview of hematology and metabolic panels',
    badge: 'CBC & CMP',
  },
  {
    title: 'Explain the abnormal values in my CBC',
    description: 'Analyze low platelets and reference range flags',
    badge: 'Lab Focus',
  },
  {
    title: 'What medications are mentioned in my prescription?',
    description: 'Review Augmentin dosage, schedule, and warnings',
    badge: 'Rx Regimen',
  },
  {
    title: 'Compare findings across my medical reports',
    description: 'Correlate chest radiograph with lab results',
    badge: 'Multimodal',
  },
];

interface ChatPanelProps {
  isDocumentCollapsed?: boolean;
  onToggleDocumentPanel?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isDocumentCollapsed = false,
  onToggleDocumentPanel,
}) => {
  const {
    conversation,
    sendMessage,
    isStreaming,
    isLoadingChat,
  } = useChatStore();

  const [showHistory, setShowHistory] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Exporting needs an opened chat with messages to export.
  const canExport = !!conversation && conversation.messages.length > 0;

  // "Scroll to bottom" button: visible once the user scrolls up past a
  // threshold. While the user is away from the bottom, the per-delta
  // stick-to-bottom during streaming pauses (they may be reading history);
  // clicking the button (or reaching the bottom) resumes it.
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAtBottomRef = useRef(true);

  const handleScrollerScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 250);
    isAtBottomRef.current = distanceFromBottom < 80;
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  };
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleExportMarkdown = () => {
    if (!conversation) return;
    const mdContent = `# MEDILENS CLINICAL CONSULTATION REPORT\n\n**Title:** ${conversation.title}\n**Date:** ${new Date(conversation.updatedAt).toLocaleString()}\n\n---\n\n` +
      conversation.messages.map(m => `### ${m.role.toUpperCase()} (${m.createdAt})\n\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.title.replace(/\s+/g, '_')}_clinical_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportPrintablePDF = () => {
    if (!conversation) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <title>${conversation.title} - Clinical Consultation Report</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 40px; color: #123047; line-height: 1.6; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 20px; border-bottom: 2px solid #087F8C; padding-bottom: 8px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #64748B; margin-bottom: 24px; }
        .message { margin-bottom: 20px; padding: 16px; border-radius: 12px; border: 1px solid #E2E8F0; background: #F8FAFC; page-break-inside: avoid; }
        .message.user { background: #DDF4F5; border-color: #087F8C; }
        .role { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #087F8C; margin-bottom: 6px; }
        .content { font-size: 13px; white-space: pre-wrap; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>MEDILENS AI - CLINICAL CONSULTATION REPORT</h1>
      <div class="meta"><strong>Topic:</strong> ${conversation.title} | <strong>Generated:</strong> ${new Date().toLocaleString()}</div>
      ${conversation.messages.map(m => `
        <div class="message ${m.role}">
          <div class="role">${m.role === 'user' ? 'Patient / Clinician Inquiry' : 'MediLens Clinical Synthesis'}</div>
          <div class="content">${m.content}</div>
        </div>
      `).join('')}
      <script>
        window.onload = () => { window.print(); };
      </script>
    </body>
    </html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setShowExportMenu(false);
  };

  // Scroll anchoring: when a query is sent, position the user's message just
  // below the navbar (16px separation) so the thinking orb and the streamed
  // answer unfold right under it. Restores and completed answers keep their
  // own behaviour. (Native scrolling — Lenis was removed here: it
  // initialised before content existed, computed a scroll limit of 0 and
  // then pinned all programmatic scrolling.)
  const prevChatIdRef = useRef<string | null>(null);
  const lastQueryScrollRef = useRef<string | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    const messages = conversation?.messages || [];
    if (!scroller || !messages.length) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const chatChanged = prevChatIdRef.current !== conversation.id;
    prevChatIdRef.current = conversation.id;

    // While a query streams: anchor the query just below the navbar ONCE, then
    // follow the bottom per delta so the streamed answer stays visible (the
    // query scrolls away as the answer outgrows the viewport — ChatGPT-style).
    if (isStreaming && lastUser) {
      if (lastUser.id !== lastQueryScrollRef.current) {
        lastQueryScrollRef.current = lastUser.id;
        const el = scroller.querySelector(`[data-message-id="${lastUser.id}"]`);
        if (!el) return;
        const top =
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          16;
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        isAtBottomRef.current = false;
      } else if (isAtBottomRef.current) {
        // Follow the stream only while the user is at the bottom; if they
        // scrolled up to read, the scroll-to-bottom button takes over.
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' });
      }
      return;
    }

    // Restored or switched chat: land at the bottom. A completed answer does
    // not re-scroll, so the view stays anchored on the query.
    if (!isStreaming && chatChanged) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation, isStreaming]);

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const messages = conversation?.messages || [];

  // While the document panel is collapsed the history docks open as an inline
  // left column; restoring the panel returns to the overlay drawer (closed).
  useEffect(() => {
    if (isDocumentCollapsed) {
      setShowHistory(true);
    } else {
      setShowHistory(false);
    }
  }, [isDocumentCollapsed]);

  const historyDocked = isDocumentCollapsed && showHistory;

  return (
    <div
      className={`h-full bg-[#F7FAFC] border-r border-[#E2E8F0] select-text relative ${
        historyDocked ? 'flex flex-row' : 'flex flex-col'
      }`}
    >
      {/* Docked history column (document panel collapsed) — stays mounted so
          the exit slide plays when it closes */}
      {isDocumentCollapsed && (
        <ConversationSidebar isOpen={showHistory} onClose={() => setShowHistory(false)} docked />
      )}

      {/* Overlay drawer (document panel open — unchanged behaviour) */}
      {!isDocumentCollapsed && (
        <ConversationSidebar
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Chat column */}
      <div className="relative flex-1 min-w-0 h-full flex flex-col">

      {/* --- Top Chat Header --- */}
      <div className="h-14 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Top-left menu button: opens/collapses the history panel; swaps to
              a left-panel icon on hover */}
          <Tooltip>
            <TooltipTrigger
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="group w-8 h-8 rounded-xl bg-gradient-to-br from-[#123047] to-[#087F8C] text-white flex items-center justify-center shrink-0 shadow-2xs hover:opacity-90 transition-opacity cursor-pointer"
              aria-label="Toggle Consultation History"
            >
              <Menu className="w-4 h-4 group-hover:hidden" />
              <PanelLeftOpen className="w-4 h-4 hidden group-hover:block" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle Consultation History</TooltipContent>
          </Tooltip>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-[#123047] truncate leading-tight">
              {conversation?.title || 'Clinical Consultation'}
            </span>
            <span className="text-[10px] text-[#64748B] flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              Multimodal RAG Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Export Report Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl border bg-white border-[#CBD5E1] text-[#123047] hover:border-[#087F8C] hover:bg-[#F8FAFC] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-2xs"
              title="Export clinical report"
            >
              <Download className="w-3.5 h-3.5 text-[#087F8C]" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-2xl border border-[#CBD5E1] py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                <div className="px-3 pb-2 mb-1 border-b border-[#F1F5F9]">
                  <span className="font-bold text-[#123047] uppercase tracking-wider text-[10px]">
                    Export Clinical Report
                  </span>
                </div>
                {!canExport && (
                  <div className="px-3 pb-1.5 text-[10px] text-slate-400 italic">
                    Start a conversation first — there is no chat to export yet.
                  </div>
                )}
                <button
                  onClick={handleExportPrintablePDF}
                  disabled={!canExport}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2.5 text-[#334155] transition-colors font-medium ${
                    canExport
                      ? 'hover:bg-[#F8FAFC] cursor-pointer'
                      : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <Printer className="w-4 h-4 text-[#087F8C]" />
                  <span>Printable PDF Report</span>
                </button>
                <button
                  onClick={handleExportMarkdown}
                  disabled={!canExport}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2.5 text-[#334155] transition-colors font-medium ${
                    canExport
                      ? 'hover:bg-[#F8FAFC] cursor-pointer'
                      : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <FileText className="w-4 h-4 text-[#087F8C]" />
                  <span>Markdown File (.md)</span>
                </button>
              </div>
            )}
          </div>

          {/* Profile and Toggle Document Button when Right Panel is Collapsed */}
          {isDocumentCollapsed && (
            <div className="hidden lg:flex items-center gap-2 pl-1 border-l border-slate-200">
              <ProfileDropdown />
              {onToggleDocumentPanel && (
                <button
                  onClick={onToggleDocumentPanel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] text-[#087F8C] hover:bg-[#DDF4F5] hover:border-[#087F8C] transition-all text-xs font-bold shadow-2xs cursor-pointer"
                  title="Open Document Viewer"
                >
                  <PanelRightOpen className="w-4 h-4" />
                  <span>Show Document</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Message Stream Area: the scroll container is full-width so its
          scrollbar sits at the screen edge; the content centers itself while
          the document panel is collapsed --- */}
      <div
        ref={scrollRef}
        onScroll={handleScrollerScroll}
        className="flex-1 overflow-y-auto scroll-smooth"
      >
        <div className={`p-4 sm:p-6 min-h-full flex flex-col ${isDocumentCollapsed ? 'max-w-3xl mx-auto w-full' : 'w-full'}`}>
          {isLoadingChat ? (
            /* Skeleton loader while a previous chat loads from the DB */
            <div className="space-y-6" aria-label="Loading conversation">
              {/* user bubble skeleton */}
              <div className="flex justify-end">
                <div className="h-9 w-56 rounded-2xl bg-[#DDF4F5]/60 animate-pulse" />
              </div>
              {/* assistant card skeleton */}
              <div className="max-w-[88%] bg-white rounded-2xl p-4 sm:p-5 border border-[#E2E8F0] shadow-xs space-y-3">
                <div className="h-3 w-2/5 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-11/12 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-10/12 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-8/12 rounded bg-slate-100 animate-pulse" />
                <div className="h-16 w-full rounded-xl bg-slate-100 animate-pulse" />
              </div>
              {/* user bubble skeleton */}
              <div className="flex justify-end">
                <div className="h-9 w-72 rounded-2xl bg-[#DDF4F5]/60 animate-pulse" />
              </div>
              {/* assistant card skeleton */}
              <div className="max-w-[88%] bg-white rounded-2xl p-4 sm:p-5 border border-[#E2E8F0] shadow-xs space-y-3">
                <div className="h-3 w-1/3 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-9/12 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-11/12 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-7/12 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Empty Chat State */
            <div className="flex-1 flex flex-col justify-center items-center text-center max-w-lg mx-auto py-8">
              <div className="w-14 h-14 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center text-[#087F8C] mb-4">
                <Stethoscope className="w-7 h-7" />
              </div>

              <h3 className="text-xl font-extrabold text-[#123047] tracking-tight">
                How can I help you understand your documents?
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] mt-2 mb-8 leading-relaxed max-w-md">
                Ask questions about your uploaded laboratory reports, prescriptions, or imaging summaries. Every answer links to verifiable source evidence.
              </p>

              {/* 4 Clickable Suggested Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {SUGGESTED_PROMPTS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePromptClick(item.title)}
                    className="p-3.5 rounded-2xl bg-white border border-[#CBD5E1] hover:border-[#087F8C] hover:bg-[#DDF4F5]/30 hover:shadow-sm text-left transition-all duration-150 group flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-[#087F8C] uppercase tracking-wider block mb-1">
                        {item.badge}
                      </span>
                      <h4 className="text-xs font-bold text-[#123047] group-hover:text-[#087F8C] transition-colors leading-tight">
                        "{item.title}"
                      </h4>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-2 line-clamp-1">
                      {item.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Render Messages — with a centered date chip whenever the day
               changes (covers opened chats and next-day replies alike) */
            <div className="space-y-2">
              {messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null;
                const showDateChip =
                  !prev || !isSameDay(new Date(prev.createdAt), new Date(msg.createdAt));
                return (
                  <React.Fragment key={msg.id}>
                    {showDateChip && (
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 rounded-full bg-white border border-[#E2E8F0] text-[10px] font-bold text-[#64748B] shadow-xs tracking-wide">
                          {dayLabel(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <div data-message-id={msg.id}>
                      <ChatMessage
                        message={msg}
                        onSelectPrompt={(p) => handlePromptClick(p)}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- Composer at Bottom (centered with the content when collapsed) --- */}
      <div className={`relative ${isDocumentCollapsed ? 'max-w-3xl mx-auto w-full shrink-0' : 'w-full shrink-0'}`}>
        {/* Scroll-to-bottom pill — floats above the composer when the user has
            scrolled up */}
        {showScrollButton && (
          <Tooltip>
            <TooltipTrigger
              onClick={scrollToBottom}
              className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-[#CBD5E1] shadow-lg text-[#123047] hover:bg-[#DDF4F5] hover:border-[#087F8C] hover:text-[#087F8C] transition-all cursor-pointer"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent side="top">Scroll to latest messages</TooltipContent>
          </Tooltip>
        )}
        <ChatComposer isDocumentCollapsed={isDocumentCollapsed} />
      </div>
      </div>
    </div>
  );
};
