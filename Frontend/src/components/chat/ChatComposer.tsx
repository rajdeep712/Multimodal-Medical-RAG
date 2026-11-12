import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
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
import { useChatStore } from '../../stores/useChatStore.ts';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';

interface ChatComposerProps {
  isDocumentCollapsed?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ isDocumentCollapsed = false }) => {
  const {
    sendMessage,
    isStreaming,
    selectedDocumentFilters,
    toggleDocumentFilter,
    clearDocumentFilters,
    dateRangeFilter,
    setDateRangeFilter,
  } = useChatStore();

  const { documents, setUploadModalOpen } = useDocumentStore();

  const [input, setInput] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition event error:', event.error);
          if (event.error === 'not-allowed') {
            alert('Microphone access was blocked or is not allowed in this environment. Please check browser microphone permissions.');
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition', err);
        setIsListening(false);
      }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedDocs = documents.filter((d) => selectedDocumentFilters.includes(d.id));

  return (
    <div
      className={`p-4 bg-white shrink-0 transition-all ${
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
        <button
          onClick={() => {
            setShowDatePicker(!showDatePicker);
            setShowFilterDropdown(false);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            dateRangeFilter.startDate || dateRangeFilter.endDate
              ? 'bg-[#DDF5EB] border-[#16A34A] text-[#16A34A]'
              : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:border-slate-400'
          }`}
        >
          <Calendar className="w-3 h-3" />
          <span>
            {dateRangeFilter.startDate || dateRangeFilter.endDate
              ? 'Date Range Filtered'
              : 'Any Ingestion Date'}
          </span>
        </button>

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

      {/* Popover Filter Multi-select Dropdown */}
      {showFilterDropdown && (
        <div className="mb-2 p-3 bg-white rounded-2xl shadow-xl border border-[#CBD5E1] space-y-2 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#F1F5F9]">
            <span className="font-bold text-[#123047] uppercase tracking-wider text-[10px]">
              Select Documents for RAG Retrieval
            </span>
            <button
              onClick={clearDocumentFilters}
              className="text-[10px] text-[#087F8C] font-semibold hover:underline cursor-pointer"
            >
              Select All
            </button>
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

      {/* Popover Date Filter */}
      {showDatePicker && (
        <div className="mb-2 p-3 bg-white rounded-2xl shadow-xl border border-[#CBD5E1] space-y-2 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#F1F5F9]">
            <span className="font-bold text-[#123047] uppercase tracking-wider text-[10px]">
              Filter by Document Date
            </span>
            <button
              onClick={() => setDateRangeFilter({})}
              className="text-[10px] text-[#087F8C] font-semibold hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#64748B] block mb-1">From Date</label>
              <input
                type="date"
                value={dateRangeFilter.startDate || ''}
                onChange={(e) =>
                  setDateRangeFilter({ ...dateRangeFilter, startDate: e.target.value })
                }
                className="w-full p-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#123047]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#64748B] block mb-1">To Date</label>
              <input
                type="date"
                value={dateRangeFilter.endDate || ''}
                onChange={(e) =>
                  setDateRangeFilter({ ...dateRangeFilter, endDate: e.target.value })
                }
                className="w-full p-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#123047]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Text Input Box */}
      <div className="relative flex items-end gap-2 bg-[#F8FAFC] border border-[#CBD5E1] focus-within:border-[#087F8C] focus-within:ring-2 focus-within:ring-[#087F8C]/15 rounded-2xl p-2 transition-all">
        {/* Upload/Attachment Button */}
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="p-2 text-slate-400 hover:text-[#087F8C] hover:bg-white rounded-xl transition-all shrink-0 cursor-pointer"
            aria-label="Upload or attach medical documents"
          >
            <Paperclip className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent side="top">Upload or attach medical documents</TooltipContent>
        </Tooltip>

        {/* Voice Dictation Microphone Button */}
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={handleToggleSpeech}
            className={`p-2 rounded-xl transition-all shrink-0 cursor-pointer ${
              isListening
                ? 'bg-red-600 text-white animate-pulse shadow-md'
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your reports, prescriptions, or imaging..."
          disabled={isStreaming}
          className="w-full max-h-32 bg-transparent text-sm text-[#123047] placeholder-slate-400 resize-none focus:outline-none py-1.5 leading-relaxed"
        />

        {/* Send Button — span wrapper keeps the tooltip working while the
            button is disabled (pointer-events pass through to the trigger). */}
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex shrink-0 rounded-xl" />}>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
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
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#94A3B8] px-1">
        <span>Enter to send • Shift + Enter for new line</span>
        <span className="flex items-center gap-1 text-[#087F8C]">
          <span>Grounded retrieval active</span>
        </span>
      </div>
    </div>
  );
};
