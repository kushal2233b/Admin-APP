import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Copy,
  Check
} from 'lucide-react';

export interface ActionModalState {
  isOpen: boolean;
  type?: 'confirm_prompt' | 'success_overlay';
  title: string;
  message: string;
  details?: { label: string; value: string | number; copyable?: boolean }[];
  confirmText?: string;
  cancelText?: string;
  badgeTag?: string;
  icon?: 'success' | 'warning' | 'danger' | 'info' | 'refresh';
  onConfirm?: () => void | Promise<void>;
  onClose?: () => void;
}

interface ActionConfirmationModalProps extends ActionModalState {
  onClose: () => void;
}

export const ActionConfirmationModal: React.FC<ActionConfirmationModalProps> = ({
  isOpen,
  type = 'success_overlay',
  title,
  message,
  details = [],
  confirmText = 'Confirm & Proceed',
  cancelText = 'Cancel',
  badgeTag,
  icon = 'success',
  onConfirm,
  onClose
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (icon) {
      case 'success':
        return (
          <div className="w-16 h-16 rounded-2xl bg-[#C9A34E]/20 border border-emerald-500/40 flex items-center justify-center text-[#C9A34E] shadow-xl shadow-emerald-950/60 animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-16 h-16 rounded-2xl bg-[#C9A34E]/20 border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shadow-xl shadow-amber-950/60">
            <AlertTriangle className="w-9 h-9" />
          </div>
        );
      case 'danger':
        return (
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-950/60">
            <AlertTriangle className="w-9 h-9" />
          </div>
        );
      case 'refresh':
        return (
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-[#777278] shadow-xl shadow-indigo-950/60 animate-spin">
            <RefreshCw className="w-9 h-9" />
          </div>
        );
      default:
        return (
          <div className="w-16 h-16 rounded-2xl bg-purple-500/20 border border-[#29252A]/40 flex items-center justify-center text-[#777278] shadow-xl shadow-purple-950/60">
            <Info className="w-9 h-9" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#16122E] border border-[#29252A] rounded-3xl p-6 shadow-2xl text-[#F5F5F5] overflow-hidden transform transition-all scale-100">
        {/* Background Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#E21B36]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#C9A34E]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-[#0D0B0D]/50 text-[#B0ACB0] hover:text-white hover:bg-[#1B181C] transition border border-[#29252A]"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content Body */}
        <div className="flex flex-col items-center text-center">
          {renderIcon()}

          {badgeTag && (
            <span className="mt-4 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest bg-[#C9A34E]/20 text-[#C9A34E] border border-[#C9A34E]/30 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#C9A34E]" />
              {badgeTag}
            </span>
          )}

          <h3 className="text-xl font-extrabold text-white mt-3 tracking-tight">
            {title}
          </h3>

          <p className="text-xs text-[#B0ACB0]/80 mt-2 leading-relaxed max-w-sm">
            {message}
          </p>

          {/* Details Card if provided */}
          {details.length > 0 && (
            <div className="w-full mt-4 p-3.5 bg-[#0F0D21]/90 rounded-2xl border border-[#29252A] space-y-2 text-left max-h-64 overflow-y-auto custom-scrollbar">
              {details.map((item, idx) => {
                const isMatchId = item.label.toLowerCase().includes('match id');
                const isCopyable = item.copyable || isMatchId;
                const isCopied = copiedKey === `detail-${idx}`;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between text-xs py-1.5 border-b border-[#29252A]/30 last:border-b-0 gap-2 ${
                      isMatchId ? 'bg-amber-500/10 px-2 py-2 rounded-lg border border-amber-500/20 my-1' : ''
                    }`}
                  >
                    <span className="text-[#B0ACB0] font-semibold flex-shrink-0">{item.label}</span>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={`font-bold truncate text-right max-w-[200px] ${
                        isMatchId ? 'text-amber-400 font-mono tracking-wider' : 'text-[#C9A34E]'
                      }`}>
                        {item.value}
                      </span>
                      {isCopyable && (
                        <button
                          type="button"
                          onClick={() => handleCopy(String(item.value), `detail-${idx}`)}
                          className={`p-1 rounded transition flex items-center gap-1 text-[10px] font-bold ${
                            isCopied
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                          }`}
                          title="Copy to clipboard"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Buttons */}
          <div className="w-full flex items-center gap-2 mt-6">
            {type === 'confirm_prompt' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#0D0B0D]/60 hover:bg-[#141215] text-[#B0ACB0] font-bold text-xs border border-[#29252A] transition active:scale-95"
                >
                  {cancelText}
                </button>
                <button
                  onClick={async () => {
                    if (onConfirm) await onConfirm();
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-amber-300 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{confirmText}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-amber-300 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>Done & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
