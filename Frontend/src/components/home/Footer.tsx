import React from 'react';
import { Link } from 'react-router-dom';
import { FileSearch, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-[#E2E8F0] pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-10 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#123047] to-[#087F8C] flex items-center justify-center text-white shadow-xs">
              <FileSearch className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-lg text-[#123047] tracking-tight">MediLens AI</span>
              <p className="text-xs text-[#64748B]">Multimodal Medical Document Intelligence</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-[#475569]">
            <a href="#features" className="hover:text-[#087F8C] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#087F8C] transition-colors">
              How It Works
            </a>
            <a href="#security" className="hover:text-[#087F8C] transition-colors">
              Security
            </a>
            <span className="text-slate-300">•</span>
            <span className="hover:text-[#087F8C] cursor-pointer">Privacy Policy</span>
            <span className="hover:text-[#087F8C] cursor-pointer">Terms of Service</span>
            <span className="hover:text-[#087F8C] cursor-pointer">Clinical Notice</span>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-[#94A3B8] gap-4">
          <p>© {new Date().getFullYear()} MediLens AI Technologies. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Engineered for clinical document understanding & citation precision.
          </p>
        </div>
      </div>
    </footer>
  );
};
