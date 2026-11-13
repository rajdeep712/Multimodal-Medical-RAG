import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Paperclip,
  Filter,
  Calendar,
  X,
  Check,
  ChevronDown,
  Layers,
  FileText,
  Mic,
  MicOff,
} from 'lucide-react';
import { VoiceBeam, useMicrophone } from 'voice-glow';
import type { DateRange } from 'react-day-picker';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { useChatStore } from '../../stores/useChatStore.ts';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';
import { Calendar as CalendarPicker } from '../ui/calendar.tsx';

interface ChatComposerProps {
  isDocumentCollapsed?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ isDocumentCollapsed = false }) => {
  const {
    sendMessage,
    stopGeneration,
    isStreaming,
    selectedDocumentFilters,
    toggleDocumentFilter,
    selectAllDocumentFilters,
    clearDocumentFilters,
    dateRangeFilter,
    setDateRangeFilter,
  } = useChatStore();

  const { documents, setUploadModalOpen } = useDocumentStore();

  const [input, setInput] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>();
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  // Audio-reactive glow for the input while the mic is open (voice-glow).
  const mic = useMicrophone();
  // Dictation state: the composer text captured when dictation started, the
  // finals committed by the current recognition session, and whether the user
  // still wants the mic open (Chrome ends sessions after silence — we restart).
  const baseTextRef = useRef('');
  const finalTextRef = useRef('');
  const shouldListenRef = useRef(false);

  const composeTranscript = (...parts: string[]) =>
    parts.map((p) => p.trim()).filter(Boolean).join(' ');

  // Document-date filter: the calendar works with Date objects while the
  // filter store keeps 'yyyy-MM-dd' strings (the format sent to the backend).
  const openDatePicker = () => {
    const willOpen = !showDatePicker;
    setShowDatePicker(willOpen);
    setShowFilterDropdown(false);
    if (willOpen) {
      setSelectedDateRange(
        dateRangeFilter.startDate || dateRangeFilter.endDate
          ? {
              from: dateRangeFilter.startDate
                ? parseISO(dateRangeFilter.startDate)
                : undefined,
              to: dateRangeFilter.endDate ? parseISO(dateRangeFilter.endDate) : undefined,
            }
          : undefined
      );
    }
  };

  const applyDateRange = (range: DateRange | undefined) => {
    setSelectedDateRange(range);
    setDateRangeFilter({
      startDate: range?.from ? format(range.from, 'yyyy-MM-dd') : undefined,
      endDate: range?.to ? format(range.to, 'yyyy-MM-dd') : undefined,
    });
  };

  const applyDatePreset = (daysBack: number) => {
    const today = startOfDay(new Date());
    applyDateRange({ from: addDays(today, -daysBack), to: today });
  };

  const dateRangeSummary = (() => {
    const { startDate, endDate } = dateRangeFilter;
    if (startDate && endDate) {
      return `Docs from ${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d')}`;
    }
    if (startDate) return `Docs from ${format(parseISO(startDate), 'MMM d')}`;
    if (endDate) return `Docs until ${format(parseISO(endDate), 'MMM d')}`;
    return null;
  })();

  const stopDictation = () => {
    shouldListenRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch (e) {}
    recognitionRef.current = null;
    mic.stop();
    setIsListening(false);
  };

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const startRecognition = () => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let sessionStarted = false;
    // Browsers without a microphone backend (e.g. embedded preview panels)
    // accept start() but never fire any event — revert the UI after 3s.
    const failSafe = window.setTimeout(() => {
      if (!sessionStarted) {
        shouldListenRef.current = false;
        setIsListening(false);
      }
    }, 3000);

    recognition.onstart = () => {
      sessionStarted = true;
      window.clearTimeout(failSafe);
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      // Recompose the full text each event: the text captured at dictation
      // start + the finals committed so far + the live interim result.
      // (Appending per-event slices would duplicate the interim text.)
      let finals = '';
      let interim = '';
      for (let i = 0; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else interim += result[0].transcript;
      }
      finalTextRef.current = finals;
      setInput(composeTranscript(baseTextRef.current, finals, interim));
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition event error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert('Microphone access was blocked or is not allowed in this environment. Please check browser microphone permissions.');
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === 'network') {
        // Speech service unreachable — restarting would loop; give up.
        shouldListenRef.current = false;
        setIsListening(false);
      }
      // 'no-speech' / 'audio-capture' / 'aborted': onend decides whether to retry.
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        // Commit the finals collected in this session and open a fresh one
        // (a stopped Chrome session cannot always be resumed in place).
        baseTextRef.current = composeTranscript(baseTextRef.current, finalTextRef.current);
        finalTextRef.current = '';
        try {
          recognition.start();
          return;
        } catch (e) {
          // fall through to stop
        }
      }
      window.clearTimeout(failSafe);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      window.clearTimeout(failSafe);
      console.error('Failed to start speech recognition', err);
      shouldListenRef.current = false;
      setIsListening(false);
    }
  };

  const handleToggleSpeech = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      stopDictation();
    } else {
      baseTextRef.current = input;
      finalTextRef.current = '';
      shouldListenRef.current = true;
      setIsListening(true);
      // VoiceBeam's mic stream — requested inside this click gesture, as
      // browsers only grant microphone access from a user action.
      void mic.start();
      startRecognition();
    }
  };

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleStop = () => {
    stopGeneration();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedDocs = documents.filter((d) => selectedDocumentFilters.includes(d.id));
  const allDocsSelected = documents.length > 0 && selectedDocumentFilters.length === documents.length;

  return (
    <div
      className={`relative p-4 bg-white shrink-0 transition-all ${
        isDocumentCollapsed
          ? 'border border-[#CBD5E1] rounded-2xl shadow-xs mb-3'
          : 'border-t border-[#E2E8F0]'
      }`}
      ref={dropdownRef}
    >
      {/* Active Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-xs">
        {/* Document Filter Trigger */}
        <button
          onClick={() => {
            setShowFilterDropdown(!showFilterDropdown);
            setShowDatePicker(false);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            selectedDocumentFilters.length > 0
              ? 'bg-[#DDF4F5] border-[#087F8C] text-[#087F8C]'
              : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:border-slate-400'
          }`}
        >
          <Filter className="w-3 h-3" />
          <span>
            {selectedDocumentFilters.length === 0
              ? 'Search All Documents'
              : `Searching ${selectedDocumentFilters.length} of ${documents.length} docs`}
          </span>
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </button>

        {/* Date Filter Trigger */}
        <Tooltip>
          <TooltipTrigger
            onClick={openDatePicker}
            aria-expanded={showDatePicker}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              dateRangeFilter.startDate || dateRangeFilter.endDate
                ? 'bg-[#DDF5EB] border-[#16A34A] text-[#16A34A]'
                : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:border-slate-400'
            }`}
            aria-label="Filter by Document Date"
          >
            <Calendar className="w-3 h-3" />
            <span>{dateRangeSummary || 'Filter by Document Date'}</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Narrow the AI's search to documents uploaded in a chosen period — handy for recent reports.
          </TooltipContent>
        </Tooltip>

        {/* Active Removable Chips */}
        {selectedDocs.slice(0, 2).map((doc) => (
          <span
            key={doc.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[#123047] text-[11px] font-medium border border-[#CBD5E1]"
          >
            <span className="truncate max-w-[100px]">{doc.fileName}</span>
            <button
              onClick={() => toggleDocumentFilter(doc.id)}
              className="hover:text-red-600 transition-colors cursor-pointer"
              title={`Remove filter for ${doc.fileName}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {selectedDocs.length > 2 && (
          <span className="text-[11px] text-[#64748B] font-semibold">
            +{selectedDocs.length - 2} more
          </span>
        )}

        {(selectedDocumentFilters.length > 0 || dateRangeFilter.startDate || dateRangeFilter.endDate) && (
          <button
            onClick={() => {
              clearDocumentFilters();
              setDateRangeFilter({});
            }}
            className="text-[11px] text-slate-400 hover:text-red-600 underline ml-auto cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Popover Filter Multi-select Dropdown — overlays the chat above the
          composer instead of pushing the message list up */}
      {showFilterDropdown && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-full max-w-md p-3 bg-white rounded-2xl shadow-xl border border-[#CBD5E1] space-y-2 animate-in fade-in zoom-in-95 duration-100 text-xs z-40">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#F1F5F9]">
            <span className="font-bold text-[#123047] uppercase tracking-wider text-[10px]">
              Select Documents for RAG Retrieval
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (allDocsSelected) {
                    clearDocumentFilters();
                  } else {
                    selectAllDocumentFilters(documents.map((d) => d.id));
                  }
                }}
                className="text-[10px] text-[#087F8C] font-semibold hover:underline cursor-pointer"
              >
                {allDocsSelected ? 'Clear All' : 'Select All'}
              </button>
              <button
                onClick={() => setShowFilterDropdown(false)}
                className="px-2.5 py-1 rounded-lg bg-[#123047] text-white text-[10px] font-bold hover:bg-[#087F8C] transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {documents.map((doc) => {
              const isChecked = selectedDocumentFilters.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#F8FAFC] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDocumentFilter(doc.id)}
                    className="w-3.5 h-3.5 rounded text-[#087F8C] focus:ring-[#087F8C] cursor-pointer"
                  />
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-[#123047] truncate flex-1">{doc.fileName}</span>
                  <span className="text-[10px] text-slate-400">{doc.category}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Popover Date Filter — calendar range picker with quick presets.
          Overlays the chat above the composer, centered in the chat panel. */}
      {showDatePicker && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-full max-w-sm p-2 bg-white rounded-2xl shadow-xl border border-[#CBD5E1] space-y-1.5 animate-in fade-in zoom-in-95 duration-100 text-xs z-40">
          <div className="flex items-center justify-between pb-1 border-b border-[#F1F5F9]">
            <span className="font-bold text-[#123047] uppercase tracking-wider text-[10px]">
              Filter by Document Date
            </span>
            <button
              onClick={() => applyDateRange(undefined)}
              className="text-[10px] text-[#087F8C] font-semibold hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="flex justify-center">
            <CalendarPicker
              mode="range"
              selected={selectedDateRange}
              onSelect={applyDateRange}
              numberOfMonths={1}
              defaultMonth={selectedDateRange?.from}
              className="bg-transparent p-1 [--cell-size:--spacing(6)]"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              Quick picks
            </span>
            {[
              { label: 'Today', daysBack: 0 },
              { label: 'Last 7 days', daysBack: 6 },
              { label: 'Last 30 days', daysBack: 29 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyDatePreset(preset.daysBack)}
                className="px-1.5 py-0.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[10px] font-semibold text-[#123047] hover:border-[#087F8C] hover:bg-[#DDF4F5] hover:text-[#087F8C] transition-all cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Summary + Done */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F1F5F9]">
            <div className="text-[10px] text-slate-400 min-w-0" role="status">
              {selectedDateRange?.from
                ? `Selected: ${format(selectedDateRange.from, 'MMM d')}${
                    selectedDateRange.to
                      ? ` – ${format(selectedDateRange.to, 'MMM d')}`
                      : ' – pick an end date'
                  }`
                : 'Pick a start date, then an end date, or use a quick pick.'}
            </div>
            <button
              onClick={() => setShowDatePicker(false)}
              className="px-2.5 py-1 rounded-lg bg-[#123047] text-white text-[10px] font-bold hover:bg-[#087F8C] transition-all cursor-pointer shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main Text Input Box */}
      {/* Chat input. While the microphone is live the input box is wrapped in
          a VoiceBeam glow that rises with the voice (audio-reactive). The
          inner controls sit at z-5 so they stay crisp above the bloom. */}
      {(() => {
        const inputBox = (
          <div className="relative flex items-end gap-2 bg-[#F8FAFC] border border-[#CBD5E1] focus-within:border-[#087F8C] focus-within:ring-2 focus-within:ring-[#087F8C]/15 rounded-2xl p-2 transition-all">
            {/* Upload/Attachment Button */}
            <Tooltip>
              <TooltipTrigger
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="relative z-[5] p-2 text-slate-400 hover:text-[#087F8C] hover:bg-white rounded-xl transition-all shrink-0 cursor-pointer"
                aria-label="Upload or attach medical documents"
              >
                <Paperclip className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Upload or attach medical documents</TooltipContent>
            </Tooltip>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your reports, prescriptions, or imaging..."
              disabled={isStreaming}
              className="relative z-[5] w-full max-h-32 bg-transparent text-sm text-[#123047] placeholder-slate-400 resize-none focus:outline-none py-1.5 leading-relaxed"
            />

            {/* Voice Dictation Microphone Button — sits just left of Send */}
            <Tooltip>
              <TooltipTrigger
                type="button"
                onClick={handleToggleSpeech}
                aria-pressed={isListening}
                className={`relative z-[5] p-2 rounded-xl transition-all shrink-0 cursor-pointer ${
                  isListening
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-[#087F8C] hover:bg-white'
                }`}
                aria-label="Dictate clinical query with voice"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </TooltipTrigger>
              <TooltipContent side="top">
                {isListening ? 'Listening... Click to stop dictation' : 'Dictate clinical query with voice'}
              </TooltipContent>
            </Tooltip>

            {/* Send Button / Stop Button — while an answer is streaming or
                loading, the send control becomes a stop control. */}
            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  onClick={handleStop}
                  className="relative z-[5] p-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-all shrink-0 shadow-xs active:scale-95 cursor-pointer"
                  aria-label="Stop generating response"
                >
                  <Square className="w-3 h-3 fill-current" />
                </TooltipTrigger>
                <TooltipContent side="top">Stop generating response</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger render={<span className="relative z-[5] inline-flex shrink-0 rounded-xl" />}>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="p-2 rounded-xl bg-[#087F8C] text-white hover:bg-[#066570] disabled:opacity-40 disabled:hover:bg-[#087F8C] disabled:pointer-events-none transition-all shrink-0 shadow-xs active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                    aria-label={!input.trim() ? "Type a medical question to send" : "Send medical query"}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {!input.trim() ? 'Type a medical question to send' : 'Send medical query (Enter)'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );

        return isListening && mic.stream ? (
          <VoiceBeam stream={mic.stream}>{inputBox}</VoiceBeam>
        ) : (
          inputBox
        );
      })()}

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#94A3B8] px-1">
        <span>Enter to send • Shift + Enter for new line</span>
        <span className="flex items-center gap-1 text-[#087F8C]">
          <span>Grounded retrieval active</span>
        </span>
      </div>
    </div>
  );
};
