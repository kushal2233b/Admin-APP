import React, { useState, useEffect } from 'react';
import { OfficialLinkConfig, SystemSettings as SystemSettingsType } from '../../types';
import { saveOfficialLinksInFirestore } from '../../services/supabaseService';
import { CustomerSupportModal, isValidUrl } from './CustomerSupportModal';
import {
  Send,
  Phone,
  Instagram,
  Youtube,
  Save,
  Headphones,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';

interface SupportDeskConfigProps {
  settings: SystemSettingsType;
  officialLinks?: OfficialLinkConfig;
  onUpdateSettings: (newSettings: SystemSettingsType) => void;
  adminEmail?: string;
}

export const SupportDeskConfig: React.FC<SupportDeskConfigProps> = ({
  settings,
  officialLinks,
  onUpdateSettings,
  adminEmail = 'Admin'
}) => {
  const [formData, setFormData] = useState<OfficialLinkConfig>(() => ({
    telegramContact: officialLinks?.telegramContact || settings.telegramContact || settings.telegramChannel || '',
    telegramEnabled: officialLinks?.telegramEnabled !== undefined ? Boolean(officialLinks.telegramEnabled) : (settings.telegramEnabled !== undefined ? Boolean(settings.telegramEnabled) : true),
    telegramName: officialLinks?.telegramName || settings.telegramName || 'Telegram Customer Support',
    telegramDescription: officialLinks?.telegramDescription || settings.telegramDescription || 'Instant 24/7 support & match query resolution',

    whatsappContact: officialLinks?.whatsappContact || settings.whatsappContact || settings.whatsappGroup || '',
    whatsappEnabled: officialLinks?.whatsappEnabled !== undefined ? Boolean(officialLinks.whatsappEnabled) : (settings.whatsappEnabled !== undefined ? Boolean(settings.whatsappEnabled) : true),
    whatsappName: officialLinks?.whatsappName || settings.whatsappName || 'WhatsApp Official Update Channel',
    whatsappDescription: officialLinks?.whatsappDescription || settings.whatsappDescription || 'Get official match announcements & room ID updates',

    instagramContact: officialLinks?.instagramContact || settings.instagramContact || '',
    instagramEnabled: officialLinks?.instagramEnabled !== undefined ? Boolean(officialLinks.instagramEnabled) : (settings.instagramEnabled !== undefined ? Boolean(settings.instagramEnabled) : true),
    instagramName: officialLinks?.instagramName || settings.instagramName || 'Instagram Official Page',
    instagramDescription: officialLinks?.instagramDescription || settings.instagramDescription || 'Follow for tournament highlights, giveaways & news',

    youtubeContact: officialLinks?.youtubeContact || settings.youtubeContact || settings.youtubeChannel || '',
    youtubeEnabled: officialLinks?.youtubeEnabled !== undefined ? Boolean(officialLinks.youtubeEnabled) : (settings.youtubeEnabled !== undefined ? Boolean(settings.youtubeEnabled) : true),
    youtubeName: officialLinks?.youtubeName || settings.youtubeName || 'YouTube Official Channel',
    youtubeDescription: officialLinks?.youtubeDescription || settings.youtubeDescription || 'Watch live streamings & official match replays',

    updatedAt: officialLinks?.updatedAt || new Date().toISOString(),
    updatedBy: officialLinks?.updatedBy || adminEmail
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (officialLinks) {
      setFormData({
        telegramContact: officialLinks.telegramContact || '',
        telegramEnabled: Boolean(officialLinks.telegramEnabled),
        telegramName: officialLinks.telegramName || 'Telegram Customer Support',
        telegramDescription: officialLinks.telegramDescription || 'Instant 24/7 support & match query resolution',

        whatsappContact: officialLinks.whatsappContact || '',
        whatsappEnabled: Boolean(officialLinks.whatsappEnabled),
        whatsappName: officialLinks.whatsappName || 'WhatsApp Official Update Channel',
        whatsappDescription: officialLinks.whatsappDescription || 'Get official match announcements & room ID updates',

        instagramContact: officialLinks.instagramContact || '',
        instagramEnabled: Boolean(officialLinks.instagramEnabled),
        instagramName: officialLinks.instagramName || 'Instagram Official Page',
        instagramDescription: officialLinks.instagramDescription || 'Follow for tournament highlights, giveaways & news',

        youtubeContact: officialLinks.youtubeContact || '',
        youtubeEnabled: Boolean(officialLinks.youtubeEnabled),
        youtubeName: officialLinks.youtubeName || 'YouTube Official Channel',
        youtubeDescription: officialLinks.youtubeDescription || 'Watch live streamings & official match replays',

        updatedAt: officialLinks.updatedAt || new Date().toISOString(),
        updatedBy: officialLinks.updatedBy || adminEmail
      });
    }
  }, [officialLinks, adminEmail]);

  const validateForm = (): boolean => {
    setSaveError(null);

    // Validate enabled links
    if (formData.telegramEnabled) {
      if (!formData.telegramContact.trim()) {
        setSaveError('Telegram Customer Support is ENABLED but the URL is empty.');
        return false;
      }
      if (!isValidUrl(formData.telegramContact)) {
        setSaveError('Telegram Customer Support URL must start with http:// or https://');
        return false;
      }
    }

    if (formData.whatsappEnabled) {
      if (!formData.whatsappContact.trim()) {
        setSaveError('WhatsApp Official Update Channel is ENABLED but the URL is empty.');
        return false;
      }
      if (!isValidUrl(formData.whatsappContact)) {
        setSaveError('WhatsApp Channel URL must start with http:// or https://');
        return false;
      }
    }

    if (formData.instagramEnabled) {
      if (!formData.instagramContact.trim()) {
        setSaveError('Instagram Official Page is ENABLED but the URL is empty.');
        return false;
      }
      if (!isValidUrl(formData.instagramContact)) {
        setSaveError('Instagram Page URL must start with http:// or https://');
        return false;
      }
    }

    if (formData.youtubeEnabled) {
      if (!formData.youtubeContact.trim()) {
        setSaveError('YouTube Official Channel is ENABLED but the URL is empty.');
        return false;
      }
      if (!isValidUrl(formData.youtubeContact)) {
        setSaveError('YouTube Channel URL must start with http:// or https://');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(null);

    if (!validateForm()) return;

    setIsSaving(true);
    try {
      // 1. Write to centralized official links in Supabase
      await saveOfficialLinksInFirestore(formData, adminEmail);

      // 2. Also update system settings state & database documents using exact DB fields
      const updatedSystemSettings: SystemSettingsType = {
        ...settings,
        telegramContact: formData.telegramContact,
        telegramEnabled: formData.telegramEnabled,
        telegramName: formData.telegramName,
        telegramDescription: formData.telegramDescription,

        whatsappContact: formData.whatsappContact,
        whatsappEnabled: formData.whatsappEnabled,
        whatsappName: formData.whatsappName,
        whatsappDescription: formData.whatsappDescription,

        instagramContact: formData.instagramContact,
        instagramEnabled: formData.instagramEnabled,
        instagramName: formData.instagramName,
        instagramDescription: formData.instagramDescription,

        youtubeContact: formData.youtubeContact,
        youtubeEnabled: formData.youtubeEnabled,
        youtubeName: formData.youtubeName,
        youtubeDescription: formData.youtubeDescription,

        // Backwards compatibility legacy fields
        whatsappGroup: formData.whatsappContact,
        telegramChannel: formData.telegramContact,
        youtubeChannel: formData.youtubeContact
      };

      await onUpdateSettings(updatedSystemSettings);

      setSaveSuccess('Official Links & Support Desk configuration saved successfully! Synced to Supabase.');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error saving support links:', err);
      setSaveError(err.message || 'Failed to save official links. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const channels = [
    {
      id: 'telegram',
      title: '1. Telegram Customer Support',
      icon: Send,
      color: '#0088cc',
      urlValue: formData.telegramContact,
      setUrlValue: (val: string) => setFormData({ ...formData, telegramContact: val }),
      enabledValue: formData.telegramEnabled,
      setEnabledValue: (val: boolean) => setFormData({ ...formData, telegramEnabled: val }),
      nameValue: formData.telegramName,
      setNameValue: (val: string) => setFormData({ ...formData, telegramName: val }),
      descValue: formData.telegramDescription,
      setDescValue: (val: string) => setFormData({ ...formData, telegramDescription: val }),
      placeholderUrl: 'https://t.me/your_official_support'
    },
    {
      id: 'whatsapp',
      title: '2. WhatsApp Official Update Channel',
      icon: Phone,
      color: '#25D366',
      urlValue: formData.whatsappContact,
      setUrlValue: (val: string) => setFormData({ ...formData, whatsappContact: val }),
      enabledValue: formData.whatsappEnabled,
      setEnabledValue: (val: boolean) => setFormData({ ...formData, whatsappEnabled: val }),
      nameValue: formData.whatsappName,
      setNameValue: (val: string) => setFormData({ ...formData, whatsappName: val }),
      descValue: formData.whatsappDescription,
      setDescValue: (val: string) => setFormData({ ...formData, whatsappDescription: val }),
      placeholderUrl: 'https://whatsapp.com/channel/your_channel'
    },
    {
      id: 'instagram',
      title: '3. Instagram Official Page',
      icon: Instagram,
      color: '#E1306C',
      urlValue: formData.instagramContact,
      setUrlValue: (val: string) => setFormData({ ...formData, instagramContact: val }),
      enabledValue: formData.instagramEnabled,
      setEnabledValue: (val: boolean) => setFormData({ ...formData, instagramEnabled: val }),
      nameValue: formData.instagramName,
      setNameValue: (val: string) => setFormData({ ...formData, instagramName: val }),
      descValue: formData.instagramDescription,
      setDescValue: (val: string) => setFormData({ ...formData, instagramDescription: val }),
      placeholderUrl: 'https://instagram.com/your_official_handle'
    },
    {
      id: 'youtube',
      title: '4. YouTube Official Channel',
      icon: Youtube,
      color: '#FF0000',
      urlValue: formData.youtubeContact,
      setUrlValue: (val: string) => setFormData({ ...formData, youtubeContact: val }),
      enabledValue: formData.youtubeEnabled,
      setEnabledValue: (val: boolean) => setFormData({ ...formData, youtubeEnabled: val }),
      nameValue: formData.youtubeName,
      setNameValue: (val: string) => setFormData({ ...formData, youtubeName: val }),
      descValue: formData.youtubeDescription,
      setDescValue: (val: string) => setFormData({ ...formData, youtubeDescription: val }),
      placeholderUrl: 'https://youtube.com/@your_official_channel'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-16 md:pb-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#15112E] border border-purple-800/50 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.3)]">
            <Headphones className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              Official Links & Support Desk
            </h1>
            <p className="text-xs text-purple-300/80">
              Manage live official channels in Firestore doc <code className="text-amber-300 font-mono">appConfig/officialLinks</code>
            </p>
          </div>
        </div>

        {/* Live Help Desk Tester Trigger */}
        <button
          type="button"
          onClick={() => setShowPreviewModal(true)}
          className="px-4 py-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 border border-purple-700/50 text-amber-300 font-bold text-xs uppercase flex items-center gap-2 transition active:scale-95 shadow-md"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Customer Support & Help Desk (Live Preview)</span>
        </button>
      </div>

      {/* Save Alerts */}
      {saveError && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 text-xs font-semibold flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Main Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {channels.map((ch) => {
            const Icon = ch.icon;
            const isUrlValid = isValidUrl(ch.urlValue);

            return (
              <div
                key={ch.id}
                className={`p-5 rounded-3xl bg-[#1A1538] border transition-all relative overflow-hidden flex flex-col justify-between ${
                  ch.enabledValue
                    ? 'border-amber-400/50 shadow-lg shadow-purple-950/80'
                    : 'border-purple-800/40 opacity-90'
                }`}
              >
                <div>
                  {/* Channel Top Bar */}
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-purple-800/40">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shadow-inner"
                        style={{ backgroundColor: `${ch.color}20`, border: `1px solid ${ch.color}40` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: ch.color }} />
                      </div>
                      <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                        {ch.title}
                      </h3>
                    </div>

                    {/* Enable / Disable Toggle Switch */}
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={ch.enabledValue}
                        onChange={(e) => ch.setEnabledValue(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-purple-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-purple-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400"></div>
                      <span className="ml-2 text-[10px] font-black uppercase text-purple-300">
                        {ch.enabledValue ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  {/* Fields Container */}
                  <div className="space-y-3.5">
                    {/* Display Name Input */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={ch.nameValue}
                        onChange={(e) => ch.setNameValue(e.target.value)}
                        placeholder="e.g. Telegram Customer Support"
                        className="w-full bg-[#120F24] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/60 focus:border-amber-400 focus:outline-none transition-colors"
                      />
                    </div>

                    {/* Target URL Input */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-amber-300 mb-1 flex items-center justify-between">
                        <span>Official Destination URL</span>
                        {ch.urlValue && (
                          <span className={`text-[9px] font-bold ${isUrlValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUrlValid ? '✓ Valid HTTP(S) URL' : '✕ Invalid URL Format'}
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="url"
                          value={ch.urlValue}
                          onChange={(e) => ch.setUrlValue(e.target.value)}
                          placeholder={ch.placeholderUrl}
                          className={`w-full bg-[#120F24] text-white text-xs pl-3 pr-9 py-2.5 rounded-xl border focus:outline-none transition-colors ${
                            ch.enabledValue && !isUrlValid
                              ? 'border-rose-500/80 focus:border-rose-400'
                              : 'border-purple-800/60 focus:border-amber-400'
                          }`}
                        />
                        {ch.urlValue && isUrlValid && (
                          <button
                            type="button"
                            onClick={() => window.open(ch.urlValue.trim(), '_blank', 'noopener,noreferrer')}
                            title="Test open link in browser"
                            className="absolute right-2.5 top-2.5 p-1 text-purple-400 hover:text-amber-300 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Short Description Input */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                        Short Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={ch.descValue}
                        onChange={(e) => ch.setDescValue(e.target.value)}
                        placeholder="e.g. 24/7 assistance for match issues"
                        className="w-full bg-[#120F24] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/60 focus:border-amber-400 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="mt-4 pt-3 border-t border-purple-800/30 flex items-center justify-between text-[11px]">
                  <span className="text-purple-400 font-medium">Live Status in User App:</span>
                  {ch.enabledValue && isUrlValid ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800/50">
                      <CheckCircle2 className="w-3 h-3" /> Published & Active
                    </span>
                  ) : ch.enabledValue && !isUrlValid ? (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-400 bg-rose-950/60 px-2.5 py-0.5 rounded-full border border-rose-800/50">
                      <XCircle className="w-3 h-3" /> Missing Valid URL
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-purple-400 bg-purple-950/60 px-2.5 py-0.5 rounded-full border border-purple-800/50">
                      <XCircle className="w-3 h-3" /> Disabled / Hidden
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Action Bar */}
        <div className="p-5 rounded-3xl bg-[#1A1538] border border-purple-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-purple-300">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              Saving updates Firestore document <code className="text-amber-300 font-mono">appConfig/officialLinks</code>. Changes propagate instantly to all player apps without requiring an app store update.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-xl bg-amber-400 text-black font-black uppercase text-xs tracking-wider hover:bg-amber-300 transition shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.5)] flex items-center justify-center gap-2.5 ${
              isSaving ? 'opacity-75 cursor-wait' : 'active:scale-95'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving to Firestore...' : 'Save & Publish Official Links'}</span>
          </button>
        </div>
      </form>

      {/* Customer Support & Help Desk Live Modal Tester */}
      <CustomerSupportModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        links={formData}
      />
    </div>
  );
};
