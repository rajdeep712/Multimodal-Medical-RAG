import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../stores/useAuthStore.ts';
import { useNavigate } from 'react-router-dom';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must contain at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      await login(email, password);
      navigate('/workspace');
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#123047] tracking-tight">
          Welcome back
        </h2>
        <p className="text-sm text-[#64748B] mt-2">
          Sign in to your MediLens clinical workspace and access your indexed documents.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider mb-2">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clinician@hospital.org"
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider">
              Password
            </label>
            <button
              type="button"
              onClick={() => {}}
              className="text-xs text-[#087F8C] hover:underline font-medium cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-[#CBD5E1] text-[#087F8C] focus:ring-[#087F8C] cursor-pointer"
            />
            <span className="text-xs text-[#64748B] font-medium">Remember me for 30 days</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-[#087F8C] text-white hover:bg-[#066570] disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying session...</span>
            </>
          ) : (
            <>
              <span>Sign In to Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-[#E2E8F0] text-center">
        <p className="text-xs text-[#64748B]">
          Don't have an account?{' '}
          <button
            onClick={onSwitchToSignup}
            className="font-bold text-[#087F8C] hover:underline cursor-pointer"
          >
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
};
