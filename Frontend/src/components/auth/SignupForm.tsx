import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Lock, User, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../../stores/useAuthStore.ts';
import { useNavigate } from 'react-router-dom';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin }) => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength check
  const calculateStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = calculateStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide your full clinical or personal name');
      return;
    }
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      await signup(name, email, password);
      navigate('/workspace');
    } catch (err: any) {
      setError(err?.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#123047] tracking-tight">
          Create an account
        </h2>
        <p className="text-sm text-[#64748B] mt-2">
          Start exploring your medical records with evidence-grounded AI synthesis.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Sarah Lin or Alexander Hayes"
              required
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider mb-1.5">
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
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              className="w-full pl-10 pr-10 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password strength bar */}
          {password && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    strength <= 1 ? 'w-1/4 bg-red-500' : strength === 2 ? 'w-2/4 bg-amber-500' : strength === 3 ? 'w-3/4 bg-blue-500' : 'w-full bg-[#16A34A]'
                  }`}
                />
              </div>
              <p className="text-[10px] text-[#64748B]">
                Strength:{' '}
                <span className="font-semibold text-[#123047]">
                  {strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'}
                </span>{' '}
                (combine uppercase, numbers & symbols)
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[#123047] uppercase tracking-wider mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#123047] placeholder-slate-400 focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15 transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl text-sm font-bold bg-[#087F8C] text-white hover:bg-[#066570] disabled:opacity-50 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating your workspace...</span>
            </>
          ) : (
            <>
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-[#E2E8F0] text-center">
        <p className="text-xs text-[#64748B]">
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
            className="font-bold text-[#087F8C] hover:underline cursor-pointer"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};
