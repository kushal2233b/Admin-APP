import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SupportConversation, SupportMessage, SupportCategory, StaffMember } from '../../types';
import { supabase } from '../../services/supabase';
import {
  fetchSupportCategoriesFromSupabase,
  createSupportCategoryInSupabase,
  updateSupportCategoryInSupabase,
  deleteSupportCategoryFromSupabase,
  fetchSupportConversationsFromSupabase,
  claimSupportRequestInSupabase,
  resolveSupportRequestInSupabase,
  reopenSupportRequestInSupabase,
  sendSupportMessageToSupabase,
  subscribeToSupportConversations,
  fetchStaffMembersFromSupabase,
  getVerifiedStaffProfile
} from '../../services/supabaseService';
import {
  Send,
  User,
  Shield,
  MessageSquare,
  Clock,
  UserCheck,
  UserMinus,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  ArrowLeft,
  ChevronRight,
  Settings,
  Trash2,
  Edit2,
  Check,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export const LiveChatSupport: React.FC = () => {
  const { currentUser } = useAuth();

  // Real-time Support Chats & Categories
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state for Support Inbox
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'active' | 'mine' | 'closed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'unread'>('newest');

  // Selected chat ID in Admin View
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Reply Text input states
  const [adminReplyText, setAdminReplyText] = useState('');
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ensure standard relative time output
  const formatRelativeTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } catch {
      return 'Recently';
    }
  };

  // 1. Subscribe to Live Conversations, Categories & Staff
  useEffect(() => {
    setLoading(true);

    const unsubscribe = subscribeToSupportConversations((list) => {
      setConversations(list || []);
      setLoading(false);
    });

    // Load active support categories
    fetchSupportCategoriesFromSupabase()
      .then((cats) => {
        setCategories(cats || []);
      })
      .catch((err) => {
        console.warn('[Support] Failed to load categories:', err);
      });

    // Fetch active staff
    fetchStaffMembersFromSupabase()
      .then((members) => {
        setStaffMembers((members || []).filter(m => m.status === 'ACTIVE'));
      })
      .catch((err) => {
        console.warn('[Support] Failed to load staff:', err);
      });

    return () => {
      unsubscribe();
    };
  }, []);

  // 2. Scroll to bottom of chat history on select
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChatId, conversations]);

  // Mark admin chat as read when opened
  useEffect(() => {
    if (selectedChatId) {
      const activeChat = conversations.find(c => c.id === selectedChatId);
      if (activeChat && activeChat.unreadCount > 0) {
        // Clear unread count locally and write to DB
        supabase
          .from('support_conversations')
          .update({ unread_count: 0 })
          .eq('id', selectedChatId)
          .then(({ error }) => {
            if (error) console.warn('[Support] Error clearing unread count:', error);
          });
      }
    }
  }, [selectedChatId]);

  // Get active operator information
  const getOperatorDetails = () => {
    const operatorId = currentUser?.id || currentUser?.uid || 'admin_user';
    const operatorName = currentUser?.displayName || 'Administrator';
    const operatorRole = (currentUser?.role || 'admin').toUpperCase();
    const operatorEmail = currentUser?.email || 'admin@winx7.gg';
    return { operatorId, operatorName, operatorRole, operatorEmail };
  };

  // ==========================================================================
  // ADMIN SUPPORT ACTION HANDLERS
  // ==========================================================================

  // Admin Reply Action
  const handleAdminSendReply = async () => {
    const activeChat = conversations.find(c => c.id === selectedChatId);
    if (!selectedChatId || !activeChat) return;

    const trimmed = adminReplyText.trim();
    if (!trimmed) return;

    setActionError(null);
    try {
      const verifiedStaff = await getVerifiedStaffProfile();

      // If chat status is waiting, claim it first
      if (activeChat.status === 'waiting') {
        await claimSupportRequestInSupabase(selectedChatId);
      }

      await sendSupportMessageToSupabase(
        selectedChatId,
        trimmed,
        verifiedStaff.role.toUpperCase() === 'STAFF' ? 'staff' : 'admin'
      );

      setAdminReplyText('');
    } catch (err: any) {
      console.error('Error replying:', err);
      setActionError(err.message || 'Verification failed. Could not send reply.');
    }
  };

  // Claim Chat Request using RPC (never trust client identities)
  const handleAdminClaimChat = async () => {
    if (!selectedChatId) return;
    setActionError(null);
    try {
      await claimSupportRequestInSupabase(selectedChatId);
    } catch (err: any) {
      console.error('Error claiming chat:', err);
      setActionError(err.message || 'Failed to claim support conversation.');
    }
  };

  // Reopen closed chat using RPC
  const handleAdminReopenChat = async () => {
    if (!selectedChatId) return;
    setActionError(null);
    try {
      await reopenSupportRequestInSupabase(selectedChatId);
    } catch (err: any) {
      console.error('Error reopening chat:', err);
      setActionError(err.message || 'Failed to reopen support conversation.');
    }
  };

  // Resolve Chat Request using RPC
  const handleAdminCloseChat = async () => {
    if (!selectedChatId) return;
    setActionError(null);
    try {
      await resolveSupportRequestInSupabase(selectedChatId);
    } catch (err: any) {
      console.error('Error closing chat:', err);
      setActionError(err.message || 'Failed to resolve support conversation.');
    }
  };

  // Transfer / Reassign Chat to another staff member
  const handleAdminTransferStaff = async (staff: StaffMember) => {
    if (!selectedChatId) return;
    setActionError(null);
    try {
      const verifiedStaff = await getVerifiedStaffProfile();

      // Update assignment on the support_conversations table
      const { error: convErr } = await supabase
        .from('support_conversations')
        .update({
          assigned_staff_id: staff.id,
          assigned_staff_name: staff.name,
          assigned_staff_email: staff.email,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedChatId);

      if (convErr) throw convErr;

      // Log system message
      const { error: msgErr } = await supabase
        .from('support_messages')
        .insert({
          conversation_id: selectedChatId,
          sender_id: 'system',
          sender_name: 'System',
          sender_type: 'system',
          message: `CHAT REASSIGNED TO STAFF ${staff.name.toUpperCase()} BY ${verifiedStaff.name.toUpperCase()}`
        });

      if (msgErr) throw msgErr;

      setShowStaffDropdown(false);
    } catch (err: any) {
      console.error('Error transferring staff:', err);
      setActionError(err.message || 'Failed to transfer support conversation.');
    }
  };



  // ==========================================================================
  // DATA FILTERING & SORTING FOR ADMIN INBOX
  // ==========================================================================

  const filteredConversations = conversations.filter(c => {
    // 1. Search Query filter (Username, IGN, UID, or ID)
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchName = c.username?.toLowerCase().includes(query);
      const matchIgn = c.ign?.toLowerCase().includes(query);
      const matchUid = c.uid?.toLowerCase().includes(query) || c.userId?.toLowerCase().includes(query);
      const matchId = c.id?.toLowerCase().includes(query);
      if (!matchName && !matchIgn && !matchUid && !matchId) return false;
    }

    // 2. Status Filter
    const opDetails = getOperatorDetails();
    if (statusFilter === 'waiting') {
      if (c.status !== 'waiting') return false;
    } else if (statusFilter === 'active') {
      if (c.status !== 'active') return false;
    } else if (statusFilter === 'mine') {
      if (c.status !== 'active' || c.assignedStaffId !== opDetails.operatorId) return false;
    } else if (statusFilter === 'closed') {
      if (c.status !== 'closed') return false;
    }

    // 3. Category Filter
    if (categoryFilter !== 'all') {
      if (c.category?.toUpperCase() !== categoryFilter.toUpperCase()) return false;
    }

    // 4. Assigned Staff Filter
    if (staffFilter !== 'all') {
      if (staffFilter === 'unassigned') {
        if (c.assignedStaffId) return false;
      } else {
        if (c.assignedStaffId !== staffFilter) return false;
      }
    }

    return true;
  }).sort((a, b) => {
    // Sorting mechanics
    if (sortBy === 'oldest') {
      return new Date(a.lastMessageAt || a.createdAt).getTime() - new Date(b.lastMessageAt || b.createdAt).getTime();
    }
    if (sortBy === 'unread') {
      return (b.unreadCount || 0) - (a.unreadCount || 0);
    }
    // Default newest first
    return new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col h-full bg-[#080708] text-[#F5F5F5] font-sans overflow-hidden" id="winx7-support-center">
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Admin Sidebar Queue */}
          <div className="w-full md:w-80 border-r border-[#29252A] bg-[#080708] flex flex-col flex-shrink-0 min-h-0">
            {/* Search & filters panel */}
            <div className="p-3 bg-[#0D0B0D] border-b border-[#29252A] space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#777278]" />
                <input
                  type="text"
                  placeholder="Search username, IGN, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#171418] border border-[#29252A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#C9A34E]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {/* Status Selection */}
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="bg-[#171418] border border-[#29252A] rounded text-[10px] py-1 px-1.5 text-[#F5F5F5] font-bold focus:outline-none focus:border-[#C9A34E] cursor-pointer"
                  >
                    <option value="all">ALL STATUSES</option>
                    <option value="waiting">UNASSIGNED</option>
                    <option value="mine">ASSIGNED TO ME</option>
                    <option value="active">ACTIVE CHATS</option>
                    <option value="closed">RESOLVED/CLOSED</option>
                  </select>

                  {/* Sorting Selector */}
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="bg-[#171418] border border-[#29252A] rounded text-[10px] py-1 px-1.5 text-[#F5F5F5] font-bold focus:outline-none focus:border-[#C9A34E] cursor-pointer"
                  >
                    <option value="newest">NEWEST FIRST</option>
                    <option value="oldest">OLDEST FIRST</option>
                    <option value="unread">MOST UNREAD</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {/* Category Filter */}
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-[#171418] border border-[#29252A] rounded text-[10px] py-1 px-1.5 text-[#F5F5F5] font-bold focus:outline-none focus:border-[#C9A34E] cursor-pointer"
                  >
                    <option value="all">ALL CATEGORIES</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  {/* Staff Filter */}
                  <select
                    value={staffFilter}
                    onChange={(e) => setStaffFilter(e.target.value)}
                    className="bg-[#171418] border border-[#29252A] rounded text-[10px] py-1 px-1.5 text-[#F5F5F5] font-bold focus:outline-none focus:border-[#C9A34E] cursor-pointer"
                  >
                    <option value="all">ALL STAFF</option>
                    <option value="unassigned">UNASSIGNED</option>
                    {staffMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <span className="text-[9px] font-black tracking-widest text-[#777278] uppercase">
                SUPPORT REQUEST QUEUE ({filteredConversations.length})
              </span>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#777278]">
                  <RefreshCw className="w-5 h-5 text-[#C9A34E] animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Loading chats...</span>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-16 text-xs text-[#777278] border border-dashed border-[#29252A] rounded-lg">
                  No support requests in queue.
                </div>
              ) : (
                filteredConversations.map((chat) => {
                  const isSelected = chat.id === selectedChatId;
                  const opDetails = getOperatorDetails();
                  const isAssignedToMe = chat.assignedStaffId === opDetails.operatorId;

                  // Compute status indicator label
                  let statusLabel = chat.status.toUpperCase();
                  if (chat.status === 'active') {
                    statusLabel = isAssignedToMe ? 'YOUR REQUEST' : 'ACTIVE';
                  }

                  return (
                    <div
                      key={chat.id}
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`p-3 rounded border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#1B181C] border-[#C9A34E] shadow shadow-[#C9A34E]/10'
                          : 'bg-[#141215] border-[#29252A] hover:bg-[#1B181C]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xs font-black text-[#F5F5F5]">{chat.username}</h4>
                          {chat.ign && (
                            <p className="text-[9px] text-[#C9A34E] font-semibold mt-0.5">IGN: {chat.ign}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-[8px] font-extrabold uppercase bg-[#350A12] text-[#FF3048] px-1 py-0.5 rounded border border-[#E21B36]/15">
                              {chat.category}
                            </span>
                            {chat.assignedStaffName && (
                              <span className="text-[8px] font-bold text-[#B0ACB0] bg-[#171418] px-1 py-0.5 rounded border border-[#29252A]">
                                👥 {chat.assignedStaffName}
                              </span>
                            )}
                          </div>
                        </div>
                        {chat.unreadCount > 0 && (
                          <span className="bg-[#E21B36] text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-full animate-pulse shrink-0">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>

                      <p className="text-[10px] text-[#B0ACB0] line-clamp-1 mt-2 italic">
                        "{chat.lastMessage}"
                      </p>

                      <div className="mt-3 pt-2 border-t border-[#29252A] flex items-center justify-between">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase border ${
                          statusLabel === 'YOUR REQUEST'
                            ? 'bg-[#350A12] border-[#E21B36]/30 text-[#FF3048]'
                            : chat.status === 'waiting'
                            ? 'bg-[#141215] border-[#C9A34E]/20 text-[#C9A34E]'
                            : chat.status === 'active'
                            ? 'bg-[#141215] border-[#29252A] text-[#B0ACB0]'
                            : 'bg-[#0D0B0D] border-[#29252A] text-[#777278]'
                        }`}>
                          {statusLabel}
                        </span>
                        <span className="text-[8px] text-[#777278]">
                          {formatRelativeTime(chat.lastMessageAt || chat.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Admin Chat Screen */}
          <div className="flex-1 flex flex-col bg-[#080708] min-h-0">
            {selectedChatId && conversations.find(c => c.id === selectedChatId) ? (
              (() => {
                const chat = conversations.find(c => c.id === selectedChatId)!;
                const isClosed = ['closed', 'completed', 'cancelled'].includes(chat.status);
                const opDetails = getOperatorDetails();
                const isAssignedToMe = chat.assignedStaffId === opDetails.operatorId;

                return (
                  <>
                    {/* Header info */}
                    <div className="p-3 bg-[#0D0B0D] border-b border-[#29252A] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                      <div>
                        <span className="text-[9px] font-black text-[#C9A34E] uppercase tracking-widest">
                          Active Conversation
                        </span>
                        <h3 className="text-sm font-black text-[#F5F5F5]">{chat.username}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-[#B0ACB0]">
                          {chat.ign && (
                            <span>IGN: <strong className="text-[#F5F5F5]">{chat.ign}</strong></span>
                          )}
                          <span>Category: <strong className="text-[#E21B36]">{chat.category}</strong></span>
                          {chat.assignedStaffName ? (
                            <span>Assigned: <strong className="text-[#C9A34E]">{chat.assignedStaffName}</strong></span>
                          ) : (
                            <span className="text-[#777278] font-bold">Unassigned</span>
                          )}
                        </div>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2">
                        {chat.status === 'waiting' && (
                          <button
                            onClick={handleAdminClaimChat}
                            className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-[#E21B36] text-white hover:bg-[#FF3048] rounded transition-all cursor-pointer"
                          >
                            Claim Chat
                          </button>
                        )}
                        {isClosed && (
                          <button
                            onClick={handleAdminReopenChat}
                            className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-[#141215] text-[#C9A34E] border border-[#C9A34E]/30 hover:bg-[#1B181C] rounded transition-all cursor-pointer"
                          >
                            Reopen Chat
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Chat log window */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                      {chat.status === 'waiting' && (
                        <div className="p-3 bg-[#141215] border border-[#29252A] rounded text-center text-xs text-[#B0ACB0] max-w-md mx-auto">
                          📢 <span className="font-extrabold text-[#C9A34E]">Support request waiting for response.</span> Claim the chat or send a reply to start the discussion.
                        </div>
                      )}

                      {(chat.messages || []).map((msg) => {
                        const isSystem = msg.senderType === 'system';
                        const isUser = msg.senderType === 'user';

                        if (isSystem) {
                          return (
                            <div key={msg.id} className="flex justify-center my-1">
                              <span className="px-2 py-0.5 rounded bg-[#141215] border border-[#29252A] text-[#C9A34E] text-[8px] font-black tracking-widest uppercase text-center max-w-xs break-all">
                                {msg.message}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[75%] rounded px-3 py-2 border ${
                              isUser
                                ? 'bg-[#141215] border-[#29252A] text-[#F5F5F5] rounded-bl-none'
                                : 'bg-[#350A12] border-[#E21B36]/30 text-[#F5F5F5] rounded-br-none'
                            }`}>
                              <div className="flex items-center justify-between gap-4 mb-0.5 border-b border-white/5 pb-0.5">
                                <span className="text-[9px] font-black text-[#C9A34E] uppercase">
                                  {msg.senderName}
                                </span>
                                <span className="text-[8px] text-[#777278]">
                                  {formatRelativeTime(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                                {msg.message}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Operator reply & tools area */}
                    <div className="p-3 bg-[#0D0B0D] border-t border-[#29252A] space-y-3 shrink-0">
                      
                      {actionError && (
                        <div className="p-2 bg-[#350A12] border border-[#E21B36]/30 rounded text-xs text-[#FF3048] font-bold flex items-center justify-between gap-2">
                          <span>⚠️ {actionError}</span>
                          <button onClick={() => setActionError(null)} className="text-[#FF3048] hover:text-white font-black text-sm">×</button>
                        </div>
                      )}

                      {isClosed ? (
                        <div className="p-2 bg-[#080708] border border-[#29252A] rounded text-center text-[10px] text-[#777278] font-bold uppercase tracking-widest">
                          CONVERSATION RESOLVED / CLOSED
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <textarea
                            rows={1}
                            placeholder={`Reply to ${chat.username}...`}
                            value={adminReplyText}
                            onChange={(e) => setAdminReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleAdminSendReply();
                              }
                            }}
                            className="flex-1 bg-[#080708] border border-[#29252A] rounded px-3 py-2 text-xs text-[#F5F5F5] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E] resize-none"
                          />
                          <button
                            onClick={handleAdminSendReply}
                            disabled={!adminReplyText.trim()}
                            className="px-4 py-1.5 rounded bg-[#E21B36] hover:bg-[#FF3048] disabled:opacity-40 text-white font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
                          >
                            Send
                          </button>
                        </div>
                      )}

                      {/* Option Panel Trigger controls */}
                      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                        <span className="text-[9px] font-black text-[#C9A34E] uppercase tracking-widest">
                          Admin Operations:
                        </span>

                        <div className="flex items-center gap-2">
                          
                          {/* Reassign to active staff */}
                          {!isClosed && (
                            <div className="relative">
                              <button
                                onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                                className="px-2.5 py-1 text-[10px] font-bold bg-[#141215] border border-[#29252A] rounded hover:bg-[#1B181C] text-white flex items-center gap-1 cursor-pointer"
                              >
                                👥 Transfer to Staff <ChevronDown className="w-3 h-3 text-[#C9A34E]" />
                              </button>

                              {showStaffDropdown && (
                                <div className="absolute bottom-full right-0 mb-1 w-48 rounded bg-[#141215] border border-[#29252A] shadow-xl z-50 p-1 space-y-0.5">
                                  <p className="text-[8px] text-[#C9A34E] px-2 py-1 uppercase tracking-widest font-black border-b border-[#29252A]">
                                    Select Agent
                                  </p>
                                  {staffMembers.length === 0 ? (
                                    <p className="text-[9px] text-[#777278] p-2 italic">No staff online</p>
                                  ) : (
                                    staffMembers.map(s => (
                                      <button
                                        key={s.id}
                                        onClick={() => handleAdminTransferStaff(s)}
                                        className="w-full text-left px-2 py-1 text-[10px] text-white hover:bg-[#1B181C] transition-all rounded"
                                      >
                                        {s.name}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Close conversation */}
                          {!isClosed && (
                            <button
                              onClick={handleAdminCloseChat}
                              className="px-2.5 py-1 text-[10px] font-black uppercase bg-[#350A12] border border-[#E21B36]/30 text-[#FF3048] hover:bg-[#4A0D16] rounded transition-all cursor-pointer"
                            >
                              Resolve Request
                            </button>
                          )}

                        </div>
                      </div>

                    </div>
                  </>
                );
              })()
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#777278] gap-2">
                <MessageSquare className="w-8 h-8 text-[#29252A]" />
                <p className="text-xs font-bold uppercase tracking-widest">Select a support request to open conversation</p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
};
