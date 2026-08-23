import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export interface ActionModalState {
  isOpen: boolean;
  type?: 'confirm_prompt' | 'success_overlay';
  title: string;
  message: string;
  details?: { label: string; value: string | number }[];
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
  if (!isOpen) return null;

  const renderIcon = () => {
    switch (icon) {
      case 'success':
        return (
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950/60 animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/60">
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
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-950/60 animate-spin">
            <RefreshCw className="w-9 h-9" />
          </div>
        );
      default:
        return (
          <div className="w-16 h-16 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-xl shadow-purple-950/60">
            <Info className="w-9 h-9" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#16122E] border border-purple-700/50 rounded-3xl p-6 shadow-2xl text-purple-100 overflow-hidden transform transition-all scale-100">
        {/* Background Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-purple-950/50 text-purple-300 hover:text-white hover:bg-purple-900/60 transition border border-purple-800/40"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content Body */}
        <div className="flex flex-col items-center text-center">
          {renderIcon()}

          {badgeTag && (
            <span className="mt-4 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              {badgeTag}
            </span>
          )}

          <h3 className="text-xl font-extrabold text-white mt-3 tracking-tight">
            {title}
          </h3>

          <p className="text-xs text-purple-200/80 mt-2 leading-relaxed max-w-sm">
            {message}
          </p>

          {/* Details Card if provided */}
          {details.length > 0 && (
            <div className="w-full mt-4 p-3.5 bg-[#0F0D21]/90 rounded-2xl border border-purple-800/40 space-y-2 text-left max-h-64 overflow-y-auto custom-scrollbar">
              {details.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-purple-900/30 last:border-b-0 gap-2"
                >
                  <span className="text-purple-300 font-semibold flex-shrink-0">{item.label}</span>
                  <span className="font-bold text-amber-300 truncate text-right max-w-[220px]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="w-full flex items-center gap-2 mt-6">
            {type === 'confirm_prompt' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl bg-purple-950/60 hover:bg-purple-900 text-purple-200 font-bold text-xs border border-purple-800/50 transition active:scale-95"
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
