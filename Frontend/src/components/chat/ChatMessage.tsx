import React, { useState } from 'react';
import { ChatMessage as ChatMessageType } from '../../types/chat.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';
import { SourcesPanel } from './SourcesPanel.tsx';
import {
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Bot,
  User as UserIcon,
  Search,
} from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  onRetry?: () => void;
  onSelectPrompt?: (prompt: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRetry,
  onSelectPrompt,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="max-w-[85%] sm:max-w-[75%] bg-[#DDF4F5] text-[#123047] px-4 py-3 rounded-2xl rounded-tr-xs shadow-xs text-sm font-medium leading-relaxed border border-[#BDEFE7]">
          {message.content}
        </div>
      </div>
    );
  }


  return (
    <div className="flex items-start gap-3 mb-6 animate-in fade-in duration-200">
      {/* Assistant AI Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#123047] to-[#087F8C] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
        <Sparkles className="w-4 h-4 text-[#BDEFE7]" />
      </div>

      <div className="flex-1 min-w-0 bg-white rounded-2xl p-4 sm:p-5 border border-[#E2E8F0] shadow-xs">
        {/* Header telemetry / model name */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#F1F5F9] text-xs text-[#64748B]">
          <span className="font-bold text-[#123047] flex items-center gap-1.5">
            MediLens Clinical Synthesis
            {isStreaming && (
              <span className="w-2 h-2 rounded-full bg-[#087F8C] animate-pulse" />
            )}
          </span>

          <div className="flex items-center gap-2">
            {message.retrievalMetadata && (
              <span className="hidden sm:inline-flex text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                {message.retrievalMetadata.latencyMs}ms latency
              </span>
            )}
            <button
              onClick={handleCopy}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Copy message"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Retry response"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Rich Medical Markdown Content with Inline Citation Badges */}
        <div className="select-text">
          <MarkdownRenderer
            content={message.content}
            citations={message.citations}
            isStreaming={isStreaming}
          />
        </div>

        {/* Suggested Follow-up Prompts */}
        {message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && !isStreaming && (
          <div className="mt-4 pt-3 border-t border-[#F1F5F9]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
              Suggested Clinical Inquiries
            </p>
            <div className="flex flex-wrap gap-1.5">
              {message.suggestedFollowUps.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => onSelectPrompt?.(prompt)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#123047] hover:border-[#087F8C] hover:bg-[#DDF4F5] hover:text-[#087F8C] transition-all cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Expandable Sources Panel */}
        {message.citations && message.citations.length > 0 && (
          <SourcesPanel citations={message.citations} />
        )}
      </div>
    </div>
  );
};
