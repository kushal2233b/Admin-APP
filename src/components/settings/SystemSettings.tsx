import React, { useState, useEffect } from 'react';
import { SystemSettings as SystemSettingsType } from '../../types';
import {
  FileText,
  Shield,
  Save,
  CheckCircle2,
  Copy,
  RotateCcw,
  Lock,
  Scale,
  IndianRupee,
  Plus
} from 'lucide-react';

interface SystemSettingsProps {
  settings: SystemSettingsType;
  onUpdateSettings: (updated: SystemSettingsType) => Promise<void> | void;
}

const DEFAULT_TERMS_SECTION = `=== TERMS & CONDITIONS ===

1. ACCEPTANCE OF TERMS
By accessing or participating in tournaments on this platform, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the service.

2. ELIGIBILITY & REGISTRATION
- Users must provide accurate Game In-Game Name (IGN) and Game UID during tournament registration.
- Any mismatch in IGN/UID may result in forfeiture of match slots and prize winnings without refund.
- Users must be at least 18 years old or have parental consent to participate in cash prize tournaments.

3. ENTRY FEES & WALLET GUIDELINES
- Entry fees are deducted directly from your wallet balance upon joining a tournament.
- Once a slot is booked, entry fees are non-refundable unless the tournament is cancelled by the admin.
- Winnings are credited to your Winning Wallet immediately after verified match results are published.

4. MATCH CONDUCT & INTEGRITY
- All participants must adhere to fair play principles.
- Room credentials (Room ID and Password) will be dispatched before match start time inside the app.
- Sharing room credentials with unregistered third parties will lead to permanent account suspension.

5. PRIZE WITHDRAWALS
- Payouts are processed to the bank account / UPI ID provided in the withdrawal request.
- Ensure UPI VPA is correct; the platform is not responsible for funds sent to incorrect user-provided IDs.

6. PLATFORM DISCRETION
The administration reserves the right to cancel matches, re-verify scores, or adjust prize pools in the event of technical malfunctions, server downtime, or detected fraudulent activity.`;

const DEFAULT_FAIR_PLAY_SECTION = `=== FAIR PLAY & ANTI-CHEAT POLICY ===

1. ZERO TOLERANCE FOR CHEATING & HACKS
- The use of third-party modifications, auto-aim, wallhacks, speed hacks, scripts, configuration files, or memory injectors is strictly prohibited.
- Any player caught using hacks will receive an INSTANT PERMANENT BAN on both their player account and hardware device, with full forfeiture of wallet funds.

2. EMULATOR & PC POLICY
- Mobile tournaments are strictly restricted to genuine mobile smartphones (Android/iOS).
- Emulators (Bluestacks, LDPlayer, Nox, Gameloop), PC clients, or tablet advantages are strictly prohibited unless explicitly stated in a dedicated PC tournament mode.

3. TEAMING & COLLUSION
- Teaming up with opponents in Solo matches or colluding with rival squads is considered match-fixing and will lead to disqualification without refund.

4. ROOM CREDENTIALS SECURITY
- Do not share custom Room ID and Password with players who have not registered for the match.
- Unregistered players who enter custom rooms will be kicked immediately before match kickoff.

5. SCOREBOARD PROOF & SCREENSHOTS
- We recommend taking a screenshot of your final kill scoreboard and Booyah/placement screen at match conclusion in case of score disputes.
- In case of any dispute, admin decisions based on server logs and submitted video recordings are final and binding.`;

const DEFAULT_TERMS_AND_FAIR_PLAY = `${DEFAULT_TERMS_SECTION}

${DEFAULT_FAIR_PLAY_SECTION}`;

const DEFAULT_PRIVACY = `1. INFORMATION WE COLLECT
We collect minimal player details necessary to operate competitive esports tournaments:
- Account information: Username, Email address, Phone number.
- Gaming identifiers: Game UID, In-Game Name (IGN), Player Level.
- Financial transaction logs: Deposit reference numbers (UTR), Withdrawal requests, Wallet ledger.

2. HOW WE USE YOUR INFORMATION
- To authenticate and maintain player accounts.
- To assign tournament slots and verify match results.
- To process wallet balance recharges and prize winnings payouts.
- To detect and prevent cheating, emulators abuse, and multi-accounting fraud.

3. DATA PROTECTION & ENCRYPTION
- All sensitive transaction logs and user authentication credentials are encrypted using industry-standard protocols.
- We never sell, rent, or trade personal player information to third-party advertisers.

4. ACCOUNT SECURITY
- Players are responsible for keeping their login credentials confidential.
- In case of suspicious account activity, contact our customer desk immediately.

5. UPDATES TO THIS POLICY
We may periodically update our Privacy Policy. Changes will be posted within this section and become effective immediately upon publication.`;

export const SystemSettings: React.FC<SystemSettingsProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [formData, setFormData] = useState<SystemSettingsType>(settings);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      ...settings,
      privacyPolicyText: settings.privacyPolicyText || settings.privacyPolicy || prev.privacyPolicyText || '',
      privacyPolicy: settings.privacyPolicyText || settings.privacyPolicy || prev.privacyPolicy || '',
      termsAndFairPlayRulesText: settings.termsAndFairPlayRulesText || prev.termsAndFairPlayRulesText || ''
    }));
  }, [settings]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleLoadTemplate = (type: 'termsAndFairPlay' | 'privacyPolicy' | 'appendTerms' | 'appendFairPlay') => {
    if (type === 'termsAndFairPlay') {
      setFormData((prev) => ({
        ...prev,
        termsAndFairPlayRulesText: DEFAULT_TERMS_AND_FAIR_PLAY
      }));
    } else if (type === 'appendTerms') {
      setFormData((prev) => ({
        ...prev,
        termsAndFairPlayRulesText: prev.termsAndFairPlayRulesText
          ? `${prev.termsAndFairPlayRulesText}\n\n${DEFAULT_TERMS_SECTION}`
          : DEFAULT_TERMS_SECTION
      }));
    } else if (type === 'appendFairPlay') {
      setFormData((prev) => ({
        ...prev,
        termsAndFairPlayRulesText: prev.termsAndFairPlayRulesText
          ? `${prev.termsAndFairPlayRulesText}\n\n${DEFAULT_FAIR_PLAY_SECTION}`
          : DEFAULT_FAIR_PLAY_SECTION
      }));
    } else if (type === 'privacyPolicy') {
      setFormData((prev) => ({
        ...prev,
        privacyPolicyText: DEFAULT_PRIVACY,
        privacyPolicy: DEFAULT_PRIVACY
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: SystemSettingsType = {
        ...formData,
        privacyPolicyText: formData.privacyPolicyText || formData.privacyPolicy || '',
        privacyPolicy: formData.privacyPolicyText || formData.privacyPolicy || '',
        termsAndFairPlayRulesText: formData.termsAndFairPlayRulesText || ''
      };
      await onUpdateSettings(payload);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-16 md:pb-6 max-w-6xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0F0D24] border border-purple-900/40 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-purple-600/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md shrink-0">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                Legal & Platform Policies
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-900/60 text-purple-200 rounded-md border border-purple-700/50">
                User App Policies
              </span>
            </div>
            <p className="text-xs text-purple-300/80 mt-0.5">
              Manage the Terms & Conditions, Fair Play Rules & Anti-Cheat Policy, and Privacy Policy published live to players.
            </p>
          </div>
        </div>

        {isSaved && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-lg animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Policies Saved & Published!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 0: Payment & UPI Config */}
        <div className="bg-[#120E2E] border border-purple-900/30 rounded-2xl p-5 sm:p-6 shadow-md hover:border-purple-800/40 transition">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-950/50 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-700/40 flex items-center justify-center text-blue-300 shrink-0">
                <IndianRupee className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                  Payment & UPI Config
                </h2>
                <p className="text-[11px] text-purple-300/70">
                  Manage the UPI ID and QR code details shown to users during manual deposit.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1.5">UPI ID (VPA)</label>
              <input
                type="text"
                value={formData.upiId || ''}
                onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                placeholder="e.g. yourname@ybl"
                className="w-full bg-[#181338] text-white text-xs p-3 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1.5">UPI Name</label>
              <input
                type="text"
                value={formData.upiName || ''}
                onChange={(e) => setFormData({ ...formData, upiName: e.target.value })}
                placeholder="e.g. WinX7 Esports"
                className="w-full bg-[#181338] text-white text-xs p-3 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1.5">Deposit QR Image URL (Optional)</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={formData.depositQrImageUrl || ''}
                  onChange={(e) => setFormData({ ...formData, depositQrImageUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-[#181338] text-white text-xs p-3 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1.5">Deposit Instructions</label>
              <textarea
                rows={3}
                value={formData.depositInstructions || ''}
                onChange={(e) => setFormData({ ...formData, depositInstructions: e.target.value })}
                placeholder="Scan QR or copy UPI ID to pay..."
                className="w-full bg-[#181338] text-white text-xs p-3 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400 leading-relaxed custom-scrollbar"
              />
            </div>
          </div>
        </div>

        {/* Section 1: TERMS & CONDITIONS / FAIR PLAY & ANTI-CHEAT RULES */}
        <div className="bg-[#120E2E] border border-purple-900/30 rounded-2xl p-5 sm:p-6 shadow-md hover:border-purple-800/40 transition">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-950/50 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/40 flex items-center justify-center text-indigo-300 shrink-0">
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                  TERMS & CONDITIONS / FAIR PLAY & ANTI-CHEAT RULES
                </h2>
                <p className="text-[11px] text-purple-300/70">
                  Single unified database field storing both tournament Terms & Conditions and Fair Play / Anti-Cheat integrity rules published to the User App.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => handleLoadTemplate('termsAndFairPlay')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white border border-purple-800/50 flex items-center gap-1 transition"
                title="Load Complete Combined Template (Terms + Fair Play / Anti-Cheat)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Default Full Template</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadTemplate('appendTerms')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/50 flex items-center gap-1 transition"
                title="Append Terms & Conditions section"
              >
                <Plus className="w-3 h-3" />
                <span>+ Terms</span>
              </button>
              <button
                type="button"
                onClick={() => handleLoadTemplate('appendFairPlay')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-800/50 flex items-center gap-1 transition"
                title="Append Fair Play & Anti-Cheat section"
              >
                <Plus className="w-3 h-3" />
                <span>+ Fair Play</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy(formData.termsAndFairPlayRulesText || '', 'termsAndFairPlay')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white border border-purple-800/50 flex items-center gap-1 transition"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedField === 'termsAndFairPlay' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <textarea
              rows={14}
              value={formData.termsAndFairPlayRulesText || ''}
              onChange={(e) => setFormData({ ...formData, termsAndFairPlayRulesText: e.target.value })}
              placeholder="Enter official tournament platform terms & conditions, fair play rules, and anti-cheat policies..."
              className="w-full bg-[#181338] text-white text-xs sm:text-sm p-3.5 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400 font-mono leading-relaxed custom-scrollbar"
            />
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-purple-400/80 px-1">
              <span>Syncs directly to Supabase field: <code className="text-amber-300 font-mono">terms_and_fair_play_rules_text</code> (app_config id='general')</span>
              <span>{(formData.termsAndFairPlayRulesText || '').length} characters</span>
            </div>
          </div>
        </div>

        {/* Section 2: Privacy Policy */}
        <div className="bg-[#120E2E] border border-purple-900/30 rounded-2xl p-5 sm:p-6 shadow-md hover:border-purple-800/40 transition">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-950/50 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-700/40 flex items-center justify-center text-emerald-300 shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                  Privacy Policy
                </h2>
                <p className="text-[11px] text-purple-300/70">
                  Data protection disclosure explaining how gamer UIDs, emails, and wallet data are secured.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => handleLoadTemplate('privacyPolicy')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white border border-purple-800/50 flex items-center gap-1 transition"
                title="Load Standard Privacy Template"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Default Template</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy(formData.privacyPolicyText || formData.privacyPolicy || '', 'privacy')}
                className="px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-lg bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white border border-purple-800/50 flex items-center gap-1 transition"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedField === 'privacy' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <textarea
              rows={10}
              value={formData.privacyPolicyText || formData.privacyPolicy || ''}
              onChange={(e) => setFormData({ ...formData, privacyPolicyText: e.target.value, privacyPolicy: e.target.value })}
              placeholder="Enter official player privacy policy and data protection terms..."
              className="w-full bg-[#181338] text-white text-xs sm:text-sm p-3.5 rounded-xl border border-purple-800/40 focus:outline-none focus:border-amber-400 font-mono leading-relaxed custom-scrollbar"
            />
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-purple-400/80 px-1">
              <span>Published live to User App Privacy Policy section.</span>
              <span>{(formData.privacyPolicyText || formData.privacyPolicy || '').length} characters</span>
            </div>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#0F0D24]/95 backdrop-blur-md border border-purple-800/50 shadow-2xl">
          <div className="text-xs text-purple-300 hidden sm:block">
            Changes will be immediately verified and persisted to Supabase database (id='general').
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                handleLoadTemplate('termsAndFairPlay');
                handleLoadTemplate('privacyPolicy');
              }}
              className="px-4 py-2.5 rounded-xl bg-purple-900/40 hover:bg-purple-800 text-purple-200 text-xs font-bold border border-purple-700/50 transition active:scale-95"
            >
              Fill All Default Templates
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving to Database...' : 'Save Policies & Rules'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
