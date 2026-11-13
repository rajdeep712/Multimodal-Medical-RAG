import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, FolderArchive, LogOut, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../../stores/useAuthStore.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';

export const ProfileDropdown: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <Tooltip>
        <TooltipTrigger
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1 rounded-xl hover:bg-slate-100 border border-transparent hover:border-[#CBD5E1] transition-all cursor-pointer"
          aria-label="Account & Workspace Settings"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#123047] to-[#087F8C] text-white flex items-center justify-center text-xs font-bold shadow-xs">
            {user.initials || 'MD'}
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-bold text-[#123047] leading-none">{user.name}</span>
            <span className="text-[10px] text-[#64748B] leading-tight truncate max-w-[140px]">
              {user.email}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-[#64748B] hidden sm:block" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Account & Workspace Settings</TooltipContent>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#CBD5E1] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-3 border-b border-[#F1F5F9]">
            <p className="text-xs font-bold text-[#123047]">{user.name}</p>
            <p className="text-xs text-[#64748B] truncate mt-0.5">{user.email}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#DDF4F5] text-[#087F8C]">
                {user.role === 'clinician' ? 'Clinician Tier' : 'Patient Workspace'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">v2.4-rag</span>
            </div>
          </div>

          <div className="py-1 text-xs text-[#334155]">
            <button
              onClick={() => {
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <User className="w-4 h-4 text-[#087F8C]" />
              <span>Profile & Credentials</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-[#087F8C]" />
              <span>Workspace Preferences</span>
            </button>

            <button
              onClick={() => {
                navigate('/workspace');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left flex items-center gap-2.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-[#087F8C]" />
              <span>My Uploaded Documents</span>
            </button>
          </div>

          <div className="pt-1 border-t border-[#F1F5F9]">
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors font-medium cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
