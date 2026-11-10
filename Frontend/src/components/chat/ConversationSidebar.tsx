/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  X,
  MoreVertical,
  Trash2,
  Edit2,
  Calendar,
  Check,
  FileDown,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useChatStore } from '../../stores/useChatStore.ts';
import { ChatConversation } from '../../types/chat.ts';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    conversations,
    conversation,
    selectConversation,
    startNewChat,
    deleteConversation,
    renameConversation,
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (!isOpen) return null;

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartRename = (conv: ChatConversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setActiveMenuId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (renameValue.trim()) {
      await renameConversation(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleExport = (conv: ChatConversation) => {
    const transcript = conv.messages
      .map((m) => `[${m.role.toUpperCase()}] ${m.createdAt}:\n${m.content}\n`)
      .join('\n---\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/\s+/g, '_')}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setActiveMenuId(null);
  };

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* Semi-transparent Backdrop with smooth fade */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 pointer-events-auto cursor-pointer"
        aria-label="Close conversation history sidebar"
      />

      {/* Slide-over Left Sidebar with buttery spring physics */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        ref={sidebarRef}
        className="fixed inset-y-0 left-0 w-80 sm:w-88 bg-white border-r border-[#CBD5E1] shadow-2xl z-50 flex flex-col pointer-events-auto text-xs"
      >
        {/* Top Header */}
        <div className="p-4 border-b border-[#F1F5F9] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#123047]">Consultations</h3>
              <p className="text-[10px] text-[#64748B]">{conversations.length} saved sessions</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                startNewChat();
                onClose();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#123047] text-white hover:bg-[#087F8C] transition-all font-semibold cursor-pointer shadow-2xs"
              title="Start a new consultation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="px-4 py-2.5 border-b border-[#F1F5F9]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search previous chats..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] focus:outline-none focus:border-[#087F8C] focus:bg-white text-xs text-[#123047] transition-all"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              No conversations found.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conversation?.id === conv.id;
              const isRenaming = renamingId === conv.id;
              const isDeleting = deletingId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`group relative rounded-xl p-2.5 transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#DDF4F5] border border-[#087F8C]/40 text-[#123047] font-semibold shadow-2xs'
                      : 'hover:bg-[#F8FAFC] border border-transparent text-[#334155]'
                  }`}
                  onClick={() => {
                    if (!isRenaming) {
                      selectConversation(conv.id);
                      onClose();
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[#087F8C]' : 'text-slate-400'
                      }`}
                    />

                    {isRenaming ? (
                      <div
                        className="flex items-center gap-1 flex-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(conv.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          className="w-full py-0.5 px-1.5 text-xs bg-white border border-[#087F8C] rounded font-medium text-[#123047] focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(conv.id)}
                          className="p-1 rounded bg-[#087F8C] text-white hover:bg-[#066570] cursor-pointer"
                          title="Save title"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs leading-snug">{conv.title}</p>
                        <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 3-Dots Button: Visible on Hover */}
                  {!isRenaming && (
                    <div
                      className="relative shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          setActiveMenuId(activeMenuId === conv.id ? null : conv.id)
                        }
                        className={`p-1 rounded-lg text-slate-400 hover:text-[#123047] hover:bg-slate-200/60 transition-all cursor-pointer ${
                          activeMenuId === conv.id
                            ? 'opacity-100 bg-slate-200 text-[#123047]'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="Conversation actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Action Popover */}
                      {activeMenuId === conv.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#CBD5E1] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs"
                        >
                          <button
                            onClick={() => handleStartRename(conv)}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#F8FAFC] text-[#334155] cursor-pointer transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Rename title</span>
                          </button>

                          <button
                            onClick={() => handleExport(conv)}
                            className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-[#F8FAFC] text-[#334155] cursor-pointer transition-colors"
                          >
                            <FileDown className="w-3.5 h-3.5 text-slate-500" />
                            <span>Export transcript</span>
                          </button>

                          <div className="h-px bg-slate-100 my-1" />

                          {isDeleting ? (
                            <div className="p-2 space-y-1">
                              <p className="text-[10px] text-red-600 font-semibold">
                                Delete this conversation?
                              </p>
                              <div className="flex items-center gap-1 pt-1">
                                <button
                                  onClick={async () => {
                                    await deleteConversation(conv.id);
                                    setDeletingId(null);
                                    setActiveMenuId(null);
                                  }}
                                  className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] hover:bg-red-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setDeletingId(null)}
                                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] hover:bg-slate-200 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(conv.id)}
                              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 cursor-pointer transition-colors font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              <span>Delete chat</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-[#F1F5F9] text-[10px] text-slate-400 text-center">
          Click outside to close history
        </div>
      </motion.div>
    </div>
  );
};
