import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSearch, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../stores/useAuthStore.ts';

export const Navbar: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 border-b border-[#E2E8F0] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#123047] via-[#087F8C] to-[#0AA1B2] flex items-center justify-center text-white shadow-sm group-hover:shadow-md transition-all">
            <div className="relative">
              <FileSearch className="w-5 h-5 text-white" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#DDF4F5] rounded-full flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-[#087F8C] rounded-full"></span>
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xl tracking-tight text-[#123047]">MediLens</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#DDF4F5] text-[#087F8C] uppercase tracking-wider">AI</span>
            </div>
            <span className="text-[10px] text-[#64748B] -mt-0.5 font-medium">Multimodal Medical RAG</span>
          </div>
        </Link>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-[#334155]">
          <a href="#features" className="hover:text-[#087F8C] transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-[#087F8C] transition-colors">
            How It Works
          </a>
          <a href="#showcase" className="hover:text-[#087F8C] transition-colors">
            Live Showcase
          </a>
          <a href="#security" className="hover:text-[#087F8C] transition-colors">
            Security & Privacy
          </a>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <button
              onClick={() => navigate('/workspace')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#123047] text-white hover:bg-[#087F8C] transition-all shadow-sm hover:shadow cursor-pointer"
            >
              Open Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <Link
                to="/auth/login"
                className="px-4 py-2 text-sm font-medium text-[#334155] hover:text-[#087F8C] transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth/signup"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#087F8C] text-white hover:bg-[#066570] transition-all shadow-sm hover:shadow"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
