import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import {
  FileSearch,
  Plus,
  Sparkles,
  History,
  MessageSquare,
  HelpCircle,
  FileCheck,
  ChevronRight,
  Stethoscope,
  PanelRightOpen,
  Download,
  FileText,
  Printer,
  Sun,
  Moon,
} from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useThemeStore } from '../../stores/useThemeStore.ts';
import { ChatMessage } from './ChatMessage.tsx';
import { ChatComposer } from './ChatComposer.tsx';
import { ConversationSidebar } from './ConversationSidebar.tsx';
import { ProfileDropdown } from '../profile/ProfileDropdown.tsx';

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
    startNewChat,
    sendMessage,
    isStreaming,
  } = useChatStore();
  const { theme, toggleTheme } = useThemeStore();

  const [showHistory, setShowHistory] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Lenis smooth momentum scrolling setup
  useEffect(() => {
    if (!scrollRef.current) return;
    const lenis = new Lenis({
      wrapper: scrollRef.current,
      content: scrollRef.current.firstElementChild as HTMLElement,
      lerp: 0.12,
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const animId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(animId);
      lenis.destroy();
    };
  }, []);

  // Auto-scroll to bottom on new messages with smooth behavior
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [conversation?.messages, isStreaming]);

  const handlePromptClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const messages = conversation?.messages || [];

  return (
    <div className="h-full flex flex-col bg-[#F7FAFC] border-r border-[#E2E8F0] select-text relative">
      {/* Conversation Sidebar Drawer (opens over chat screen, closes on outside click) */}
      <ConversationSidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />

      {/* --- Top Chat Header --- */}
      <div className="h-14 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            to="/"
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#123047] to-[#087F8C] text-white flex items-center justify-center shrink-0 shadow-2xs hover:opacity-90 transition-opacity cursor-pointer"
            title="MediLens AI Home"
          >
            <FileSearch className="w-4 h-4" />
          </Link>
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
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border bg-white border-[#E2E8F0] text-slate-500 hover:text-[#123047] hover:bg-slate-50 transition-all cursor-pointer"
            title={theme === 'dark' ? 'Switch to Clinical Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#087F8C]" />}
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showHistory
                ? 'bg-[#DDF4F5] border-[#087F8C] text-[#087F8C]'
                : 'bg-white border-[#E2E8F0] text-slate-500 hover:text-[#123047] hover:bg-slate-50'
            }`}
            title="Open Consultation History"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            onClick={startNewChat}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#123047] text-white hover:bg-[#087F8C] transition-all shadow-2xs cursor-pointer"
            title="Start New Chat"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>

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
                <button
                  onClick={handleExportPrintablePDF}
                  className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-[#F8FAFC] text-[#334155] cursor-pointer transition-colors font-medium"
                >
                  <Printer className="w-4 h-4 text-[#087F8C]" />
                  <span>Printable PDF Report</span>
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-[#F8FAFC] text-[#334155] cursor-pointer transition-colors font-medium"
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

      {/* --- Centered Content Container when Right Panel is Collapsed --- */}
      <div className={`flex-1 flex flex-col overflow-hidden ${isDocumentCollapsed ? 'max-w-3xl mx-auto w-full' : 'w-full'}`}>
        {/* --- Message Stream Area --- */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
          {messages.length === 0 ? (
            /* Empty Chat State */
            <div className="h-full flex flex-col justify-center items-center text-center max-w-lg mx-auto py-8">
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
            /* Render Messages */
            <div className="space-y-2">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onRetry={() => {
                    if (msg.role === 'assistant') {
                      const lastUserMsg = messages
                        .slice(0, messages.indexOf(msg))
                        .filter((m) => m.role === 'user')
                        .pop();
                      if (lastUserMsg) sendMessage(lastUserMsg.content);
                    }
                  }}
                  onSelectPrompt={(p) => handlePromptClick(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* --- Composer at Bottom --- */}
        <ChatComposer isDocumentCollapsed={isDocumentCollapsed} />
      </div>
    </div>
  );
};
