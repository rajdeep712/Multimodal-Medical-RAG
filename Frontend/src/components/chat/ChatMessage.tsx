import React, { useState, useRef, useEffect } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { ChatMessage as ChatMessageType } from '../../types/chat.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';
import { SourcesPanel } from './SourcesPanel.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';
import {
  Copy,
  Check,
} from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  onSelectPrompt?: (prompt: string) => void;
}

/**
 * Paced reveal for streamed answers. Fast providers (e.g. Gemini flash-lite)
 * can deliver an entire answer in ~300ms — faster than the eye can follow —
 * so the streaming assistant message renders a progressively revealed prefix
 * instead of the whole buffer at once. The store keeps accumulating the real
 * deltas; this only smooths the DISPLAY. The reveal chases the arrived
 * buffer (never more than ~1.5s behind) and finishes instantly on completion.
 */
function useStreamingReveal(content: string, active: boolean): string {
  const [revealed, setRevealed] = useState(() =>
    active ? Math.min(content.length, 80) : content.length
  );
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;

  useEffect(() => {
    if (!active) {
      setRevealed(content.length);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(120, now - last);
      last = now;
      const target = content.length;
      const prev = revealedRef.current;
      if (prev < target) {
        const rate = Math.max(4, Math.ceil((target - prev) / 75)) * (dt / 16.7);
        const next = Math.min(target, prev + Math.ceil(rate));
        revealedRef.current = next;
        setRevealed(next);
        // Follow the newest revealed text while the user is near the bottom.
        const scroller = document.querySelector('.scroll-smooth');
        if (scroller) {
          const nearBottom =
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
          if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [content, active]);

  return content.slice(0, Math.min(revealed, content.length));
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onSelectPrompt,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  // Paced display of the streamed buffer (real data still arrives instantly).
  const displayContent = useStreamingReveal(
    message.content,
    isStreaming && message.role === 'assistant'
  );

  // Thinking phase: the query was sent and the answer stream has not produced
  // anything yet (no content, no citations attached).
  const isThinkingPhase =
    isStreaming && !message.content && (!message.citations || message.citations.length === 0);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sentTime = (() => {
    const date = new Date(message.createdAt);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  if (isUser) {
    return (
      <div className="flex flex-col items-end mb-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="max-w-[85%] sm:max-w-[75%] bg-[#DDF4F5] text-[#123047] px-4 py-3 rounded-2xl rounded-tr-xs shadow-xs text-sm font-medium leading-relaxed border border-[#BDEFE7]">
          {message.content}
        </div>
        {sentTime && (
          <span className="text-[10px] text-[#94A3B8] mt-1 mr-1">{sentTime}</span>
        )}
      </div>
    );
  }

  // Thinking phase: query sent, answer stream has not produced anything yet
  // (no content, no citations) — solving orb + shimmer text, no background.
  if (isThinkingPhase) {
    return (
      <div className="mb-6 animate-in fade-in duration-200">
        <div className="inline-flex items-center gap-3 px-1 py-2">
          <ThinkingOrb
            state="solving"
            size={20}
            aria-hidden="true"
          />
          <span className="thinking-shimmer text-sm font-semibold tracking-wide" role="status">
            Thinking...
          </span>
        </div>
      </div>
    );
  }


  return (
    <div className="group mb-6 animate-in fade-in duration-200">
      <div className="min-w-0 bg-white rounded-2xl p-4 sm:p-5 border border-[#E2E8F0] shadow-xs">
        {/* Sticky copy button — top right of the box, visible on hover even
            when the box is scrolled midway */}
        <div className="sticky top-2 z-10 flex justify-end h-0 pr-1">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Tooltip>
              <TooltipTrigger
                onClick={handleCopy}
                className="p-1.5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Copy response"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
              </TooltipTrigger>
              <TooltipContent side="bottom">{copied ? 'Copied' : 'Copy response'}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Rich Medical Markdown Content with Inline Citation Badges */}
        <div className="select-text">
          <MarkdownRenderer
            content={displayContent}
            citations={message.citations}
            isStreaming={isStreaming}
            scopeId={message.id}
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
          <SourcesPanel citations={message.citations} messageId={message.id} />
        )}
      </div>
      {sentTime && (
        <span className="text-[10px] text-[#94A3B8] mt-1 ml-1 block">{sentTime}</span>
      )}
    </div>
  );
};
