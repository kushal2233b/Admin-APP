import React from 'react';
import { OfficialLinkConfig } from '../../types';
import { Send, Phone, Instagram, Youtube, X, Headphones, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface CustomerSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: OfficialLinkConfig;
}

export function isValidUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }
}

export const CustomerSupportModal: React.FC<CustomerSupportModalProps> = ({
  isOpen,
  onClose,
  links
}) => {
  if (!isOpen) return null;

  const handleOpenLink = (rawUrl: string | undefined, title: string) => {
    if (!rawUrl || !isValidUrl(rawUrl)) {
      alert(`The official link for "${title}" is not configured yet or invalid.`);
      return;
    }
    const clean = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    window.open(clean, '_blank', 'noopener,noreferrer');
  };

  const supportOptions = [
    {
      id: 'telegram',
      title: links.telegramName || 'Telegram Customer Support',
      description: links.telegramDescription || 'Instant 24/7 support & match query resolution',
      url: links.telegramContact,
      enabled: Boolean(links.telegramEnabled) && isValidUrl(links.telegramContact),
      icon: Send,
      color: '#0088cc',
      bgGradient: 'from-sky-500/10 via-sky-500/5 to-transparent',
      borderColor: 'border-sky-500/30',
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40'
    },
    {
      id: 'whatsapp',
      title: links.whatsappName || 'WhatsApp Official Update Channel',
      description: links.whatsappDescription || 'Get official match announcements & room ID updates',
      url: links.whatsappContact,
      enabled: Boolean(links.whatsappEnabled) && isValidUrl(links.whatsappContact),
      icon: Phone,
      color: '#25D366',
      bgGradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      borderColor: 'border-emerald-500/30',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    },
    {
      id: 'instagram',
      title: links.instagramName || 'Instagram Official Page',
      description: links.instagramDescription || 'Follow for tournament highlights, giveaways & news',
      url: links.instagramContact,
      enabled: Boolean(links.instagramEnabled) && isValidUrl(links.instagramContact),
      icon: Instagram,
      color: '#E1306C',
      bgGradient: 'from-rose-500/10 via-rose-500/5 to-transparent',
      borderColor: 'border-rose-500/30',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    },
    {
      id: 'youtube',
      title: links.youtubeName || 'YouTube Official Channel',
      description: links.youtubeDescription || 'Watch live streamings & official match replays',
      url: links.youtubeContact,
      enabled: Boolean(links.youtubeEnabled) && isValidUrl(links.youtubeContact),
      icon: Youtube,
      color: '#FF0000',
      bgGradient: 'from-red-500/10 via-red-500/5 to-transparent',
      borderColor: 'border-red-500/30',
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40'
    }
  ];

  const activeChannels = supportOptions.filter((opt) => opt.enabled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-[#141029] border border-purple-800/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-purple-800/50 bg-gradient-to-r from-purple-950/80 via-[#181335] to-[#141029] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Headphones className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                Customer Support & Help Desk
              </h2>
              <p className="text-xs text-purple-300/80 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 inline" />
                Verified Official Communication Channels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 hover:text-white transition active:scale-95"
            aria-label="Close Support Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
          {activeChannels.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl bg-[#1A1538] border border-purple-800/40 space-y-3">
              <Headphones className="w-12 h-12 text-purple-400/50 mx-auto animate-pulse" />
              <h3 className="text-sm font-extrabold text-amber-300 uppercase">Support Desk Currently Offline</h3>
              <p className="text-xs text-purple-300/80 max-w-xs mx-auto">
                No official support channels are currently enabled by the administration. Please check back shortly.
              </p>
            </div>
          ) : (
            activeChannels.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => handleOpenLink(item.url, item.title)}
                  className={`p-4 rounded-2xl bg-gradient-to-r ${item.bgGradient} border ${item.borderColor} bg-[#1A1538] hover:bg-[#1E1942] transition-all cursor-pointer group shadow-lg flex items-center justify-between gap-4 active:scale-[0.99]`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: `${item.color}20`, border: `1px solid ${item.color}40` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: item.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors">
                          {item.title}
                        </h4>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${item.badgeColor} flex items-center gap-1`}>
                          <CheckCircle2 className="w-2.5 h-2.5 inline" /> Official
                        </span>
                      </div>
                      <p className="text-xs text-purple-300/80 mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-purple-900/40 group-hover:bg-amber-400 group-hover:text-black text-amber-300 transition-colors flex-shrink-0 shadow-sm">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-purple-800/50 bg-[#100D21] flex items-center justify-between text-[11px] text-purple-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Always verify official links before sharing credentials.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/60 text-purple-200 font-bold uppercase transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
