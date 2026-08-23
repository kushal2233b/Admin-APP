import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode, Smartphone, ExternalLink, IndianRupee } from 'lucide-react';

interface DynamicUpiQrCodeProps {
  upiId: string;
  upiName?: string;
  amount?: number | string;
  customLink?: string;
  size?: number;
  showDetails?: boolean;
  showAmountPicker?: boolean;
  onAmountChange?: (amt: number) => void;
  className?: string;
}

/**
 * Builds a valid, scannable UPI Payment URI string for GPay, PhonePe, Paytm, BHIM, etc.
 * Format: upi://pay?pa=RECEIVER_ID&pn=NAME&am=AMOUNT&cu=INR
 */
export function buildUpiPaymentUri(
  upiId: string,
  upiName?: string,
  amount?: number | string,
  customLink?: string
): string {
  if (customLink && customLink.trim().startsWith('upi://')) {
    let base = customLink.trim();
    const numAmt = amount ? Number(amount) : 0;
    if (numAmt > 0 && !base.includes('am=')) {
      const separator = base.includes('?') ? '&' : '?';
      base += `${separator}am=${numAmt}`;
    }
    return base;
  }

  const cleanedUpi = (upiId || 'winx7@paytm').trim();
  const cleanedName = (upiName || 'WinX7 Gaming').trim();
  const encodedName = encodeURIComponent(cleanedName);
  const numAmt = amount ? Number(amount) : 0;

  let uri = `upi://pay?pa=${cleanedUpi}&pn=${encodedName}&cu=INR`;
  if (numAmt > 0) {
    uri += `&am=${numAmt}`;
  }

  return uri;
}

export const DynamicUpiQrCode: React.FC<DynamicUpiQrCodeProps> = ({
  upiId,
  upiName = 'WinX7 Gaming',
  amount,
  customLink,
  size = 200,
  showDetails = true,
  showAmountPicker = false,
  onAmountChange,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | ''>(
    amount !== undefined && !isNaN(Number(amount)) ? Number(amount) : ''
  );

  const activeAmount = showAmountPicker
    ? (typeof selectedAmount === 'number' ? selectedAmount : 0)
    : (amount !== undefined && !isNaN(Number(amount)) ? Number(amount) : 0);

  const upiUri = buildUpiPaymentUri(upiId, upiName, activeAmount, customLink);

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const presetAmounts = [50, 100, 200, 500, 1000, 2000];
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customInputText, setCustomInputText] = useState<string>('');

  const handleSelectPreset = (amt: number) => {
    setIsCustomMode(false);
    setSelectedAmount(amt);
    setCustomInputText(String(amt));
    if (onAmountChange) onAmountChange(amt);
  };

  const handleToggleCustom = () => {
    setIsCustomMode(true);
    const initialCustom = customInputText ? Number(customInputText) : 0;
    setSelectedAmount(initialCustom > 0 ? initialCustom : '');
    if (onAmountChange) onAmountChange(initialCustom > 0 ? initialCustom : 0);
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Digits only validation
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, '');
    setCustomInputText(digitsOnly);
    const num = digitsOnly === '' ? '' : Number(digitsOnly);
    setSelectedAmount(num);
    if (onAmountChange) onAmountChange(typeof num === 'number' ? num : 0);
  };

  return (
    <div className={`flex flex-col items-center justify-center space-y-4 max-h-[85vh] overflow-y-auto pb-28 custom-scrollbar w-full px-1 ${className}`}>
      
      {/* Dynamic Amount Picker (if enabled) */}
      {showAmountPicker && (
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
              Select Deposit Amount
            </label>
            {activeAmount > 0 && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                ₹{activeAmount} Selected
              </span>
            )}
          </div>

          {/* Clean grid of predefined amounts */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {presetAmounts.map((amt) => {
              const isSelected = !isCustomMode && selectedAmount === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleSelectPreset(amt)}
                  className={`py-2 px-1 text-xs font-black rounded-xl border transition flex items-center justify-center ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black border-amber-300 shadow-lg shadow-amber-500/20 scale-105 ring-2 ring-amber-300/80'
                      : 'bg-[#181335] text-purple-200 border-purple-800/60 hover:border-amber-400/60 hover:bg-[#201A45]'
                  }`}
                >
                  ₹{amt}
                </button>
              );
            })}
          </div>

          {/* Single Clear Custom Amount Option */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleToggleCustom}
              className={`w-full py-2 px-3 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-2 ${
                isCustomMode
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500 ring-1 ring-indigo-400'
                  : 'bg-[#181335] text-purple-300 border-purple-800/60 hover:border-indigo-400/50'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isCustomMode ? 'Custom Amount Active' : 'Enter Custom Amount'}</span>
            </button>

            {/* Custom Amount Field with Numeric Validation */}
            {isCustomMode && (
              <div className="mt-2.5 relative max-w-sm mx-auto animate-in fade-in zoom-in-95">
                <IndianRupee className="absolute left-3.5 top-3 w-4 h-4 text-amber-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={customInputText}
                  onChange={handleCustomInputChange}
                  placeholder="e.g. 250 (Digits only)"
                  className="w-full pl-10 pr-3 py-2.5 bg-[#120E28] text-amber-300 font-extrabold text-sm rounded-xl border border-indigo-500/80 focus:border-amber-400 focus:outline-none text-center shadow-inner"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scannable Dynamic QR Code Container */}
      <div className="p-3.5 bg-white rounded-2xl border-4 border-amber-400 shadow-2xl flex flex-col items-center justify-center relative group">
        
        {upiId ? (
          <QRCodeSVG
            value={upiUri}
            size={size}
            level="M"
            marginSize={2}
            className="rounded-lg transition group-hover:scale-[1.02]"
          />
        ) : (
          <div
            style={{ width: size, height: size }}
            className="flex flex-col items-center justify-center text-center p-4 bg-gray-100 rounded-lg text-gray-500 text-xs font-bold"
          >
            <QrCode className="w-8 h-8 text-amber-500 mb-1" />
            <span>Enter Receiver UPI ID to generate live QR</span>
          </div>
        )}

        {/* Live Status Badge */}
        <div className="mt-2 text-[10px] font-black uppercase tracking-wider text-black bg-amber-300/90 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
          <Smartphone className="w-3 h-3 text-amber-900" />
          <span>Scan with Google Pay, PhonePe, Paytm</span>
        </div>
      </div>

      {/* UPI Details & Copy Controls */}
      {showDetails && (
        <div className="w-full max-w-sm bg-[#120E28] p-3 rounded-2xl border border-purple-800/60 space-y-2 text-left shadow-lg">
          
          <div className="flex items-center justify-between border-b border-purple-900/60 pb-2">
            <div>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Receiver UPI ID (VPA)</p>
              <p className="text-xs font-mono font-black text-amber-300 truncate">
                {upiId || 'Not Configured'}
              </p>
            </div>

            {upiId && (
              <button
                type="button"
                onClick={handleCopyUpi}
                className="px-2.5 py-1.5 rounded-xl bg-purple-900/80 hover:bg-purple-800 text-amber-300 border border-purple-700/50 text-[10px] font-bold transition flex items-center gap-1 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-amber-400" />
                    <span>Copy UPI</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Payee Name</p>
              <p className="text-white font-extrabold truncate">{upiName || 'WinX7 Gaming'}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">QR Payment Amount</p>
              <p className="text-amber-300 font-extrabold">
                {activeAmount > 0 ? `₹${activeAmount} (Fixed)` : 'Any Amount'}
              </p>
            </div>
          </div>

          {/* Quick Pay Intent Button (for mobile users) */}
          {upiId && (
            <a
              href={upiUri}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-md"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in Payment App ({upiId})</span>
            </a>
          )}
        </div>
      )}

    </div>
  );
};
