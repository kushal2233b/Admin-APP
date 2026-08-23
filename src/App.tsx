import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { ActionConfirmationModal, ActionModalState } from './components/common/ActionConfirmationModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Tabs
import { OverviewTab } from './components/dashboard/OverviewTab';
import { UserManagement } from './components/users/UserManagement';
import { TournamentManagement } from './components/tournaments/TournamentManagement';
import { WalletManagement } from './components/wallet/WalletManagement';
import { DepositsView } from './components/wallet/DepositsView';
import { WithdrawalsView } from './components/wallet/WithdrawalsView';
import { CouponManagement } from './components/coupons/CouponManagement';

import { SupportDeskConfig } from './components/support/SupportDeskConfig';
import { ReportsAnalytics } from './components/reports/ReportsAnalytics';
import { StaffManagement } from './components/staff/StaffManagement';
import { SystemSettings } from './components/settings/SystemSettings';
import { SavedImagesManagement } from './components/images/SavedImagesManagement';

import { supabase } from './services/supabase';

// Supabase Database Service
import {
  subscribeCollection,
  fetchTransactionsFromSupabase,
  seedInitialFirestoreDataIfEmpty,
  createTournamentInFirestore,
  updateTournamentInFirestore,
  deleteTournamentFromFirestore,
  normalizeTournamentDoc,
  normalizeUserDoc,
  updateUserStatusInFirestore,
  updateUserWalletBalanceInFirestore,
  adjustUserWalletBalanceInFirestore,
  updateUserProfileInFirestore,
  approveTransactionInFirestore,
  rejectTransactionInFirestore,
  refundRejectedWithdrawalInFirestore,
  createTransactionInFirestore,
  deleteTransactionFromFirestore,
  clearAllPendingDepositsFromSupabase,
  sendNotificationInFirestore,
  saveSystemSettingsInFirestore,
  subscribeOfficialLinks,
  saveCouponInFirestore,
  deleteCouponFromFirestore,
  saveCategoryInFirestore,
  deleteCategoryFromFirestore,
  syncLeaderboardToFirestore,
  createMatchRuleInFirestore,
  updateMatchRuleInFirestore,
  deleteMatchRuleFromFirestore,
  saveSavedImageInFirestore,
  deleteSavedImageFromFirestore,
  resolvePresetAvatarUrl,
  provisionStaffAccountInFirebase,
  updateAdminUserStatusInFirestore,
  deleteAdminUserFromFirestore,
  bootstrapSuperAdminAccount,
  purgeDemoFirestoreData,
  getUserWallet,
  publishMatchResults,
  cancelMatchAndRefund,
  getMatchParticipantsFromSupabase
} from './services/supabaseService';

// Mock Data Initializers
import {
  initialUsers,
  initialTournaments,
  initialCategories,
  initialTransactions,
  initialNotifications,
  initialStaffUsers,
  initialSystemSettings,
  initialAuditLogs
} from './data/mockData';

import {
  AppUser,
  Tournament,
  WalletTransaction,
  TransactionType,
  AppNotification,
  Coupon,
  MatchCategory,
  AdminUser,
  SystemSettings as SystemSettingsType,
  OfficialLinkConfig,
  AuditLog,
  UserStatus,
  Participant,
  MatchRulesPreset,
  SavedImage
} from './types';

function MainPortalContent() {
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState(() => (currentUser?.role === 'staff' ? 'matches' : 'dashboard'));
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Enforce staff role restriction: Staff users can ONLY access tournament matches
  useEffect(() => {
    if (currentUser?.role === 'staff' && activeTab !== 'matches') {
      setActiveTab('matches');
    }
  }, [currentUser, activeTab]);

  // Core State
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [tournaments, setTournaments] = useState<Tournament[]>(initialTournaments);
  const [categories, setCategories] = useState<MatchCategory[]>(initialCategories);
  const [rawTransactions, setRawTransactions] = useState<WalletTransaction[]>(initialTransactions);

  const refreshDeposits = useCallback(async () => {
    try {
      const freshList = await fetchTransactionsFromSupabase();
      if (freshList && Array.isArray(freshList)) {
        setRawTransactions(freshList);
      }
    } catch (err: any) {
      console.error('[refreshDeposits Error]:', err?.message || err);
      // Preserve existing rawTransactions state on error
    }
  }, []);
  const [extraDeposits, setExtraDeposits] = useState<any[]>([]);
  const [extraDepositRequests, setExtraDepositRequests] = useState<any[]>([]);
  const [extraDepositRequestsCamel, setExtraDepositRequestsCamel] = useState<any[]>([]);
  const [extraUserDeposits, setExtraUserDeposits] = useState<any[]>([]);
  const [extraWalletTransactions, setExtraWalletTransactions] = useState<any[]>([]);
  const [extraPaymentRequests, setExtraPaymentRequests] = useState<any[]>([]);
  const [extraRecharges, setExtraRecharges] = useState<any[]>([]);
  const [extraWithdrawals, setExtraWithdrawals] = useState<any[]>([]);
  const [extraUserWithdrawals, setExtraUserWithdrawals] = useState<any[]>([]);
  const [extraWithdrawRequests, setExtraWithdrawRequests] = useState<any[]>([]);
  const [extraWithdrawRequestsCamel, setExtraWithdrawRequestsCamel] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [matchRules, setMatchRules] = useState<MatchRulesPreset[]>([]);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [staffList, setStaffList] = useState<AdminUser[]>(initialStaffUsers);
  const [settings, setSettings] = useState<SystemSettingsType>(() => {
    try {
      const saved = localStorage.getItem('winx7_system_settings');
      if (saved) {
        return { ...initialSystemSettings, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return initialSystemSettings;
  });

  const [officialLinks, setOfficialLinks] = useState<OfficialLinkConfig>(() => ({
    telegramContact: '',
    telegramEnabled: false,
    telegramName: 'Telegram Customer Support',
    telegramDescription: 'Instant 24/7 support & match query resolution',

    whatsappContact: '',
    whatsappEnabled: false,
    whatsappName: 'WhatsApp Official Update Channel',
    whatsappDescription: 'Get official match announcements & room ID updates',

    instagramContact: '',
    instagramEnabled: false,
    instagramName: 'Instagram Official Page',
    instagramDescription: 'Follow for tournament highlights, giveaways & news',

    youtubeContact: '',
    youtubeEnabled: false,
    youtubeName: 'YouTube Official Channel',
    youtubeDescription: 'Watch live streamings & official match replays',

    updatedAt: '',
    updatedBy: ''
  }));

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);

  // Derived merged transaction list to capture deposits and deposit_requests from all player app collections
  const transactions = useMemo(() => {
    const list: WalletTransaction[] = [];
    const existingIds = new Set<string>();
    const existingRefIds = new Set<string>();

    // O(1) user lookup dictionary
    const usersMap = new Map<string, AppUser>();
    for (const u of (users || [])) {
      if (u.id) usersMap.set(u.id, u);
      if (u.uid) usersMap.set(u.uid, u);
    }

    const parseUpiValue = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string' || typeof val === 'number') {
        const trimmed = String(val).trim();
        if (
          trimmed &&
          trimmed !== '[object Object]' &&
          trimmed.toLowerCase() !== 'undefined' &&
          trimmed.toLowerCase() !== 'null' &&
          trimmed.toLowerCase() !== 'n/a'
        ) {
          return trimmed;
        }
        return '';
      }
      if (typeof val === 'object') {
        return (
          parseUpiValue(val.upiId) ||
          parseUpiValue(val.upi_id) ||
          parseUpiValue(val.upi) ||
          parseUpiValue(val.vpa) ||
          parseUpiValue(val.payoutAddress) ||
          parseUpiValue(val.payout_address) ||
          parseUpiValue(val.upiAddress) ||
          parseUpiValue(val.upi_address) ||
          parseUpiValue(val.address) ||
          parseUpiValue(val.accountNumber) ||
          parseUpiValue(val.account_number) ||
          parseUpiValue(val.number) ||
          parseUpiValue(val.phone) ||
          parseUpiValue(val.paytm) ||
          parseUpiValue(val.details) ||
          ''
        );
      }
      return '';
    };

    const extractUpiId = (item: any, user?: AppUser | null): string => {
      if (!item) return '';

      const checkList = [
        item.upiId, item.upi_id, item.upi, item.vpa,
        item.userUpi, item.user_upi, item.userUpiId, item.user_upi_id,
        item.senderUpi, item.sender_upi, item.payeeUpi,
        item.paymentDetails, item.payment_details,
        item.payoutUpi, item.payout_upi, item.payoutAddress, item.payout_address,
        item.upiAddress, item.upi_address,
        item.details, item.bankDetails, item.bank_details,
        item.paytmNumber, item.paytm_number, item.paytm,
        item.phonepe, item.gpay,
        item.paymentAddress, item.payment_address
      ];

      let result = '';
      for (const val of checkList) {
        const parsed = parseUpiValue(val);
        if (parsed) {
            if (/^\d{11,}$/.test(parsed)) continue;
            result = parsed;
            break;
        }
      }

      if (!result) {
        const candidates = [item.referenceId, item.reference_id, item.notes, item.remarks, item.description, item.adminNotes];
        for (const cand of candidates) {
          if (typeof cand === 'string' && cand.includes('@') && !cand.includes(' ')) {
            result = cand.trim();
            break;
          }
        }
      }

      if (!result && user) {
        const u = user as any;
        const userCheckList = [
            u.upiId, u.upi_id, u.upi, u.vpa, u.upiAddress, u.paytmNumber, u.paytm, u.phone
        ];
        for (const val of userCheckList) {
            const parsed = parseUpiValue(val);
            if (parsed) {
                if (/^\d{11,}$/.test(parsed)) continue;
                result = parsed;
                break;
            }
        }
      }

      return result;
    };

    const normalizeItem = (item: any, defaultType?: string, sourceCol?: string): WalletTransaction | null => {
      if (!item) return null;

      const id = String(
        item.id ||
        item.docId ||
        item.uid ||
        item._id ||
        item.txnId ||
        item.transactionId ||
        item.utr ||
        `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      );

      const userId = String(
        item.userId ||
        item.user_id ||
        item.uid ||
        item.userUid ||
        item.user_uid ||
        item.playerId ||
        item.player_id ||
        item.memberId ||
        ''
      );

      const rawType = String(item.type || item.transactionType || item.txn_type || item.category || defaultType || 'deposit')
        .toLowerCase()
        .trim();

      let type: TransactionType = 'deposit';
      if (
        rawType.includes('deposit') ||
        rawType.includes('add') ||
        rawType.includes('recharge') ||
        rawType.includes('topup') ||
        rawType.includes('top_up') ||
        rawType.includes('credit')
      ) {
        type = 'deposit';
      } else if (
        rawType.includes('withdraw') ||
        rawType.includes('payout') ||
        rawType.includes('debit') ||
        rawType.includes('redeem')
      ) {
        type = 'withdrawal';
      } else if (rawType.includes('entry') || rawType.includes('fee')) {
        type = 'entry_fee';
      } else if (rawType.includes('winning') || rawType.includes('prize') || rawType.includes('kill')) {
        type = 'winning';
      } else if (rawType.includes('admin') || rawType.includes('adjust')) {
        type = 'admin_adjustment';
      } else if (rawType.includes('refund')) {
        type = 'refund';
      }

      const rawStatus = String(item.status || item.state || item.txn_status || 'pending')
        .toLowerCase()
        .trim();

      let status: 'pending' | 'approved' | 'rejected' = 'pending';
      if (
        ['approved', 'success', 'completed', 'paid', 'done', 'accepted', 'complete', 'succeeded'].includes(rawStatus)
      ) {
        status = 'approved';
      } else if (
        ['rejected', 'failed', 'cancelled', 'declined', 'denied', 'canceled'].includes(rawStatus)
      ) {
        status = 'rejected';
      } else {
        status = 'pending';
      }

      const amount = Number(
        item.amount ?? item.amt ?? item.coins ?? item.money ?? item.points ?? item.value ?? 0
      );

      const rawWithdrawalReqId = String(
        item.withdrawalRequestId ||
        item.withdrawal_request_id ||
        item.requestId ||
        item.request_id ||
        ''
      ).trim();

      const withdrawalRequestId = type === 'withdrawal'
        ? (rawWithdrawalReqId || String(item.referenceId || item.reference_id || item.id || '').trim())
        : undefined;

      const referenceId = type === 'withdrawal'
        ? (withdrawalRequestId || String(item.id || ''))
        : String(
            item.referenceId ||
            item.reference_id ||
            item.utr ||
            item.utrNo ||
            item.utr_number ||
            item.transactionId ||
            item.transaction_id ||
            item.txnId ||
            item.txn_id ||
            item.refNo ||
            item.ref_id ||
            item.pay_id ||
            ''
          ).trim();

      const proofImageUrl = String(
        item.proofImageUrl ||
        item.proof_image_url ||
        item.screenshotUrl ||
        item.screenshot_url ||
        item.proofUrl ||
        item.proof_url ||
        item.imageUrl ||
        item.image_url ||
        item.screenshot ||
        item.proof ||
        item.payment_proof ||
        item.receiptUrl ||
        item.receipt ||
        ''
      );

      let userPhone = String(item.userPhone || item.phone || item.mobile || item.phoneNumber || item.phone_number || '');
      let userEmail = String(item.userEmail || item.email || item.user_email || '');
      let fullName = String(item.fullName || item.full_name || item.name || item.senderName || item.sender_name || '');

      const matchingUser = (userId && usersMap.size > 0) ? usersMap.get(userId) : null;
      if (matchingUser) {
        if (!userPhone) userPhone = matchingUser.phone || '';
        if (!userEmail) userEmail = matchingUser.email || '';
      }

      let username = String(
        item.username ||
        item.user_name ||
        item.displayName ||
        item.display_name ||
        item.name ||
        (matchingUser ? (matchingUser.username || matchingUser.inGameName || matchingUser.displayName) : '') ||
        (userEmail ? userEmail.split('@')[0] : '') ||
        (userId ? `User (${userId.slice(0, 4)})` : 'Player')
      );

      const upiId = extractUpiId(item, matchingUser);

      const utr = type === 'withdrawal'
        ? (status === 'approved' ? String(item.utr || item.payoutReference || item.payout_reference || item.bankUtr || item.adminNotes || '').trim() : '')
        : String(item.utr || item.utrNo || item.utr_number || item.referenceId || '').trim();

      const paymentMethod = String(
        item.paymentMethod ||
        item.payment_method ||
        item.gateway ||
        item.method ||
        item.payMethod ||
        'UPI'
      );

      const createdAt = String(
        item.createdAt ||
        item.created_at ||
        item.date ||
        item.timestamp ||
        item.time ||
        new Date().toISOString()
      );

      const adminNotes = String(
        item.adminNotes ||
        item.admin_notes ||
        item.notes ||
        item.reason ||
        item.rejectionReason ||
        ''
      );

      return {
        id,
        type,
        userId,
        username,
        amount,
        paymentMethod,
        referenceId,
        withdrawalRequestId,
        utr,
        upiId,
        userPhone,
        userEmail,
        fullName,
        status,
        proofImageUrl,
        createdAt,
        adminNotes,
        _sourceCollection: sourceCol || 'transactions'
      } as WalletTransaction;
    };

    const addOrMerge = (item: any, defaultType?: string, sourceCol?: string) => {
      if (!item) return;
      const normalized = normalizeItem(item, defaultType, sourceCol);
      if (!normalized) return;

      const id = normalized.id;
      const refId = (normalized.referenceId || '').trim().toLowerCase();

      if (existingIds.has(id)) {
        const idx = list.findIndex((t) => t.id === id);
        if (idx !== -1) {
          if (!list[idx].proofImageUrl && normalized.proofImageUrl) {
            list[idx].proofImageUrl = normalized.proofImageUrl;
          }
          if (!list[idx].referenceId && normalized.referenceId) {
            list[idx].referenceId = normalized.referenceId;
          }
          if (!list[idx].upiId && normalized.upiId) {
            list[idx].upiId = normalized.upiId;
          }
          if (normalized.status !== list[idx].status) {
            list[idx].status = normalized.status;
          }
        }
        return;
      }

      if (refId && existingRefIds.has(refId) && normalized.type === 'deposit') {
        const idx = list.findIndex((t) => (t.referenceId || '').trim().toLowerCase() === refId);
        if (idx !== -1) {
          if (!list[idx].proofImageUrl && normalized.proofImageUrl) {
            list[idx].proofImageUrl = normalized.proofImageUrl;
          }
          return;
        }
      }

      list.push(normalized);
      existingIds.add(id);
      if (refId) existingRefIds.add(refId);
    };

    rawTransactions.forEach((item) => addOrMerge(item, undefined, 'transactions'));
    extraDeposits.forEach((item) => addOrMerge(item, 'deposit', 'deposits'));
    extraDepositRequests.forEach((item) => addOrMerge(item, 'deposit', 'deposit_requests'));
    extraDepositRequestsCamel.forEach((item) => addOrMerge(item, 'deposit', 'depositRequests'));
    extraUserDeposits.forEach((item) => addOrMerge(item, 'deposit', 'user_deposits'));
    extraWalletTransactions.forEach((item) => addOrMerge(item, 'deposit', 'wallet_transactions'));
    extraPaymentRequests.forEach((item) => addOrMerge(item, 'deposit', 'payment_requests'));
    extraRecharges.forEach((item) => addOrMerge(item, 'deposit', 'recharges'));
    extraWithdrawals.forEach((item) => addOrMerge(item, 'withdrawal', 'withdrawals'));
    extraUserWithdrawals.forEach((item) => addOrMerge(item, 'withdrawal', 'user_withdrawals'));
    extraWithdrawRequests.forEach((item) => addOrMerge(item, 'withdrawal', 'withdraw_requests'));
    extraWithdrawRequestsCamel.forEach((item) => addOrMerge(item, 'withdrawal', 'withdrawRequests'));

    return list;
  }, [
    rawTransactions,
    extraDeposits,
    extraDepositRequests,
    extraDepositRequestsCamel,
    extraUserDeposits,
    extraWalletTransactions,
    extraPaymentRequests,
    extraRecharges,
    extraWithdrawals,
    extraUserWithdrawals,
    extraWithdrawRequests,
    extraWithdrawRequestsCamel,
    users
  ]);

  // Live database mutation states
  const [isDbProcessing, setIsDbProcessing] = useState(false);
  const [dbProcessingMessage, setDbProcessingMessage] = useState('');

  // Keep a persistent cache of ever-seen participants for each tournament ID to prevent accidental client-side deletes or overwrites
  const historicalParticipantsMapRef = useRef<Map<string, any[]>>(new Map());
  const processingTxIdsRef = useRef<Set<string>>(new Set());

  const runAsyncAction = async (message: string, actionFn: () => Promise<void>) => {
    setIsDbProcessing(true);
    setDbProcessingMessage(message);
    try {
      await actionFn();
    } catch (err: any) {
      console.error("Action error:", err);
      // Removed the alert here so the caller can handle and format it
      throw err;
    } finally {
      setIsDbProcessing(false);
    }
  };

  // Seed Supabase & subscribe to live updates
  useEffect(() => {
    // Purge any legacy demo data if needed
    purgeDemoFirestoreData();

    // Bootstrap requested Super Admin account
    bootstrapSuperAdminAccount();

    // Check initial collections
    seedInitialFirestoreDataIfEmpty();

    // Real-time Supabase Subscriptions
    const unsubTournaments = subscribeCollection<Tournament>('tournaments', (items) => {
      const liveTournaments = (items || []).filter(t => t && !t.isPlaceholder && t.id !== 'tour_init_placeholder');
      setTournaments(liveTournaments);
    });

    const unsubCategories = subscribeCollection<MatchCategory>('categories', (items) => {
      const list = items || [];
      const sorted = [...list].sort((a, b) => {
        const sa = a.sortOrder ?? a.displayOrder ?? a.order ?? 999;
        const sb = b.sortOrder ?? b.displayOrder ?? b.order ?? 999;
        return sa - sb;
      });
      setCategories(sorted);
    });

    const unsubUsers = subscribeCollection<AppUser>('users', (items) => {
      if (!items) {
        setUsers([]);
        return;
      }

      // Filter out invalid, placeholder, or fake demo user documents
      const FAKE_NAMES = ['winx7_player', 'ApexPredator', 'ViperSniper', 'ShadowNinja', 'HackerPro', 'RdxGamer', 'WinX7 Player'];
      const FAKE_EMAILS = ['player@winx7.gg', 'apex.gaming@gmail.com', 'vipersniper99@gmail.com', 'shadow.esports@yahoo.com', 'cheater@test.com', 'rdx.pubg@gmail.com'];

      const validDocs = items.filter((u) => {
        if (!u) return false;
        if ((u as any).isPlaceholder || u.id === 'init_user_placeholder' || u.id === 'staff_init_placeholder') return false;
        if (FAKE_NAMES.includes(u.username)) return false;
        if (FAKE_EMAILS.includes(u.email)) return false;
        return Boolean(u.id || u.uid || u.email || u.phone);
      });

      const userMap = new Map<string, AppUser>();

      for (const rawUser of validDocs) {
        const docId = rawUser.id || rawUser.uid || '';
        const sanitized = normalizeUserDoc(rawUser, docId);

        const key = sanitized.id || sanitized.uid || (sanitized.email ? sanitized.email.toLowerCase().trim() : '');
        if (key) {
          if (!userMap.has(key)) {
            userMap.set(key, sanitized);
          } else {
            const existing = userMap.get(key)!;
            const existingScore = (existing.email ? 1 : 0) + (existing.phone ? 1 : 0) + (existing.inGameId ? 1 : 0) + (existing.inGameName ? 1 : 0);
            const newScore = (sanitized.email ? 1 : 0) + (sanitized.phone ? 1 : 0) + (sanitized.inGameId ? 1 : 0) + (sanitized.inGameName ? 1 : 0);
            if (newScore >= existingScore) {
              userMap.set(key, { ...existing, ...sanitized });
            }
          }
        }
      }

      setUsers(Array.from(userMap.values()));
    });

    const unsubTransactions = subscribeCollection<WalletTransaction>('transactions', (items) => {
      setRawTransactions(items || []);
    });

    const unsubNotifications = subscribeCollection<AppNotification>('notifications', (items) => {
      if (!items) {
        setNotifications([]);
        return;
      }
      
      // Sort first to ensure newest are processed and kept if duplicate keys exist
      const sorted = [...items].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.sentAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.sentAt || 0).getTime();
        return timeB - timeA;
      });

      // Deduplicate by ID
      const seen = new Set<string>();
      const deduplicated: AppNotification[] = [];
      for (const n of sorted) {
        if (n.id && !seen.has(n.id)) {
          seen.add(n.id);
          deduplicated.push(n);
        }
      }
      
      setNotifications(deduplicated);
    });

    const unsubCoupons = subscribeCollection<Coupon>('coupons', (items) => {
      setCoupons(items || []);
    });

    const unsubMatchRules = subscribeCollection<MatchRulesPreset>('match_rules', (items) => {
      setMatchRules(items || []);
    });

    const unsubSavedImages = subscribeCollection<SavedImage>('saved_images', (items) => {
      setSavedImages(items || []);
    });

    const unsubSettings = subscribeCollection<SystemSettingsType>("settings", (items) => {
      const generalSettings = items.find((s: any) => s.id === "general") || (items && items.length > 0 ? items[0] : null);
      if (generalSettings) {
        setSettings(generalSettings);
        try {
          localStorage.setItem('winx7_system_settings', JSON.stringify(generalSettings));
        } catch (e) {}
      }
    });

    const unsubOfficialLinks = subscribeOfficialLinks((data) => {
      if (data) {
        setOfficialLinks(data);
      }
    });

    const unsubStaff = subscribeCollection<AdminUser>('adminUsers', (items) => {
      if (items && items.length > 0) {
        const sanitized = items.map((st, idx) => ({
          ...st,
          uid: st.uid || st.id || `staff-${idx}`
        }));
        setStaffList(sanitized);
      }
    });

    return () => {
      unsubTournaments();
      unsubCategories();
      unsubUsers();
      unsubTransactions();
      unsubNotifications();
      unsubCoupons();
      unsubMatchRules();
      unsubSavedImages();
      unsubStaff();
      unsubSettings();
      unsubOfficialLinks();
    };
  }, []);

  // Confirmation Overlay & Refresh System state
  const [actionModal, setActionModal] = useState<ActionModalState>({
    isOpen: false,
    title: '',
    message: ''
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(new Date().toLocaleTimeString());

  const showConfirmationOverlay = (
    title: string,
    message: string,
    details?: { label: string; value: string | number }[],
    badgeTag = 'ACTION CONFIRMED',
    icon: 'success' | 'warning' | 'danger' | 'info' | 'refresh' = 'success'
  ) => {
    setActionModal({
      isOpen: true,
      type: 'success_overlay',
      title,
      message,
      details,
      badgeTag,
      icon,
      onClose: () => setActionModal({ isOpen: false, title: '', message: '' })
    });
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDeposits();
      const timeStr = new Date().toLocaleTimeString();
      setLastRefreshedAt(timeStr);
      showConfirmationOverlay(
        'System Data Re-Synced!',
        'All live tournaments, user accounts, wallet transactions, notifications, and system settings have been refreshed directly from Supabase.',
        [
          { label: 'Synced Collections', value: 'Tournaments, Wallet, Users' },
          { label: 'Last Synced At', value: timeStr }
        ],
        'SYSTEM SYNC COMPLETE',
        'refresh'
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  // Create match modal state trigger from dashboard
  const [openCreateMatchDirectly, setOpenCreateMatchDirectly] = useState(false);

  const pendingCount =
    transactions.filter((t) => t.type === 'deposit' && t.status === 'pending').length +
    transactions.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length;

  const pushAudit = (action: string, target: string, details?: string) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      adminEmail: currentUser?.email || 'admin@winx7.gg',
      action,
      target,
      timestamp: new Date().toISOString(),
      details
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // User Handlers
  const handleUpdateUserStatus = async (userId: string, newStatus: UserStatus, reason?: string) => {
    await runAsyncAction(`Updating user account status to ${newStatus}...`, async () => {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: newStatus, banReason: reason || u.banReason } : u
        )
      );
      await updateUserStatusInFirestore(userId, newStatus, reason);
      const u = users.find((x) => x.id === userId);
      pushAudit(`Updated User Status (${newStatus})`, `${u?.username || userId} ${reason ? `- ${reason}` : ''}`);

      showConfirmationOverlay(
        `User Account ${newStatus === 'active' ? 'Re-activated' : 'Suspended'}!`,
        `Player account for ${u?.username || userId} has been set to ${(newStatus || '').toUpperCase()}.`,
        [
          { label: 'Player Username', value: u?.username || userId },
          { label: 'New Status', value: (newStatus || '').toUpperCase() },
          ...(reason ? [{ label: 'Ban/Suspension Reason', value: reason }] : [])
        ],
        'USER STATUS UPDATED',
        newStatus === 'active' ? 'success' : 'warning'
      );
    });
  };

  const handleUpdateUserWallet = async (userId: string, amount: number, isAddition: boolean, note: string, walletType: "main" | "winning" | string = "main") => {
    await runAsyncAction(`Adjusting user wallet balance by ₹${amount}...`, async () => {
      const u = users.find((x) => x.id === userId || x.uid === userId);
      const isWinning = walletType === "winning" || walletType === "winnings";
      const actualWalletType: 'main' | 'winning' | 'bonus' = isWinning ? 'winning' : (walletType === 'bonus' ? 'bonus' : 'main');
      const delta = isAddition ? amount : -amount;

      await adjustUserWalletBalanceInFirestore(userId, delta, note || 'Admin Adjustment', actualWalletType);

      // Force refresh data
      await refreshDeposits();
      
      const updatedWallet = await getUserWallet(userId);
      setUsers((prev) =>
        prev.map((usr) => {
          if (usr.id === userId || usr.uid === userId) {
            return {
              ...usr,
              depositBalance: updatedWallet.depositBalance,
              walletBalance: updatedWallet.depositBalance,
              winningBalance: updatedWallet.winningBalance,
              unclaimedWinnings: updatedWallet.winningBalance,
              bonusBalance: updatedWallet.bonusBalance,
              totalBalance: updatedWallet.totalBalance,
            };
          }
          return usr;
        })
      );

      pushAudit('Manual Wallet Adjustment', `${isAddition ? '+' : '-'}₹${amount} for ${u?.username || userId} (${note})`);

      showConfirmationOverlay(
        'Wallet Balance Adjusted Successfully!',
        `₹${amount} was ${isAddition ? 'added to' : 'deducted from'} ${u?.username || userId}'s wallet. Updated balance: ₹${isWinning ? updatedWallet.winningBalance : updatedWallet.depositBalance}.`,
        [
          { label: 'Player', value: u?.username || userId },
          { label: 'Adjustment', value: `${isAddition ? '+' : '-'}₹${amount}` },
          { label: 'New Balance', value: `₹${isWinning ? updatedWallet.winningBalance : updatedWallet.depositBalance}` },
          { label: 'Note/Reference', value: note || 'Manual Admin Credit' }
        ],
        'WALLET ADJUSTED'
      );
    });
  };

  const handleEditUserProfile = async (
    userId: string,
    profileData: {
      username: string;
      email: string;
      phone: string;
      inGameName: string;
      inGameId: string;
      avatar_id?: string;
      avatarId?: string;
      avatarUrl?: string;
    }
  ) => {
    await runAsyncAction('Saving player gaming profile & details...', async () => {
      const avatarId = profileData.avatar_id || profileData.avatarId || 'avatar_1';
      const resolvedAvatarUrl = resolvePresetAvatarUrl(avatarId, profileData.avatarUrl);

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId || u.uid === userId
            ? {
                ...u,
                username: profileData.username,
                email: profileData.email,
                phone: profileData.phone,
                inGameName: profileData.inGameName,
                inGameId: profileData.inGameId,
                avatar_id: avatarId,
                avatarId: avatarId,
                avatarUrl: resolvedAvatarUrl,
                photoURL: resolvedAvatarUrl,
                profilePic: resolvedAvatarUrl,
                profileImage: resolvedAvatarUrl,
                avatar: resolvedAvatarUrl
              }
            : u
        )
      );

      await updateUserProfileInFirestore(userId, {
        ...profileData,
        avatar_id: avatarId,
        avatarId: avatarId,
        avatarUrl: resolvedAvatarUrl
      });
      await syncLeaderboardToFirestore(users);
      pushAudit('Updated Player Profile', `${profileData.username || userId} (IGN: ${profileData.inGameName}, Slot: ${avatarId})`);

      showConfirmationOverlay(
        'Player Profile Saved!',
        `Profile details for ${profileData.username || userId} have been successfully saved across database and app.`,
        [
          { label: 'Username', value: profileData.username },
          { label: 'Free Fire IGN', value: profileData.inGameName },
          { label: 'Free Fire UID', value: profileData.inGameId },
          { label: 'Avatar Preset', value: `${avatarId.toUpperCase().replace('_', ' ')}` }
        ],
        'PROFILE UPDATED',
        'success'
      );
    });
  };

  const handleDeleteUser = async (userId: string) => {
    await runAsyncAction('Deleting user account from view...', async () => {
      const u = users.find((x) => x.id === userId);
      setUsers((prev) => prev.filter((x) => x.id !== userId));
      await new Promise((res) => setTimeout(res, 350));
      pushAudit('Deleted User Account', `${u?.username || userId}`);

      showConfirmationOverlay(
        'User Account Deleted',
        `Account ${u?.username || userId} was removed from active view.`,
        [{ label: 'User ID', value: userId }],
        'USER DELETED',
        'danger'
      );
    });
  };

  // Tournament Handlers
  const handleCreateTournament = async (data: Omit<Tournament, 'id' | 'createdAt' | 'filledSlots' | 'participants'>) => {
    await runAsyncAction(`Creating & publishing tournament "${data.title}"...`, async () => {
      const tourId = crypto.randomUUID();
      const newTour: Tournament = {
        ...data,
        id: tourId,
        filledSlots: 0,
        participants: [],
        createdAt: new Date().toISOString()
      };
      setTournaments((prev) => [newTour, ...prev]);
      await createTournamentInFirestore(newTour, categories);
      pushAudit('Created Tournament', `${data.title} (${data.game})`);

      showConfirmationOverlay(
        'Tournament Created & Published!',
        `"${data.title}" for ${data.game} has been saved and published live on the WinX7 User App.`,
        [
          { label: 'Tournament Title', value: data.title },
          { label: 'Game Category', value: data.game },
          { label: 'Entry Fee', value: `₹${data.entryFee}` },
          { label: 'Prize Pool', value: `₹${data.prizePool}` },
          { label: 'Start Time', value: new Date(data.startTime).toLocaleString() }
        ],
        'TOURNAMENT CREATED'
      );
    });
  };

  const handleUpdateTournament = async (updated: Tournament) => {
    await runAsyncAction(`Saving updates for tournament "${updated.title}"...`, async () => {
      setTournaments((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      await updateTournamentInFirestore(updated.id, updated, categories);
      pushAudit('Updated Tournament', `${updated.title}`);

      showConfirmationOverlay(
        'Tournament Updated Successfully!',
        `Changes for "${updated.title}" have been saved and re-synced to Firestore.`,
        [
          { label: 'Tournament Title', value: updated.title },
          { label: 'Status', value: (updated.status || '').toUpperCase() },
          { label: 'Entry Fee', value: `₹${updated.entryFee}` }
        ],
        'TOURNAMENT UPDATED'
      );
    });
  };

  const handleDeleteTournament = async (id: string) => {
    await runAsyncAction('Permanently deleting tournament from Firestore...', async () => {
      const t = tournaments.find((x) => x.id === id);
      setTournaments((prev) => prev.filter((x) => x.id !== id));
      await deleteTournamentFromFirestore(id);
      pushAudit('Deleted Tournament', `${t?.title || id}`);

      showConfirmationOverlay(
        'Tournament Deleted',
        `Tournament "${t?.title || id}" was permanently removed.`,
        [{ label: 'Tournament ID', value: id }],
        'TOURNAMENT DELETED',
        'danger'
      );
    });
  };

  const handleReleaseRoomCredentials = async (id: string, roomId: string, pass: string) => {
    await runAsyncAction('Releasing match room credentials...', async () => {
      let tTitle = '';
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            tTitle = t.title;
            return { ...t, roomId, roomPassword: pass, isRoomReleased: true };
          }
          return t;
        })
      );

      await updateTournamentInFirestore(id, { roomId, roomPassword: pass, isRoomReleased: true });

      pushAudit('Released Room Credentials', `Room ${roomId} for ${tTitle}`);

      showConfirmationOverlay(
        'Room Credentials Released Live!',
        `Room ID (${roomId}) & Password (${pass}) are now live in the WinX7 player app.`,
        [
          { label: 'Tournament', value: tTitle },
          { label: 'Room ID', value: roomId },
          { label: 'Room Password', value: pass }
        ],
        'ROOM CREDS RELEASED'
      );
    });
  };

  const handleCancelMatchAndRefund = async (id: string) => {
    try {
      await cancelMatchAndRefund(id);
      
      // Update local state to reflect cancellation
      setTournaments(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, status: 'cancelled' };
        }
        return t;
      }));
      
      pushAudit('Cancelled Match & Refunded', `Match ID: ${id}`);
    } catch (err: any) {
      console.error('[handleCancelMatchAndRefund] Error:', err);
      throw err; // Let the UI handle the alert
    }
  };

  const [publishingMatches, setPublishingMatches] = useState<Set<string>>(new Set());

  const handlePublishMatchResults = async (id: string, updatedParticipants: Participant[]) => {
    if (publishingMatches.has(id)) {
        console.warn('Publishing already in progress for match:', id);
        return;
    }

    setPublishingMatches(prev => new Set(prev).add(id));

    try {
      await runAsyncAction('Publishing match leaderboard & crediting player winnings...', async () => {
        // 1. Inspect current tournament status in Supabase
        const { data: latestTournament } = await supabase
          .from('tournaments')
          .select('status, results_published')
          .eq('id', id)
          .single();
        
        console.log('[handlePublishMatchResults DEBUG] Tournament status check prior to publish:', latestTournament);

        const completedTimestamp = new Date().toISOString();

        // Prepare results for RPC - resolve userId from multiple fallback fields and prize_won
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const rpcResults = (updatedParticipants || [])
          .map(p => {
            const resolvedId = [p.userId, (p as any).user_id, (p as any).uid, p.id]
              .map(v => (v || '').toString().trim())
              .find(v => UUID_REGEX.test(v)) || '';
            const rawPrize = p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount ?? 0;
            return {
              user_id: resolvedId,
              rank: Number(p.rank || 0),
              kills: Number(p.kills || 0),
              prize_won: Number(rawPrize || 0)
            };
          })
          .filter(p => UUID_REGEX.test(p.user_id));

        console.log('[handlePublishMatchResults DEBUG] Prepared p_results payload:', JSON.stringify(rpcResults, null, 2));

        if (rpcResults.length === 0) {
          throw new Error('No valid registered players with User IDs found. Make sure players are registered in the Registrations table with their Supabase Auth user_id.');
        }

        // 2. Use the authoritative RPC to credit winnings, sync leaderboard/participants, and update tournament status
        const pubResult = await publishMatchResults(id, rpcResults);
        console.log('[handlePublishMatchResults DEBUG] publishMatchResults result:', pubResult);

        // 3. Re-fetch the tournament, participants, registrations, and fresh users from Supabase
        const [freshTourn, freshParts, freshRegs, freshUsersRes] = await Promise.all([
          supabase.from('tournaments').select('*').eq('id', id).single(),
          getMatchParticipantsFromSupabase(id),
          supabase.from('registrations').select('*').eq('tournament_id', id),
          supabase.from('profiles').select('*')
        ]);

        console.log('[handlePublishMatchResults DEBUG] Re-fetched tournament post-publish from DB:', {
          id,
          dbStatus: freshTourn.data?.status,
          resultsPublished: freshTourn.data?.results_published,
          completedAt: freshTourn.data?.completed_at
        });

        if (freshUsersRes.data && freshUsersRes.data.length > 0) {
          const mappedUsers = freshUsersRes.data.map((p: any) => normalizeUserDoc(p, p.id));
          setUsers(mappedUsers);
        }

        if (freshTourn.data) {
          const userMap = new Map(users.map(u => [u.id, u]));
          const normalized = normalizeTournamentDoc(freshTourn.data, id, freshRegs.data || [], userMap);
          normalized.status = 'completed';
          normalized.results_published = true;
          normalized.completedAt = completedTimestamp;
          normalized.participants = (freshParts && freshParts.length > 0) ? freshParts : updatedParticipants;
          
          setTournaments(prev => prev.map(t => t.id === id ? normalized : t));
        } else {
          setTournaments(prev => prev.map(t => {
            if (t.id === id) {
              return {
                ...t,
                status: 'completed',
                results_published: true,
                completedAt: completedTimestamp,
                participants: (freshParts && freshParts.length > 0) ? freshParts : updatedParticipants
              };
            }
            return t;
          }));
        }
        
        pushAudit('Published Match Results', `Match: ${id}, Participants: ${rpcResults.length}`);

        showConfirmationOverlay(
          'Match Results Published Successfully!',
          `Leaderboard has been finalized and player winnings have been credited to their wallets.`,
          [
            { label: 'Match ID', value: id },
            { label: 'Winners Processed', value: String(rpcResults.length) },
            { label: 'Status', value: 'COMPLETED' }
          ],
          'RESULTS PUBLISHED',
          'success'
        );
      });
    } catch (err: any) {
      console.error('[Publish Winners Error] Publish operation failed:', {
        matchId: id,
        rpcName: 'publish_match_results',
        rpcParams: { p_match_id: id },
        errorCode: err?.code || 'N/A',
        errorMessage: err?.message || String(err),
        errorDetails: err?.details || err?.stack || 'N/A',
        errorHint: err?.hint || 'N/A',
        stage: 'handlePublishMatchResults execution catch block',
        errorObject: err
      });
      alert(`Publish Winners Failed: ${err?.message || String(err)}`);
      throw err;
    } finally {
      setPublishingMatches(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Wallet Handlers
  const handleApproveTransaction = async (txOrId: WalletTransaction | string, note?: string) => {
    const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
    if (processingTxIdsRef.current.has(txId)) {
      console.warn(`Transaction ${txId} is already being processed.`);
      return;
    }
    const matchedTx = typeof txOrId === 'object' ? txOrId : transactions.find((t) => t.id === txId);
    if (!matchedTx) return;

    if (matchedTx.status === 'approved' || matchedTx.status === 'rejected') {
      alert(`Transaction #${matchedTx.referenceId || matchedTx.id} is already in status '${matchedTx.status}'.`);
      return;
    }

    processingTxIdsRef.current.add(txId);
    const now = new Date().toISOString();
    try {
      await runAsyncAction(`Approving payment transaction of ₹${matchedTx.amount}...`, async () => {
        const result = await approveTransactionInFirestore(matchedTx, note || 'Approved by WinX7 Admin');

        await refreshDeposits();

        if (matchedTx.type === 'winning') {
          await syncLeaderboardToFirestore(users);
        }
        
        if (result?.credited) {
          setUsers((prevUsers) =>
            prevUsers.map((u) => {
              if (u.id === matchedTx.userId || (u.uid && u.uid === matchedTx.userId)) {
                return {
                  ...u,
                  depositBalance: (u.depositBalance || u.walletBalance || 0) + matchedTx.amount,
                  walletBalance: (u.depositBalance || u.walletBalance || 0) + matchedTx.amount,
                };
              }
              return u;
            })
          );
        }
        
        pushAudit(`Approved ${matchedTx.type}`, `₹${matchedTx.amount} for ${matchedTx.username || matchedTx.userId}`);

        const overlayFields = [
          { label: 'Transaction Type', value: (matchedTx.type || '').toUpperCase() },
          { label: 'User UID / Username', value: matchedTx.username || matchedTx.userId },
          { label: 'Amount Approved', value: `₹${matchedTx.amount}` },
          { label: 'Wallet Credit Status', value: result?.credited ? 'CREDITED (₹' + matchedTx.amount + ')' : 'ALREADY CREDITED / IDEMPOTENT' }
        ];

        if (matchedTx.type === 'withdrawal') {
          overlayFields.push(
            { label: 'Withdrawal Request ID', value: matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id },
            { label: 'User UPI ID', value: matchedTx.upiId || matchedTx.userPhone || 'Not Provided' },
            { label: 'Payout Bank UTR', value: note && note.trim() !== 'Approved by WinX7 Admin' ? note.trim() : 'Approved / Generated' }
          );
        } else {
          overlayFields.push({ label: 'Deposit Ref / UTR', value: matchedTx.referenceId || matchedTx.id });
        }

        showConfirmationOverlay(
          `${matchedTx.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Approved Successfully!`,
          result?.credited
            ? `Transaction #${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id} of ₹${matchedTx.amount} has been approved and credited to the user wallet.`
            : `Transaction #${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id} is verified (already credited, no duplicate balance added).`,
          overlayFields,
          'PAYMENT APPROVED'
        );
      });
    } catch (err: any) {
      console.error('[handleApproveTransaction Error]:', err);
      alert(`Approval Failed: ${err?.message || 'Database error occurred during approval.'}`);
    } finally {
      processingTxIdsRef.current.delete(txId);
    }
  };

  const handleRejectTransaction = async (txOrId: WalletTransaction | string, reason: string) => {
    const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
    if (processingTxIdsRef.current.has(txId)) {
      console.warn(`Transaction ${txId} is already being processed.`);
      return;
    }
    const matchedTx = typeof txOrId === 'object' ? txOrId : transactions.find((t) => t.id === txId);
    if (!matchedTx) return;

    if (matchedTx.status === 'approved' || matchedTx.status === 'rejected') {
      alert(`Transaction #${matchedTx.referenceId || matchedTx.id} is already in status '${matchedTx.status}'.`);
      return;
    }

    processingTxIdsRef.current.add(txId);
    try {
      await runAsyncAction(`Rejecting payment transaction...`, async () => {
        await rejectTransactionInFirestore(matchedTx, reason);

        await refreshDeposits();

        pushAudit(`Rejected ${matchedTx.type}`, `₹${matchedTx.amount} for ${matchedTx.username} - ${reason}${matchedTx.type === 'withdrawal' ? ' (Amount remains deducted; Refund Manually available)' : ''}`);

        const overlayFields = [
          { label: 'Transaction Type', value: (matchedTx.type || '').toUpperCase() },
          { label: 'User Username', value: matchedTx.username },
          { label: 'Rejection Reason', value: reason }
        ];

        if (matchedTx.type === 'withdrawal') {
          overlayFields.push(
            { label: 'Withdrawal Request ID', value: matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id },
            { label: 'Wallet Action', value: `Amount ₹${matchedTx.amount} remains deducted. Use "Refund Manually" to credit back.` }
          );
        } else {
          overlayFields.push({ label: 'Deposit Ref / UTR', value: matchedTx.referenceId || matchedTx.id });
        }

        showConfirmationOverlay(
          `${matchedTx.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Rejected!`,
          `Transaction #${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id} for user ${matchedTx.username} was rejected. Reason: "${reason}".`,
          overlayFields,
          'PAYMENT REJECTED',
          'warning'
        );
      });
    } finally {
      processingTxIdsRef.current.delete(txId);
    }
  };

  const handleManualRefund = async (txOrId: WalletTransaction | string) => {
    const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
    if (processingTxIdsRef.current.has(txId)) {
      console.warn(`Transaction ${txId} is already being processed.`);
      return;
    }
    const matchedTx = typeof txOrId === 'object' ? txOrId : transactions.find((t) => t.id === txId);
    if (!matchedTx) return;

    const isTxMatch = (t: WalletTransaction) =>
      t.id === matchedTx.id ||
      (matchedTx.referenceId && t.id === matchedTx.referenceId) ||
      (matchedTx.withdrawalRequestId && t.id === matchedTx.withdrawalRequestId) ||
      (t.referenceId && (t.referenceId === matchedTx.id || t.referenceId === matchedTx.referenceId)) ||
      (t.withdrawalRequestId && (t.withdrawalRequestId === matchedTx.id || t.withdrawalRequestId === matchedTx.withdrawalRequestId));

    if (matchedTx.isRefunded) {
      setRawTransactions((prev) =>
        prev.map((t) =>
          isTxMatch(t)
            ? { ...t, isRefunded: true, refundedAt: t.refundedAt || new Date().toISOString() }
            : t
        )
      );
      showConfirmationOverlay(
        `Already Refunded`,
        `This withdrawal (#${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id}) was already refunded previously in the system.`,
        [
          { label: 'User Username', value: matchedTx.username },
          { label: 'Amount', value: `₹${matchedTx.amount}` },
          { label: 'Status', value: 'REFUNDED' }
        ],
        'REFUND RECORDED',
        'info'
      );
      return;
    }

    processingTxIdsRef.current.add(txId);
    try {
      await runAsyncAction(`Processing manual refund for ₹${matchedTx.amount}...`, async () => {
        const res = await refundRejectedWithdrawalInFirestore(matchedTx);

        setRawTransactions((prev) =>
          prev.map((t) =>
            isTxMatch(t)
              ? { ...t, isRefunded: true, refundedAt: new Date().toISOString() }
              : t
          )
        );

        if (res && (res as any).alreadyRefunded) {
          showConfirmationOverlay(
            `Already Refunded`,
            `This withdrawal (#${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id}) was already refunded previously in the system.`,
            [
              { label: 'User Username', value: matchedTx.username },
              { label: 'Amount', value: `₹${matchedTx.amount}` },
              { label: 'Status', value: 'REFUNDED' }
            ],
            'REFUND RECORDED',
            'info'
          );
          return;
        }

        await refreshDeposits();

        if (matchedTx.userId) {
          try {
            const actualWallet = await getUserWallet(matchedTx.userId);
            setUsers((prev) =>
              prev.map((u) =>
                u.id === matchedTx.userId || (u.uid && u.uid === matchedTx.userId)
                  ? { 
                      ...u, 
                      depositBalance: actualWallet.depositBalance,
                      walletBalance: actualWallet.depositBalance,
                      winningBalance: actualWallet.winningBalance,
                      unclaimedWinnings: actualWallet.winningBalance,
                      bonusBalance: actualWallet.bonusBalance,
                      totalBalance: actualWallet.totalBalance
                    }
                  : u
              )
            );
          } catch (e) {
            console.error('[handleManualRefund] Failed to refetch wallet:', e);
          }
        }

        pushAudit('Manual Refund', `₹${matchedTx.amount} credited back to ${matchedTx.username} for rejected withdrawal #${matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id}`);

        showConfirmationOverlay(
          `Withdrawal Refunded!`,
          `Exact amount ₹${matchedTx.amount} has been credited back to user ${matchedTx.username}'s wallet.`,
          [
            { label: 'User Username', value: matchedTx.username },
            { label: 'Amount Refunded', value: `₹${matchedTx.amount}` },
            { label: 'Withdrawal Request ID', value: matchedTx.withdrawalRequestId || matchedTx.referenceId || matchedTx.id },
            { label: 'Refund Status', value: 'REFUNDED & LOCKED' }
          ],
          'REFUND SUCCESSFUL',
          'success'
        );
      });
    } catch (err: any) {
      console.error('[handleManualRefund Error]:', err);
      alert(`Manual Refund Failed: ${err?.message || String(err)}`);
    } finally {
      processingTxIdsRef.current.delete(txId);
    }
  };

  const handleDeleteTransaction = async (txOrId: WalletTransaction | string) => {
    const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
    const matchedTx = typeof txOrId === 'object' ? txOrId : transactions.find((t) => t.id === txId || t.referenceId === txId);
    const identifier = matchedTx?.referenceId || matchedTx?.id || txId;

    if (!window.confirm(`Are you sure you want to permanently delete deposit request #${identifier}? This will remove it from the database.`)) {
      return;
    }

    try {
      await runAsyncAction(`Removing deposit request...`, async () => {
        await deleteTransactionFromFirestore(matchedTx || txId);
        await refreshDeposits();

        pushAudit(`Deleted Transaction`, `Removed #${identifier} (${matchedTx?.type || 'deposit'})`);

        showConfirmationOverlay(
          'Deposit Request Removed!',
          `Transaction #${identifier} was permanently deleted from the database.`,
          [
            { label: 'Reference / ID', value: identifier },
            { label: 'Status', value: 'DELETED' }
          ],
          'TRANSACTION REMOVED'
        );
      });
    } catch (err: any) {
      console.error('[handleDeleteTransaction Error]:', err);
      alert(`Delete Failed: ${err?.message || 'Error deleting transaction from database.'}`);
    }
  };

  const handleClearAllPendingDeposits = async () => {
    if (!window.confirm('Are you sure you want to remove ALL pending deposit requests? This will clear any stuck or bugged deposit requests.')) {
      return;
    }
    try {
      await runAsyncAction(`Purging all pending deposit requests...`, async () => {
        const count = await clearAllPendingDepositsFromSupabase();
        await refreshDeposits();
        pushAudit(`Cleared Pending Deposits`, `Purged ${count} pending deposit requests`);

        showConfirmationOverlay(
          'Pending Deposits Cleared!',
          `All pending deposit requests (${count}) have been removed from the database.`,
          [{ label: 'Cleared Count', value: String(count) }],
          'DEPOSITS PURGED'
        );
      });
    } catch (err: any) {
      console.error('[handleClearAllPendingDeposits Error]:', err);
      alert(`Failed to clear deposits: ${err?.message || 'Database error'}`);
    }
  };

  // Notification Handlers
  const handleSendNotification = async (notif: Omit<AppNotification, 'id' | 'sentAt' | 'sentBy'>) => {
    await runAsyncAction(`Broadcasting push notification to players...`, async () => {
      const timestamp = new Date().toISOString();
      const uniqueId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newN: AppNotification = {
        ...notif,
        id: uniqueId,
        sentAt: timestamp,
        createdAt: timestamp,
        sentBy: currentUser?.displayName || 'Admin',
        isRead: false,
        read: false
      };
      setNotifications((prev) => [newN, ...prev]);
      await sendNotificationInFirestore(newN);
      pushAudit('Sent FCM Push Broadcast', notif.title);

      showConfirmationOverlay(
        'Push Notification Dispatched!',
        `Notification "${notif.title}" was broadcast live to user devices.`,
        [
          { label: 'Title', value: notif.title },
          { label: 'Type', value: (notif.type || '').toUpperCase() }
        ],
        'NOTIFICATION SENT'
      );
    });
  };

  const handleDeleteNotification = async (id: string) => {
    await runAsyncAction('Deleting notification record...', async () => {
      setNotifications((prev) => prev.filter((x) => x.id !== id));
      await new Promise((res) => setTimeout(res, 300));
    });
  };

  // Staff Handlers
  const handleAddStaff = async (st: Omit<AdminUser, 'uid' | 'createdAt'> & { password?: string }) => {
    await runAsyncAction(`Provisioning account for ${st.displayName}...`, async () => {
      const result = await provisionStaffAccountInFirebase({
        email: st.email,
        password: st.password,
        displayName: st.displayName,
        role: st.role
      });
      if (result.success && result.adminUser) {
        setStaffList((prev) => [result.adminUser, ...prev.filter((s) => s.uid !== result.adminUser.uid)]);
        pushAudit('Provisioned Account', `${st.displayName} (${st.role})`);

        showConfirmationOverlay(
          'Staff Account Provisioned Successfully!',
          `Staff account for ${st.displayName} (${st.email}) with role "${(st.role || '').toUpperCase()}" has been created.`,
          [
            { label: 'Staff Name', value: st.displayName },
            { label: 'Staff Email', value: st.email },
            { label: 'Assigned Role', value: (st.role || '').toUpperCase() }
          ],
          'STAFF CREATED'
        );
      }
    });
  };

  const handleUpdateStaffStatus = async (uid: string, status: 'active' | 'inactive') => {
    await runAsyncAction(`Setting staff status to ${(status || '').toUpperCase()}...`, async () => {
      setStaffList((prev) => prev.map((s) => (s.uid === uid ? { ...s, status } : s)));
      await updateAdminUserStatusInFirestore(uid, status);
      pushAudit('Updated Staff Status', `${uid} -> ${status}`);

      showConfirmationOverlay(
        `Staff Status Set to ${(status || '').toUpperCase()}!`,
        `Staff user account status was updated in Firestore.`,
        [{ label: 'Staff UID', value: uid }, { label: 'New Status', value: (status || '').toUpperCase() }],
        'STAFF UPDATED',
        status === 'active' ? 'success' : 'warning'
      );
    });
  };

  const handleDeleteStaff = async (uid: string) => {
    if (!uid || typeof uid !== 'string') return;
    await runAsyncAction('Deleting staff user credentials...', async () => {
      setStaffList((prev) => prev.filter((s) => (s.uid || s.id) !== uid));
      await deleteAdminUserFromFirestore(uid);
      pushAudit('Deleted Staff Member', uid);

      showConfirmationOverlay(
        'Staff Member Removed',
        'Staff record removed from admin list.',
        [{ label: 'Staff UID', value: uid }],
        'STAFF DELETED',
        'danger'
      );
    });
  };

  const handleUpdateSystemSettings = async (updated: SystemSettingsType) => {
    console.log('[SystemSettings] Updating settings:', updated);
    await runAsyncAction('Saving global system configurations to database...', async () => {
      setSettings(updated);
      try {
        localStorage.setItem('winx7_system_settings', JSON.stringify(updated));
      } catch (e) {}

      await saveSystemSettingsInFirestore(updated);

      const activeSupportLinksCount = (updated.supportLinks || []).filter((l) => l.isActive).length;
      const changedDetails: { label: string; value: string }[] = [
        { label: 'Application Name', value: updated.appName || 'WinX7 Esports' },
        { label: 'UPI Receiver VPA', value: updated.upiId || 'Not Configured' },
        { label: 'Account Holder Name', value: updated.upiName || 'N/A' },
        { label: 'Deposit QR Mode', value: 'Dynamic Runtime UPI QR' },
        { label: 'Custom UPI Intent Link', value: updated.customQrLink ? 'Custom Deep Link' : 'Standard UPI Intent' },
        { label: 'Min Deposit Amount', value: `₹${updated.minDeposit ?? 10}` },
        { label: 'Min / Max Withdrawal', value: `₹${updated.minWithdrawal ?? 100} - ₹${updated.maxWithdrawal ?? 25000}` },
        { label: 'Deposit Guidelines', value: updated.depositInstructions ? `${updated.depositInstructions.length} characters configured` : 'Default instructions' },
        { label: 'Maintenance Mode', value: updated.maintenanceMode ? 'ENABLED (OFFLINE)' : 'DISABLED (ONLINE)' },
        { label: 'Maintenance Message', value: updated.maintenanceMessage || 'None set' },
        { label: 'Contact Support Email', value: updated.contactEmail || 'Not configured' },
        { label: 'Support Phone Helpline', value: updated.supportPhone || 'Not configured' },
        { label: 'Telegram Channel', value: updated.telegramChannel || 'Not configured' },
        { label: 'WhatsApp Group Link', value: updated.whatsappGroup || 'Not configured' },
        { label: 'Active Support Links', value: `${activeSupportLinksCount} custom link(s) active` },
        { label: 'Terms & Fair Play Rules', value: updated.termsAndFairPlayRulesText ? `${updated.termsAndFairPlayRulesText.length} characters (Synced)` : 'Default rules' },
        { label: 'Privacy Policy', value: (updated.privacyPolicyText || updated.privacyPolicy) ? `${(updated.privacyPolicyText || updated.privacyPolicy)?.length} characters (Synced)` : 'Default policy' },
        { label: 'Database Status', value: 'Connected & Synced to Supabase (id=general)' }
      ];

      showConfirmationOverlay(
        'Settings Saved & Uploaded Successfully!',
        'All system parameters, deposit QR code configurations, wallet limits, support channels, and maintenance settings were synced with Supabase and applied live across the application.',
        changedDetails,
        'SETTINGS SAVED & APPLIED',
        'success'
      );
    });
  };

  // Coupon Handlers
  const handleSaveCoupon = async (coupon: Coupon) => {
    await runAsyncAction(`Saving promo coupon "${coupon.code}"...`, async () => {
      setCoupons((prev) => {
        const idx = prev.findIndex((c) => c.id === coupon.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = coupon;
          return next;
        }
        return [coupon, ...prev];
      });
      await saveCouponInFirestore(coupon);
      pushAudit('Saved Coupon Code', coupon.code);

      showConfirmationOverlay(
        'Promo Coupon Saved & Active!',
        `Coupon code "${coupon.code}" (${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : '₹'} discount) has been saved.`,
        [
          { label: 'Coupon Code', value: coupon.code },
          { label: 'Discount', value: `${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : '₹'}` },
          { label: 'Usage Limit', value: coupon.usageLimit }
        ],
        'COUPON SAVED'
      );
    });
  };

  const handleDeleteCoupon = async (couponId: string) => {
    await runAsyncAction('Deleting promotional coupon code...', async () => {
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      await deleteCouponFromFirestore(couponId);
      pushAudit('Deleted Coupon Code', couponId);

      showConfirmationOverlay(
        'Coupon Code Removed',
        'Promo coupon was deleted.',
        [{ label: 'Coupon ID', value: couponId }],
        'COUPON DELETED',
        'danger'
      );
    });
  };

  // Category Handlers
  const handleSaveCategory = async (cat: MatchCategory) => {
    await runAsyncAction(`Saving game category "${cat.name}"...`, async () => {
      setCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === cat.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = cat;
          return next;
        }
        return [...prev, cat];
      });
      await saveCategoryInFirestore(cat);
      pushAudit('Saved Tournament Category', cat.name);

      showConfirmationOverlay(
        'Game Category Saved!',
        `Category "${cat.name}" has been updated.`,
        [{ label: 'Category Name', value: cat.name }],
        'CATEGORY SAVED'
      );
    });
  };

  const handleDeleteCategory = async (catId: string) => {
    await runAsyncAction('Deleting game category from database...', async () => {
      setCategories((prev) => prev.filter((c) => c.id !== catId));
      await deleteCategoryFromFirestore(catId);
      pushAudit('Deleted Tournament Category', catId);

      showConfirmationOverlay(
        'Game Category Deleted',
        'Category was removed.',
        [{ label: 'Category ID', value: catId }],
        'CATEGORY DELETED',
        'danger'
      );
    });
  };

  // Match Rules Presets Handlers
  const handleSaveMatchRule = async (preset: Omit<MatchRulesPreset, 'createdAt'>) => {
    await runAsyncAction(`Saving match rules template "${preset.name}"...`, async () => {
      setMatchRules((prev) => {
        const idx = prev.findIndex((r) => r.id === preset.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...preset, createdAt: prev[idx].createdAt || new Date().toISOString() };
          return next;
        }
        return [...prev, { ...preset, createdAt: new Date().toISOString() }];
      });
      await createMatchRuleInFirestore(preset);
      pushAudit('Saved Match Rules Preset', preset.name);

      showConfirmationOverlay(
        'Rules Preset Saved!',
        `Match rules template "${preset.name}" has been successfully saved. You can now choose this directly when hosting new matches.`,
        [{ label: 'Template Name', value: preset.name }],
        'RULES PRESET SAVED'
      );
    });
  };

  const handleDeleteMatchRule = async (id: string) => {
    const matched = matchRules.find((r) => r.id === id);
    const templateName = matched ? matched.name : id;
    await runAsyncAction('Deleting match rules template...', async () => {
      setMatchRules((prev) => prev.filter((r) => r.id !== id));
      await deleteMatchRuleFromFirestore(id);
      pushAudit('Deleted Match Rules Preset', templateName);

      showConfirmationOverlay(
        'Rules Preset Deleted',
        `The rules template was deleted from Firestore.`,
        [{ label: 'Template ID', value: id }],
        'RULES PRESET DELETED',
        'danger'
      );
    });
  };

  // Saved Images Handlers
  const handleSaveSavedImage = async (image: SavedImage) => {
    await runAsyncAction(`Saving image "${image.name}" to Saved Images library...`, async () => {
      setSavedImages((prev) => {
        const idx = prev.findIndex((img) => img.id === image.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = image;
          return next;
        }
        return [image, ...prev];
      });
      await saveSavedImageInFirestore(image);
      pushAudit('Saved Image to Library', image.name);
    });
  };

  const handleDeleteSavedImage = async (imageId: string) => {
    const matched = savedImages.find((img) => img.id === imageId);
    const imageName = matched ? matched.name : imageId;
    await runAsyncAction('Deleting saved image from library...', async () => {
      setSavedImages((prev) => prev.filter((img) => img.id !== imageId));
      await deleteSavedImageFromFirestore(imageId);
      pushAudit('Deleted Saved Image', imageName);
    });
  };

  const pendingDepositsCount = transactions.filter((t) => t.type === 'deposit' && t.status === 'pending').length;
  const pendingWithdrawalsCount = transactions.filter((t) => t.type === 'withdrawal' && t.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#0A0814] text-white flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      
      {/* Top App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        toggleMobileMenu={() => setMobileDrawerOpen(!mobileDrawerOpen)}
        pendingCount={pendingCount}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        lastRefreshedText={lastRefreshedAt}
      />

      {/* Main Body Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-2 sm:px-4 py-3 sm:py-6 gap-4">
        
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={mobileDrawerOpen}
          closeSidebar={() => setMobileDrawerOpen(false)}
          pendingDepositsCount={pendingDepositsCount}
          pendingWithdrawalsCount={pendingWithdrawalsCount}
        />

        {/* Tab Content Display View */}
        <main className="flex-1 min-w-0">
          {activeTab === 'dashboard' && (
            <OverviewTab
              users={users}
              tournaments={tournaments}
              transactions={transactions}
              setActiveTab={setActiveTab}
              onOpenCreateMatch={() => {
                setActiveTab('matches');
                setOpenCreateMatchDirectly(true);
              }}
            />
          )}

          {activeTab === 'users' && (
            <UserManagement
              users={users}
              transactions={transactions}
              tournaments={tournaments}
              onUpdateUserStatus={handleUpdateUserStatus}
              onUpdateUserWallet={handleUpdateUserWallet}
              onDeleteUser={handleDeleteUser}
              onEditUser={handleEditUserProfile}
            />
          )}

          {(activeTab === 'matches' || activeTab === 'tournaments') && (
            <TournamentManagement
              tournaments={tournaments}
              categories={categories}
              matchRules={matchRules}
              users={users}
              onCreateTournament={handleCreateTournament}
              onUpdateTournament={handleUpdateTournament}
              onDeleteTournament={handleDeleteTournament}
              onReleaseRoomCredentials={handleReleaseRoomCredentials}
              onPublishMatchResults={handlePublishMatchResults}
              onCancelMatchAndRefund={handleCancelMatchAndRefund}
              onSaveCategory={handleSaveCategory}
              onDeleteCategory={handleDeleteCategory}
              onSaveMatchRule={handleSaveMatchRule}
              onDeleteMatchRule={handleDeleteMatchRule}
              openCreateModalDirectly={openCreateMatchDirectly}
              savedImages={savedImages}
              onNavigateToSavedImages={() => setActiveTab('saved-images')}
            />
          )}

          {activeTab === 'saved-images' && (
            <SavedImagesManagement
              savedImages={savedImages}
              tournaments={tournaments}
              onSaveSavedImage={handleSaveSavedImage}
              onDeleteSavedImage={handleDeleteSavedImage}
              onSelectForMatchCreation={(img) => {
                setActiveTab('matches');
                setOpenCreateMatchDirectly(true);
              }}
            />
          )}

          {activeTab === 'deposits' && (
            <DepositsView
              transactions={transactions}
              onApprove={handleApproveTransaction}
              onReject={handleRejectTransaction}
              onDelete={handleDeleteTransaction}
              onClearAllPendingDeposits={handleClearAllPendingDeposits}
              onRefresh={refreshDeposits}
            />
          )}

          {activeTab === 'withdrawals' && (
            <WithdrawalsView
              transactions={transactions}
              onApprove={handleApproveTransaction}
              onReject={handleRejectTransaction}
              onRefund={handleManualRefund}
            />
          )}

          {activeTab === 'wallet' && (
            <WalletManagement
              transactions={transactions}
              onApproveTransaction={handleApproveTransaction}
              onRejectTransaction={handleRejectTransaction}
              onRefundTransaction={handleManualRefund}
              onDeleteTransaction={handleDeleteTransaction}
              onManualWalletAdjustment={async (user, amt, isAdd, note, walletType) => {
                const query = user.toLowerCase().trim();
                const found = users.find((u) => {
                  return (
                    u.id.toLowerCase() === query ||
                    (u.uid && u.uid.toLowerCase() === query) ||
                    (u.username && u.username.toLowerCase() === query) ||
                    (u.email && u.email.toLowerCase() === query) ||
                    (u.phone && u.phone.toLowerCase() === query) ||
                    (u.inGameName && u.inGameName.toLowerCase() === query) ||
                    (u.inGameId && u.inGameId.toLowerCase() === query)
                  );
                });
                
                if (found) {
                  await handleUpdateUserWallet(found.id, amt, isAdd, note, walletType);
                } else {
                  throw new Error(`User "${user}" not found. Please enter an exact Username, User ID, UID, or Email.`);
                }
              }}
            />
          )}

          {activeTab === 'announcements' && (
            <div className="text-purple-300 text-center py-10 text-sm">
              Push notification management has been moved to the Notification App.
            </div>
          )}


          {activeTab === 'coupons' && (
            <CouponManagement
              coupons={coupons}
              onSaveCoupon={handleSaveCoupon}
              onDeleteCoupon={handleDeleteCoupon}
            />
          )}

          {activeTab === 'support' && (
            <SupportDeskConfig
              settings={settings}
              onUpdateSettings={handleUpdateSystemSettings}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsAnalytics
              users={users}
              tournaments={tournaments}
              transactions={transactions}
            />
          )}

          {activeTab === 'staff' && (
            <StaffManagement
              staffList={staffList}
              onAddStaff={handleAddStaff}
              onUpdateStaffStatus={handleUpdateStaffStatus}
              onDeleteStaff={handleDeleteStaff}
            />
          )}

          {activeTab === 'settings' && (
            <SystemSettings
              settings={settings}
              onUpdateSettings={handleUpdateSystemSettings}
            />
          )}
        </main>
      </div>

      {/* Live Sync / Saving Progress Loader Indicator */}
      {isDbProcessing && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#15112E] border border-purple-800/60 p-8 rounded-3xl flex flex-col items-center space-y-4 max-w-sm text-center shadow-2xl">
            <div className="relative w-16 h-16">
              {/* Inner glow and spinner */}
              <div className="absolute inset-0 rounded-full border-4 border-purple-950" />
              <div className="absolute inset-0 rounded-full border-4 border-t-amber-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-black text-amber-300 uppercase tracking-widest">
                Syncing with Cloud
              </h4>
              <p className="text-xs text-purple-200 font-medium">
                {dbProcessingMessage || 'Processing your request...'}
              </p>
            </div>
            <div className="text-[9px] text-purple-400 font-bold uppercase tracking-wider bg-purple-950 px-3 py-1 rounded-full border border-purple-900/40">
              WinX7 Live Sync
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation & Feedback Modal */}
      <ActionConfirmationModal
        {...actionModal}
        onClose={() => setActionModal({ isOpen: false, title: '', message: '' })}
      />

      {/* Bottom Navigation for Mobile Phones */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openMobileDrawer={() => setMobileDrawerOpen(true)}
        pendingCount={pendingCount}
      />

    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppWithAuth />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppWithAuth() {
  const { currentUser, sessionUser, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0814] flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-purple-600/30 border-t-amber-400 rounded-full animate-spin mb-4" />
        <p className="text-xs font-extrabold text-amber-300 uppercase tracking-widest text-center">
          Verifying WinX7 Admin Authorization...
        </p>
        <p className="text-[11px] text-purple-400/80 mt-1 text-center">
          Checking account privileges with database
        </p>
      </div>
    );
  }

  // If user is authenticated in Supabase but not an authorized Admin (e.g. role USER)
  if (sessionUser && !currentUser) {
    return (
      <div className="min-h-screen bg-[#0A0814] flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-[#130F29] border border-purple-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl text-center animate-in fade-in">
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-1 tracking-tight">
            Admin Access Required
          </h2>
          <p className="text-xs text-purple-300/90 mb-4">
            You are signed in as <span className="text-white font-semibold">{sessionUser.email || 'User'}</span> with normal user permissions.
          </p>
          <div className="p-3 bg-purple-950/60 border border-purple-800/50 rounded-2xl text-left text-xs text-purple-300 mb-6">
            <p className="text-[11px] text-purple-200 font-medium">
              This portal is restricted to authorized WinX7 administrators only.
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              onClick={() => logout()}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg transition duration-200 active:scale-95"
            >
              Sign In with an Admin Account
            </button>
            <button
              onClick={() => logout()}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-purple-300 hover:text-white bg-[#1A1538] hover:bg-purple-900/40 border border-purple-800/50 transition duration-200 active:scale-95"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginModal />;
  }

  return (
    <ErrorBoundary>
      <MainPortalContent />
    </ErrorBoundary>
  );
}
