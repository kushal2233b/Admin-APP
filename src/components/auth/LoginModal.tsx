import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Gamepad2, ShieldCheck, KeyRound, Mail, AlertCircle, Flame, Lock } from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { login, error, clearError, loading, sendPasswordResetLink } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    setResetStatus(null);
    clearError();

    await login(email, password);
    setIsSubmitting(false);
  };

  const handleSendResetEmail = async () => {
    if (!email) {
      setResetStatus({ success: false, message: 'Please enter your email address first.' });
      return;
    }
    setIsResetting(true);
    setResetStatus(null);
    const res = await sendPasswordResetLink(email);
    setResetStatus(res);
    setIsResetting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090712]/95 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#130F29] border border-purple-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950/80 animate-in fade-in zoom-in-95">
        
        {/* Glow Header Accent */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full pointer-events-none" />

        {/* WinX7 Brand Icon */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 via-purple-600 to-indigo-600 p-0.5 shadow-xl shadow-purple-950 mb-3">
            <div className="w-full h-full bg-[#0F0D1A] rounded-[22px] flex items-center justify-center">
              <Gamepad2 className="w-9 h-9 text-amber-400 animate-pulse" />
            </div>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-1.5">
            WIN<span className="text-amber-400">X7</span> <span className="text-purple-400 text-lg font-bold">Admin Portal</span>
          </h1>
          <p className="text-xs text-purple-300/80 mt-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Authorized Admin Sign In Only
          </p>
        </div>

        {/* Security Badge Notice */}
        <div className="mb-5 p-3 rounded-2xl bg-purple-950/60 border border-purple-800/50 text-purple-200 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-[11px] text-purple-300">
            Sign in with your admin email.
          </p>
        </div>

        {/* Reset Password Status Alert */}
        {resetStatus && (
          <div className={`mb-5 p-3 rounded-2xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
            resetStatus.success
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
              : 'bg-amber-950/60 border-amber-800/60 text-amber-200'
          }`}>
            <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${resetStatus.success ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div className="flex-1">
              <p className="font-semibold">{resetStatus.success ? 'Password Reset Email Sent' : 'Notice'}</p>
              <p className="text-[11px] mt-0.5">{resetStatus.message}</p>
            </div>
            <button
              onClick={() => setResetStatus(null)}
              className="hover:text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-300">Authentication Error</p>
              <p className="text-rose-200/90 text-[11px] mt-0.5">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-white font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
              Account Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-purple-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@winx7.gg"
                className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-4 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-purple-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-4 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none transition"
              />
            </div>
            
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={isResetting}
                className="text-[11px] text-purple-300 hover:text-amber-400 font-medium transition disabled:opacity-50"
              >
                {isResetting ? 'Sending Reset Email...' : 'Forgot Password? Send Reset Link'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white shadow-lg shadow-purple-950 transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-300" />
                Sign In to Admin Portal
              </span>
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-[10px] text-purple-400/80">
            Connected to Supabase Project <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">phuduaampsjenkreufmz</code>
          </p>
        </div>

      </div>
    </div>
  );
};
