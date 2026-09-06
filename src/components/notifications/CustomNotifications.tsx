import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Users,
  User,
  Gamepad2,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Link as LinkIcon,
  Image as ImageIcon,
  Key,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  sendCustomNotification,
  checkFcmBackendStatus,
  FcmResponse
} from '../../services/notificationSenderService';
import { AppUser, Tournament, AppNotification } from '../../types';

interface CustomNotificationsProps {
  users: AppUser[];
  tournaments: Tournament[];
  notifications: AppNotification[];
  onSaveNotificationToHistory?: (notif: any) => Promise<void>;
  showConfirmationOverlay: (
    title: string,
    message: string,
    details?: { label: string; value: string | number }[],
    badgeTag?: string,
    icon?: 'success' | 'warning' | 'danger' | 'info' | 'refresh'
  ) => void;
}

export const CustomNotifications: React.FC<CustomNotificationsProps> = ({
  users,
  tournaments,
  notifications,
  onSaveNotificationToHistory,
  showConfirmationOverlay
}) => {
  // Target type: 'all' | 'user' | 'match'
  const [targetType, setTargetType] = useState<'all' | 'user' | 'match'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Notification Content
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [link, setLink] = useState<string>('');

  // Event ID for Idempotency
  const generateNewEventId = () => `custom_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const [eventId, setEventId] = useState<string>(generateNewEventId());

  // Status & State
  const [isSending, setIsSending] = useState(false);
  const [fcmStatus, setFcmStatus] = useState<{ configured: boolean; error: string | null } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [recentSends, setRecentSends] = useState<
    Array<{
      id: string;
      eventId: string;
      targetType: string;
      recipientSummary: string;
      title: string;
      message: string;
      successCount: number;
      totalTokens: number;
      timestamp: string;
      success: boolean;
    }>
  >([]);

  // Check backend FCM status on mount
  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const status = await checkFcmBackendStatus();
      setFcmStatus(status);
    } catch (err: any) {
      setFcmStatus({ configured: false, error: err?.message || 'Error checking status' });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // Filter users for user picker
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return users.slice(0, 15);
    const q = userSearchQuery.toLowerCase().trim();
    return users.filter(
      u =>
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.inGameName && u.inGameName.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q)) ||
        (u.uid && u.uid.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [users, userSearchQuery]);

  // Selected user info
  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find(u => u.id === selectedUserId || u.uid === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Selected match info
  const selectedMatch = useMemo(() => {
    if (!selectedMatchId) return null;
    return tournaments.find(t => t.id === selectedMatchId) || null;
  }, [tournaments, selectedMatchId]);

  // Quick Preset Templates
  const handleApplyPreset = (presetTitle: string, presetMessage: string, presetLink?: string) => {
    setTitle(presetTitle);
    setMessage(presetMessage);
    if (presetLink) setLink(presetLink);
    setEventId(generateNewEventId());
  };

  // Submit Handler
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Please enter a notification title.');
      return;
    }
    if (!message.trim()) {
      alert('Please enter a notification message.');
      return;
    }

    if (targetType === 'user' && !selectedUserId.trim()) {
      alert('Please select or specify a target user.');
      return;
    }

    if (targetType === 'match' && !selectedMatchId.trim()) {
      alert('Please select a tournament match.');
      return;
    }

    setIsSending(true);

    try {
      const response: FcmResponse = await sendCustomNotification({
        eventId,
        targetType,
        targetUserId: targetType === 'user' ? selectedUserId.trim() : undefined,
        targetMatchId: targetType === 'match' ? selectedMatchId.trim() : undefined,
        title: title.trim(),
        message: message.trim(),
        imageUrl: imageUrl.trim() || undefined,
        link: link.trim() || undefined
      });

      if (response.success) {
        // Add to local recent sends log
        const newRecord = {
          id: `log-${Date.now()}`,
          eventId: response.eventId || eventId,
          targetType,
          recipientSummary: response.recipientSummary || (targetType === 'all' ? 'All Users' : targetType === 'user' ? `User ${selectedUser?.username || selectedUserId}` : `Match ${selectedMatch?.title || selectedMatchId}`),
          title: title.trim(),
          message: message.trim(),
          successCount: response.successCount || 0,
          totalTokens: response.totalTokens || 0,
          timestamp: new Date().toLocaleTimeString(),
          success: true
        };
        setRecentSends(prev => [newRecord, ...prev]);

        // Save to parent history if callback provided
        if (onSaveNotificationToHistory) {
          onSaveNotificationToHistory({
            title: title.trim(),
            message: message.trim(),
            type: 'CUSTOM',
            targetUserId: targetType === 'user' ? selectedUserId.trim() : undefined,
            targetMatchId: targetType === 'match' ? selectedMatchId.trim() : undefined,
            imageUrl: imageUrl.trim() || undefined,
            link: link.trim() || undefined
          }).catch(console.warn);
        }

        showConfirmationOverlay(
          'Push Notification Dispatched!',
          response.message || `Notification was successfully transmitted via Firebase Cloud Messaging.`,
          [
            { label: 'Event ID', value: response.eventId || eventId },
            { label: 'Target Audience', value: targetType.toUpperCase() },
            { label: 'Devices Reached', value: `${response.successCount || 0} / ${response.totalTokens || 0}` },
            { label: 'Notification Title', value: title.trim() }
          ],
          'CUSTOM PUSH SENT',
          'success'
        );

        // Reset form content & regenerate fresh eventId
        setTitle('');
        setMessage('');
        setImageUrl('');
        setLink('');
        setEventId(generateNewEventId());
      } else if (response.skipped) {
        showConfirmationOverlay(
          'Duplicate Prevented (Idempotent)',
          response.message || 'A notification with this Event ID has already been transmitted.',
          [
            { label: 'Event ID', value: response.eventId || eventId },
            { label: 'Status', value: 'SKIPPED (NO DUPLICATE)' }
          ],
          'IDEMPOTENT EVENT',
          'info'
        );
      } else {
        alert(`Notification Delivery Notice: ${response.message || response.error || 'Failed to deliver notification.'}`);
      }
    } catch (err: any) {
      console.error('[handleSend Custom Notification Error]:', err);
      alert(`Send Failed: ${err?.message || String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12" id="custom-notifications-page">
      {/* Top Header Card */}
      <div className="bg-[#141215] border border-[#29252A] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E21B36] via-[#C9A34E] to-[#4A0D16] p-0.5 flex-shrink-0">
            <div className="w-full h-full bg-[#0D0B0D] rounded-[10px] flex items-center justify-center">
              <Bell className="w-6 h-6 text-[#C9A34E]" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-[#F5F5F5] tracking-wide flex items-center gap-2">
              Custom Push Notifications
              <span className="text-[10px] bg-[#29252A] text-[#C9A34E] px-2 py-0.5 rounded-full border border-[#C9A34E]/30 font-bold uppercase tracking-wider">
                FCM Targeted
              </span>
            </h1>
            <p className="text-xs text-[#B0ACB0] mt-0.5">
              Transmit custom push notifications to all users, specific players, or match participants with duplicate prevention.
            </p>
          </div>
        </div>

        {/* Backend Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D0B0D] border border-[#29252A]">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                fcmStatus?.configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <div className="text-left">
              <p className="text-[10px] text-[#777278] font-bold uppercase tracking-wider">FCM Backend</p>
              <p className="text-xs font-semibold text-white">
                {fcmStatus?.configured ? 'Connected & Ready' : 'Configuring...'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={checkStatus}
            disabled={isCheckingStatus}
            title="Refresh backend status"
            className="p-2.5 rounded-lg bg-[#1C191E] border border-[#29252A] text-[#B0ACB0] hover:text-white hover:border-[#C9A34E]/40 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Compose Form */}
      <div className="max-w-4xl mx-auto space-y-5">
        <form onSubmit={handleSend} className="bg-[#141215] border border-[#29252A] rounded-xl p-6 space-y-5">
            
            {/* 1. Target Audience Selector */}
            <div>
              <label className="block text-xs font-bold text-[#F5F5F5] uppercase tracking-wider mb-2.5">
                1. Target Audience
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType('all')}
                  className={`p-3 rounded-lg border text-left flex flex-col items-start gap-1 transition-all ${
                    targetType === 'all'
                      ? 'bg-gradient-to-b from-[#4A0D16] to-[#350A12] border-[#E21B36] text-white shadow-lg'
                      : 'bg-[#1C191E] border-[#29252A] text-[#B0ACB0] hover:text-white hover:border-[#4A0D16]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#C9A34E]" />
                    <span className="text-xs font-black">All Users</span>
                  </div>
                  <span className="text-[10px] text-[#B0ACB0]">Broadcast to all active app players</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('user')}
                  className={`p-3 rounded-lg border text-left flex flex-col items-start gap-1 transition-all ${
                    targetType === 'user'
                      ? 'bg-gradient-to-b from-[#4A0D16] to-[#350A12] border-[#E21B36] text-white shadow-lg'
                      : 'bg-[#1C191E] border-[#29252A] text-[#B0ACB0] hover:text-white hover:border-[#4A0D16]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#C9A34E]" />
                    <span className="text-xs font-black">Specific User</span>
                  </div>
                  <span className="text-[10px] text-[#B0ACB0]">Target an individual player</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('match')}
                  className={`p-3 rounded-lg border text-left flex flex-col items-start gap-1 transition-all ${
                    targetType === 'match'
                      ? 'bg-gradient-to-b from-[#4A0D16] to-[#350A12] border-[#E21B36] text-white shadow-lg'
                      : 'bg-[#1C191E] border-[#29252A] text-[#B0ACB0] hover:text-white hover:border-[#4A0D16]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-[#C9A34E]" />
                    <span className="text-xs font-black">Match Players</span>
                  </div>
                  <span className="text-[10px] text-[#B0ACB0]">Players joined in a match</span>
                </button>
              </div>

              {/* Specific User Search/Picker */}
              {targetType === 'user' && (
                <div className="mt-3.5 p-3.5 bg-[#0D0B0D] border border-[#29252A] rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#F5F5F5]">Select or Search Target Player</span>
                    {selectedUser && (
                      <span className="text-[11px] text-[#C9A34E] font-medium">
                        Selected: {selectedUser.username || selectedUser.inGameName || selectedUser.id}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Search by username, in-game name, email, or user ID..."
                    value={userSearchQuery}
                    onChange={e => setUserSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#171418] border border-[#29252A] rounded-lg text-white placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none"
                  />
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {filteredUsers.map(u => (
                      <button
                        key={u.id || u.uid}
                        type="button"
                        onClick={() => {
                          setSelectedUserId(u.id || u.uid || '');
                        }}
                        className={`w-full px-2.5 py-1.5 rounded text-left flex items-center justify-between text-xs transition-colors ${
                          selectedUserId === (u.id || u.uid)
                            ? 'bg-[#E21B36]/20 border border-[#E21B36]/60 text-white'
                            : 'hover:bg-[#1C191E] text-[#B0ACB0]'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-bold text-white mr-2">{u.username || 'Unnamed'}</span>
                          {u.inGameName && <span className="text-[10px] text-[#C9A34E] mr-2">IGN: {u.inGameName}</span>}
                          <span className="text-[10px] text-[#777278]">({u.email || u.id})</span>
                        </div>
                        {selectedUserId === (u.id || u.uid) && <Check className="w-3.5 h-3.5 text-[#C9A34E]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Match Participants Picker */}
              {targetType === 'match' && (
                <div className="mt-3.5 p-3.5 bg-[#0D0B0D] border border-[#29252A] rounded-lg space-y-2">
                  <span className="text-xs font-bold text-[#F5F5F5]">Select Tournament Match</span>
                  <select
                    value={selectedMatchId}
                    onChange={e => setSelectedMatchId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#171418] border border-[#29252A] rounded-lg text-white focus:border-[#C9A34E] focus:outline-none"
                  >
                    <option value="">-- Choose a tournament match --</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.game || 'Game'}) — {t.participants?.length || 0} participants [{t.status}]
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Preset Buttons */}
            <div>
              <label className="block text-[11px] font-bold text-[#777278] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#C9A34E]" />
                Quick Message Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset(
                      'WINX7 Mega Tournament Live! 🔥',
                      'New high-prize esports match is now open for registration. Join before slots fill up!'
                    )
                  }
                  className="px-2.5 py-1 text-[11px] bg-[#1C191E] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white rounded border border-[#29252A] transition-colors"
                >
                  Mega Tournament Live
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset(
                      'WINX7 🏆 Match Update',
                      'Attention players: Room credentials and slot details will be unlocked 15 minutes before game time.'
                    )
                  }
                  className="px-2.5 py-1 text-[11px] bg-[#1C191E] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white rounded border border-[#29252A] transition-colors"
                >
                  Room Credentials Notice
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyPreset(
                      'WINX7 ⚡ Instant Deposit Bonus',
                      'Claim extra wallet balance on your next deposit today. Open the app to learn more.'
                    )
                  }
                  className="px-2.5 py-1 text-[11px] bg-[#1C191E] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white rounded border border-[#29252A] transition-colors"
                >
                  Deposit Bonus
                </button>
              </div>
            </div>

            {/* 2. Title & Message Inputs */}
            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">
                    Notification Title <span className="text-[#E21B36]">*</span>
                  </label>
                  <span className="text-[10px] text-[#777278]">{title.length}/65</span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={65}
                  placeholder="e.g. WINX7 Special Announcement 🏆"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0D0B0D] border border-[#29252A] rounded-lg text-white placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">
                    Message Body <span className="text-[#E21B36]">*</span>
                  </label>
                  <span className="text-[10px] text-[#777278]">{message.length}/240</span>
                </div>
                <textarea
                  required
                  rows={3}
                  maxLength={240}
                  placeholder="Type the message body to be shown on the user's notification bar..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0D0B0D] border border-[#29252A] rounded-lg text-white placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* 3. Optional Image & Deep Link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#C9A34E]" />
                  Banner Image URL <span className="text-[10px] text-[#777278] font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/banner.png"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0D0B0D] border border-[#29252A] rounded-lg text-white placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-[#C9A34E]" />
                  Action / Deep Link <span className="text-[10px] text-[#777278] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="winx7://tournament/... or web link"
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0D0B0D] border border-[#29252A] rounded-lg text-white placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none"
                />
              </div>
            </div>

            {/* 4. Event ID / Duplicate Prevention Key */}
            <div className="p-3 bg-[#0D0B0D] border border-[#29252A] rounded-lg flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <Key className="w-3.5 h-3.5 text-[#C9A34E] flex-shrink-0" />
                <div className="truncate">
                  <p className="text-[10px] text-[#777278] font-bold uppercase tracking-wider">
                    Idempotency Event ID (Duplicate Prevention)
                  </p>
                  <p className="text-xs font-mono text-[#F5F5F5] truncate">{eventId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEventId(generateNewEventId())}
                className="text-[10px] text-[#C9A34E] hover:text-white px-2 py-1 bg-[#1C191E] rounded border border-[#29252A] flex-shrink-0 transition-colors"
              >
                Regenerate
              </button>
            </div>

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#C9A34E] via-[#E21B36] to-[#4A0D16] hover:brightness-110 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-black transition-all cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Transmitting FCM Push Notification...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    Send Custom Push Notification
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

      {/* Sent Notifications Log Section */}
      {recentSends.length > 0 && (
        <div className="bg-[#141215] border border-[#29252A] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Recent FCM Dispatches (Session Log)
            </h3>
            <span className="text-xs text-[#777278]">{recentSends.length} sent</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-[#777278] border-b border-[#29252A]">
                <tr>
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Target</th>
                  <th className="py-2 px-3">Title</th>
                  <th className="py-2 px-3">Event ID</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#29252A]">
                {recentSends.map(record => (
                  <tr key={record.id} className="hover:bg-[#1C191E]/50">
                    <td className="py-2.5 px-3 text-[#777278]">{record.timestamp}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-white mr-1.5">{record.recipientSummary}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#29252A] text-[#C9A34E] uppercase">
                        {record.targetType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-white max-w-xs truncate">{record.title}</td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-[#777278]">{record.eventId}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Delivered ({record.successCount}/{record.totalTokens})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
