import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatPanel } from '../chat/ChatPanel.tsx';
import { DocumentViewer } from '../documents/DocumentViewer.tsx';
import { DocumentSelector } from '../documents/DocumentSelector.tsx';
import { ProfileDropdown } from '../profile/ProfileDropdown.tsx';
import { UploadModal } from '../documents/UploadModal.tsx';
import { useCitationStore } from '../../stores/useCitationStore.ts';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import {
  MessageSquare,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
} from 'lucide-react';

export const WorkspaceLayout: React.FC = () => {
  // Split pane sizing (chat width percentage: 44% initial)
  const [chatWidthPercent, setChatWidthPercent] = useState<number>(44);
  const [isDocumentCollapsed, setIsDocumentCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Mobile active tab ('chat' | 'document')
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'document'>('chat');
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const { activeCitation } = useCitationStore();
  const { selectedDocument } = useDocumentStore();

  // When a citation is clicked on mobile or small screens, automatically switch to document tab!
  useEffect(() => {
    if (activeCitation) {
      setMobileActiveTab('document');
      if (isDocumentCollapsed) {
        setIsDocumentCollapsed(false);
      }
    }
  }, [activeCitation, isDocumentCollapsed]);

  // Dragging logic for desktop resizer
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      // Clamp between 25% and 75%
      setChatWidthPercent(Math.max(25, Math.min(75, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F7FAFC]">
      {/* Upload Modal (Global) */}
      <UploadModal />

      {/* Mobile Top Navigation Tabs */}
      <div className="lg:hidden h-12 bg-white border-b border-[#E2E8F0] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMobileActiveTab('chat')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileActiveTab === 'chat'
                ? 'bg-white text-[#123047] shadow-xs'
                : 'text-[#64748B]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setMobileActiveTab('document')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              mobileActiveTab === 'document'
                ? 'bg-white text-[#123047] shadow-xs'
                : 'text-[#64748B]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document</span>
            {selectedDocument && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#087F8C]" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {mobileActiveTab === 'document' && <DocumentSelector />}
          <ProfileDropdown />
        </div>
      </div>

      {/* Main Workspace Split Body */}
      <div
        ref={containerRef}
        className="flex-1 flex overflow-hidden relative select-none"
      >
        {/* Left Side: AI Chat Panel */}
        <div
          style={{
            width: isDesktop
              ? isDocumentCollapsed
                ? '100%'
                : `${chatWidthPercent}%`
              : '100%',
          }}
          className={`h-full flex-col overflow-hidden transition-all duration-75 ${
            mobileActiveTab === 'chat' ? 'flex w-full lg:flex' : 'hidden lg:flex'
          }`}
        >
          <ChatPanel
            isDocumentCollapsed={isDocumentCollapsed}
            onToggleDocumentPanel={() => setIsDocumentCollapsed(false)}
          />
        </div>

        {/* Draggable Divider (Desktop Only) */}
        {!isDocumentCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className={`hidden lg:flex w-2 bg-[#E2E8F0] hover:bg-[#087F8C]/40 cursor-col-resize items-center justify-center transition-colors shrink-0 z-30 group ${
              isDragging ? 'bg-[#087F8C]' : ''
            }`}
            title="Drag to resize chat and document viewer"
          >
            <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
          </div>
        )}

        {/* Right Side: Interactive Document Viewer */}
        <div
          style={{
            width: isDesktop
              ? isDocumentCollapsed
                ? '0%'
                : `${100 - chatWidthPercent}%`
              : '100%',
          }}
          className={`h-full flex-col overflow-hidden transition-all duration-75 ${
            mobileActiveTab === 'document' ? 'flex w-full lg:flex' : 'hidden lg:flex'
          } ${isDocumentCollapsed ? 'lg:hidden' : ''}`}
        >
          {/* Right Document Viewer Top Header */}
          <div className="h-14 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0">
            {/* Left side: Document Selector */}
            <div className="flex items-center gap-2">
              <DocumentSelector />
            </div>

            {/* Right side: User Profile & Collapse Toggle */}
            <div className="flex items-center gap-2 sm:gap-3">
              <ProfileDropdown />

              <button
                onClick={() => setIsDocumentCollapsed(true)}
                className="hidden lg:flex p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#123047] transition-colors cursor-pointer"
                title="Collapse Document Panel"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Document Content Viewport */}
          <div className="flex-1 overflow-hidden">
            <DocumentViewer />
          </div>
        </div>
      </div>
    </div>
  );
};
