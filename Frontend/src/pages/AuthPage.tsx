import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { FileSearch, CheckCircle2, Shield, Sparkles, Activity, FileText } from 'lucide-react';
import { LoginForm } from '../components/auth/LoginForm.tsx';
import { SignupForm } from '../components/auth/SignupForm.tsx';

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isInitialSignup = location.pathname.includes('/signup');
  const [isSignup, setIsSignup] = useState<boolean>(isInitialSignup);

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F7FAFC]">
      {/* Left Panel: Deep Navy-to-Teal Gradient Medical Showcase (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#123047] via-[#0E2C42] to-[#087F8C] text-white p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
        {/* Subtle decorative background shapes */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#087F8C]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#123047]/60 rounded-full blur-3xl pointer-events-none" />

        {/* Top Logo */}
        <Link to="/" className="flex items-center gap-2.5 z-10 w-fit">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
            <FileSearch className="w-5 h-5 text-[#DDF4F5]" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-white">MediLens AI</span>
        </Link>

        {/* Middle Message & Product Preview Card */}
        <div className="my-auto z-10 max-w-lg space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[#DDF4F5] text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5 text-[#BDEFE7]" />
              Clinical Intelligence Workspace
            </div>
            <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-tight mb-4">
              Your Health Documents, Made Understandable.
            </h1>
            <p className="text-base text-slate-200 leading-relaxed">
              Access a secure, intelligent workspace for exploring medical information with verifiable citation grounding.
            </p>
          </div>

          {/* Floating Product Preview Card */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#BDEFE7]" />
                <span className="text-xs font-semibold text-white">CBC_Blood_Report.pdf</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#16A34A]/20 text-[#DDF5EB] border border-[#16A34A]/30">
                Smear Verified
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Platelet Count:</span>
                <span className="font-bold text-amber-300">120 x10^9/L (Low)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Reference Interval:</span>
                <span className="text-white">150 – 450 x10^9/L</span>
              </div>
              <div className="pt-1 text-[11px] text-[#BDEFE7] flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Linked to Citation [1] in Document Viewer
              </div>
            </div>
          </div>

          {/* Security & Isolation callout */}
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <Shield className="w-4 h-4 text-[#BDEFE7] shrink-0" />
            <span>Encrypted at rest • Isolated user tenancy • No data sharing</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-300 z-10">
          MediLens AI Medical Document Intelligence Platform
        </div>
      </div>

      {/* Right Panel: Clean White Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16 min-h-screen">
        {/* Mobile Header Logo */}
        <div className="lg:hidden w-full max-w-md mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#087F8C] flex items-center justify-center text-white">
              <FileSearch className="w-4 h-4" />
            </div>
            <span className="font-bold text-xl text-[#123047]">MediLens AI</span>
          </Link>
          <Link to="/" className="text-xs text-[#087F8C] font-semibold hover:underline">
            Back to Home
          </Link>
        </div>

        {/* Auth Mode Toggle Bar */}
        <div className="w-full max-w-md mb-8 bg-[#E2E8F0] p-1 rounded-xl flex items-center">
          <button
            onClick={() => {
              setIsSignup(false);
              navigate('/auth/login', { replace: true });
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !isSignup ? 'bg-white text-[#123047] shadow-xs' : 'text-[#64748B] hover:text-[#123047]'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setIsSignup(true);
              navigate('/auth/signup', { replace: true });
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isSignup ? 'bg-white text-[#123047] shadow-xs' : 'text-[#64748B] hover:text-[#123047]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Dynamic Form Rendering */}
        {isSignup ? (
          <SignupForm
            onSwitchToLogin={() => {
              setIsSignup(false);
              navigate('/auth/login', { replace: true });
            }}
          />
        ) : (
          <LoginForm
            onSwitchToSignup={() => {
              setIsSignup(true);
              navigate('/auth/signup', { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
};
