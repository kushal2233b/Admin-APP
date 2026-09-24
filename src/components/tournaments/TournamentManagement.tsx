import React, { useState, useEffect, useMemo } from 'react';
import {
  Tournament,
  GameCategory,
  MatchType,
  MapType,
  MatchStatus,
  Participant,
  MatchCategory,
  Banner,
  MatchRulesPreset,
  PrizeDistributionItem,
  AppUser,
  SavedImage
} from '../../types';
import { uploadToStorage } from '../../services/storageService';
import { getCategoryBannerImage, handleImageFallback } from '../../data/categoryImages';
import { initialCategories } from '../../data/mockData';
import { Upload, Eye, Copy, Search, RefreshCw, Clock, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { getMatchParticipantsFromSupabase, getMatchDateTimeStrings, normalizePublicMatchId, isMatchLiveBySchedule, parseMatchStartTimeMs } from '../../services/supabaseService';
import { subscribeServerTimeTick } from '../../services/serverTimeSync';
import {
  Trophy,
  Plus,
  Edit3,
  Trash2,
  Key,
  Award,
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Sparkles,
  Flame,
  Shield,
  Gamepad2,
  Crosshair,
  Calendar,
  DollarSign,
  Image as ImageIcon,
  ChevronDown,
  X,
  PlayCircle,
  HelpCircle,
  Tag,
  Layers,
  Check,
  Zap,
  ArrowLeft
} from 'lucide-react';

interface TournamentManagementProps {
  tournaments: Tournament[];
  categories?: MatchCategory[];
  banners?: Banner[];
  matchRules?: MatchRulesPreset[];
  users?: AppUser[];
  onAddBanner?: (banner: Omit<Banner, 'id' | 'createdAt'>) => void;
  onDeleteBanner?: (id: string) => void;
  onCreateTournament: (tournament: Omit<Tournament, 'id' | 'createdAt' | 'filledSlots' | 'participants'>) => void | Promise<void>;
  onUpdateTournament: (tournament: Tournament) => void | Promise<void>;
  onDeleteTournament: (id: string) => void;
  onReleaseRoomCredentials: (id: string, roomId: string, pass: string) => void;
  onPublishMatchResults: (id: string, updatedParticipants: Participant[]) => void;
  onSubmitResultForVerification?: (matchId: string, participantResults: Participant[], proofNotes?: string, evidenceUrls?: string[]) => Promise<void>;
  onNavigateToResultRequests?: () => void;
  onCancelMatchAndRefund?: (id: string) => Promise<void>;
  onSaveCategory?: (cat: MatchCategory) => void;
  onDeleteCategory?: (catId: string) => void;
  onSaveMatchRule?: (preset: Omit<MatchRulesPreset, 'createdAt'>) => void;
  onDeleteMatchRule?: (id: string) => void;
  openCreateModalDirectly?: boolean;
  savedImages?: SavedImage[];
  onNavigateToSavedImages?: () => void;
  onRefresh?: () => void;
}

export function getPrizeForRank(rank: number, distribution: PrizeDistributionItem[]): number {
  if (!distribution || distribution.length === 0) return 0;
  for (const dist of distribution) {
    if (!dist) continue;
    const prizeVal = Number(dist.prize ?? (dist as any).amount ?? (dist as any).prize_won ?? (dist as any).reward ?? 0);
    const rangeStr = (dist.rankRange || (dist as any).rank_range || (dist as any).rank || '').toString().toLowerCase().trim();
    
    // Check if exact match of digits in the string, e.g. "rank 1" or "1st place"
    const numbers = rangeStr.match(/\d+/g);
    if (numbers) {
      if (numbers.length === 1) {
        // Single rank, e.g. "1st", "Rank 1", "1"
        if (Number(numbers[0]) === rank) {
          return prizeVal;
        }
      } else if (numbers.length === 2) {
        // Range, e.g. "4-10", "4th to 10th"
        const start = Number(numbers[0]);
        const end = Number(numbers[1]);
        if (rank >= start && rank <= end) {
          return prizeVal;
        }
      }
    }
    
    // Fallback checks
    if (rank === 1 && (rangeStr.includes('1st') || rangeStr.includes('first') || rangeStr === '1' || rangeStr.includes('winner') || rangeStr.includes('top 1'))) {
      return prizeVal;
    }
    if (rank === 2 && (rangeStr.includes('2nd') || rangeStr.includes('second') || rangeStr === '2' || rangeStr.includes('runner'))) {
      return prizeVal;
    }
    if (rank === 3 && (rangeStr.includes('3rd') || rangeStr.includes('third') || rangeStr === '3')) {
      return prizeVal;
    }
  }

  // Fallback: If rank is 1, and distribution has at least one entry, return first distribution prize
  if (rank === 1 && distribution.length > 0) {
    const firstDist = distribution[0];
    return Number(firstDist.prize ?? (firstDist as any).amount ?? (firstDist as any).prize_won ?? (firstDist as any).reward ?? 0);
  }

  return 0;
}

export function resolveParticipantDetails(p: any, users: AppUser[] = [], matchContext?: any) {
  if (!p) {
    return {
      matchedUser: null,
      email: 'N/A',
      gameUid: 'N/A',
      gameIgn: 'N/A',
      username: 'Player',
      userAuthUid: 'N/A'
    };
  }

  let parsedP = p;
  if (typeof p === 'string') {
    const trimmed = p.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        parsedP = JSON.parse(trimmed);
      } catch (e) {
        // Fallback to normal string processing
      }
    }
  }

  // Multi-signal check for BGMI match context
  const isMatchBgmi = Boolean(
    matchContext && (
      (typeof matchContext === 'boolean' && matchContext) ||
      (typeof matchContext === 'string' && (matchContext.toUpperCase() === 'BGMI' || matchContext.toUpperCase().includes('BATTLEGROUND') || matchContext.toUpperCase() === 'PUBG')) ||
      ((matchContext.game || '').toUpperCase() === 'BGMI') ||
      ((matchContext.game || '').toUpperCase().includes('BATTLEGROUND')) ||
      ((matchContext.game || '').toUpperCase() === 'PUBG') ||
      ((matchContext.title || '').toUpperCase().includes('BGMI')) ||
      ((matchContext.title || '').toUpperCase().includes('BATTLEGROUND')) ||
      ((matchContext.title || '').toUpperCase().includes('PUBG')) ||
      ((matchContext.category || '').toUpperCase() === 'BGMI') ||
      ((matchContext.matchCategory || '').toUpperCase() === 'BGMI') ||
      (((matchContext as any).category_name || '').toUpperCase() === 'BGMI') ||
      (((matchContext as any).game_name || '').toUpperCase() === 'BGMI') ||
      ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes(((matchContext.map || '') as string).toUpperCase()) ||
      ((matchContext.matchType || '') as string).toUpperCase().includes('TDM') ||
      ((matchContext.matchType || '') as string).toUpperCase().includes('ULTIMATE ROYALE') ||
      Number(matchContext.maxSlots || matchContext.maxParticipants) === 100
    )
  );

  const isBgmi = isMatchBgmi || Boolean(
    parsedP && typeof parsedP === 'object' && (
      parsedP.bgmi_uid || parsedP.bgmiUid || parsedP.bgmi_ign || parsedP.bgmiIgn || parsedP.pubgId ||
      (parsedP.game || '').toUpperCase() === 'BGMI'
    )
  );

  // Extract candidate fields from parsedP
  const pUserId = (typeof parsedP === 'object' ? (parsedP.userId || parsedP.user_id || parsedP.userUid || parsedP.user_uid || parsedP.uid || parsedP.id || parsedP.playerId || parsedP.player_id || parsedP.account_id || parsedP.accountId || '') : '').toString().trim();
  const pEmail = (typeof parsedP === 'object' ? (parsedP.email || parsedP.userEmail || parsedP.user_email || parsedP.mail || '') : '').toString().trim();
  const pPhone = (typeof parsedP === 'object' ? (parsedP.phone || parsedP.userPhone || parsedP.user_phone || parsedP.mobile || '') : '').toString().trim();
  const pUsername = (typeof parsedP === 'object' ? (parsedP.username || parsedP.user_name || parsedP.displayName || parsedP.display_name || parsedP.name || '') : '').toString().trim();

  // Handle case where parsedP is a primitive string or number (e.g. "uid_xyz" or "123456")
  if (typeof parsedP === 'string' || typeof parsedP === 'number') {
    const pStr = String(parsedP).trim();
    const pLower = pStr.toLowerCase();

    const matchedUser = users.find(u => {
      if (!u) return false;
      const uId = (u.id || '').toLowerCase().trim();
      const uUid = (u.uid || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uInGameId = (u.inGameId || (u as any).bgmiUid || (u as any).ffUid || '').toLowerCase().trim();
      const uInGameName = (u.inGameName || (u as any).bgmiIgn || (u as any).ffIgn || '').toLowerCase().trim();
      const uUsername = (u.username || '').toLowerCase().trim();

      return (
        (uId && pLower === uId) ||
        (uUid && pLower === uUid) ||
        (uEmail && pLower === uEmail) ||
        (uInGameId && pLower === uInGameId) ||
        (uInGameName && pLower === uInGameName) ||
        (uUsername && pLower === uUsername)
      );
    });

    if (matchedUser) {
      let resolvedUid = 'N/A';
      let resolvedIgn = 'N/A';

      if (isBgmi) {
        resolvedUid = (matchedUser as any).bgmiUid || (matchedUser as any).bgmi_uid || (matchedUser as any).bgmiId || (matchedUser as any).pubgId || matchedUser.inGameId;
        resolvedIgn = (matchedUser as any).bgmiIgn || (matchedUser as any).bgmi_ign || (matchedUser as any).bgmiName || (matchedUser as any).pubgName || matchedUser.inGameName;
      } else {
        resolvedUid = (matchedUser as any).ffUid || (matchedUser as any).ff_uid || matchedUser.inGameId;
        resolvedIgn = (matchedUser as any).ffIgn || (matchedUser as any).ff_ign || matchedUser.inGameName;
      }

      if (!resolvedUid || resolvedUid === 'N/A') {
        resolvedUid = matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : (matchedUser.uid || matchedUser.id || 'N/A');
      }
      if (!resolvedIgn || resolvedIgn === 'N/A') {
        resolvedIgn = matchedUser.inGameName !== 'N/A' ? matchedUser.inGameName : (matchedUser.username || 'N/A');
      }

      return {
        matchedUser,
        email: matchedUser.email || 'N/A',
        gameUid: resolvedUid,
        gameIgn: resolvedIgn,
        username: matchedUser.username || matchedUser.displayName || 'Player',
        userAuthUid: matchedUser.uid || matchedUser.id || 'N/A'
      };
    }

    const isEmail = pStr.includes('@');
    return {
      matchedUser: null,
      email: isEmail ? pStr : 'N/A',
      gameUid: !isEmail ? pStr : 'N/A',
      gameIgn: 'N/A',
      username: isEmail ? pStr.split('@')[0] : 'Player',
      userAuthUid: !isEmail ? pStr : 'N/A'
    };
  }

  // Find matching user in users collection
  const matchedUser = users.find(u => {
    if (!u) return false;

    const uUid = (u.uid || u.id || '').toString().toLowerCase().trim();
    if (pUserId && uUid && pUserId.toLowerCase() === uUid) return true;

    const uEmail = (u.email || '').toString().toLowerCase().trim();
    if (pEmail && uEmail && pEmail.toLowerCase() === uEmail) return true;

    const uPhone = (u.phone || '').toString().trim();
    if (pPhone && uPhone && pPhone === uPhone) return true;

    const uInGameId = (u.inGameId || (u as any).bgmiUid || (u as any).ffUid || (u as any).ignId || '').toString().toLowerCase().trim();
    if (parsedP.inGameId && uInGameId && parsedP.inGameId.toString().toLowerCase() === uInGameId) return true;

    const uUsername = (u.username || (u as any).displayName || '').toString().toLowerCase().trim();
    if (pUsername && uUsername && pUsername.toLowerCase() === uUsername) return true;

    const uInGameName = (u.inGameName || (u as any).bgmiIgn || (u as any).ffIgn || (u as any).ign || '').toString().toLowerCase().trim();
    if (parsedP.inGameName && uInGameName && parsedP.inGameName.toString().toLowerCase() === uInGameName) return true;

    return false;
  });

  const pBgmiUid = (parsedP.bgmiUid || parsedP.bgmi_uid || parsedP.bgmiId || parsedP.bgmi_id || parsedP.pubgId || '').toString().trim();
  const pBgmiIgn = (parsedP.bgmiIgn || parsedP.bgmi_ign || parsedP.bgmiName || parsedP.bgmi_name || parsedP.pubgName || '').toString().trim();

  const pFfUid = (parsedP.ffUid || parsedP.ff_uid || parsedP.ffId || parsedP.freeFireId || '').toString().trim();
  const pFfIgn = (parsedP.ffIgn || parsedP.ff_ign || parsedP.ffName || parsedP.freeFireName || '').toString().trim();

  const pInGameId = (
    parsedP.inGameId || parsedP.inGameIdValue || parsedP.inGameUID || parsedP.gameUid || parsedP.game_uid || parsedP.gameId || parsedP.game_id || parsedP.playerUid || parsedP.playerId || ''
  ).toString().trim();

  const pInGameName = (
    parsedP.inGameName || parsedP.inGameNameValue || parsedP.ign || parsedP.gameName || parsedP.game_name || parsedP.playerName || parsedP.player_name || parsedP.gamerName || parsedP.name || ''
  ).toString().trim();

  // Extract final Email
  const email = pEmail || matchedUser?.email || 'N/A';

  let gameUid = 'N/A';
  let gameIgn = 'N/A';

  if (isBgmi) {
    const userBgmiUid = (matchedUser as any)?.bgmiUid || (matchedUser as any)?.bgmi_uid || (matchedUser as any)?.bgmiId || (matchedUser as any)?.bgmi_id || (matchedUser as any)?.pubgId;
    const userBgmiIgn = (matchedUser as any)?.bgmiIgn || (matchedUser as any)?.bgmi_ign || (matchedUser as any)?.bgmiName || (matchedUser as any)?.bgmi_name || (matchedUser as any)?.pubgName;

    gameUid = userBgmiUid || pBgmiUid || pInGameId || (matchedUser?.inGameId !== 'N/A' ? matchedUser?.inGameId : '') || 'N/A';
    gameIgn = userBgmiIgn || pBgmiIgn || pInGameName || (matchedUser?.inGameName !== 'N/A' ? matchedUser?.inGameName : '') || '';
  } else {
    const userFfUid = (matchedUser as any)?.ffUid || (matchedUser as any)?.ff_uid || (matchedUser as any)?.freeFireId;
    const userFfIgn = (matchedUser as any)?.ffIgn || (matchedUser as any)?.ff_ign || (matchedUser as any)?.freeFireName;

    gameUid = userFfUid || pFfUid || pInGameId || (matchedUser?.inGameId !== 'N/A' ? matchedUser?.inGameId : '') || 'N/A';
    gameIgn = userFfIgn || pFfIgn || pInGameName || (matchedUser?.inGameName !== 'N/A' ? matchedUser?.inGameName : '') || '';
  }

  if (!gameUid || gameUid === 'N/A') {
    if (parsedP.uid && parsedP.uid !== pUserId && parsedP.uid !== 'N/A') {
      gameUid = parsedP.uid;
    } else if (matchedUser?.uid && matchedUser.uid !== 'N/A') {
      gameUid = matchedUser.uid;
    } else {
      gameUid = pUserId !== '' ? pUserId : 'N/A';
    }
  }

  if (!gameIgn || gameIgn === 'N/A') {
    if (matchedUser?.username && matchedUser.username !== 'Player') {
      gameIgn = matchedUser.username;
    } else if (matchedUser?.displayName) {
      gameIgn = matchedUser.displayName;
    } else if (pUsername && pUsername !== 'Player' && !pUsername.toLowerCase().startsWith('player ')) {
      gameIgn = pUsername;
    } else {
      gameIgn = pInGameName || 'N/A';
    }
  }

  // Extract final Username
  const username =
    matchedUser?.username ||
    matchedUser?.displayName ||
    matchedUser?.inGameName ||
    ((pUsername && !pUsername.toLowerCase().startsWith('player ')) ? pUsername :
    (email !== 'N/A' ? email.split('@')[0] : (pUsername || 'Player')));

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validUuid = [pUserId, matchedUser?.uid, matchedUser?.id, parsedP.user_id, parsedP.userId, parsedP.uid]
    .map(v => (v || '').toString().trim())
    .find(v => UUID_REGEX.test(v));

  const userAuthUid = validUuid || matchedUser?.uid || matchedUser?.id || (pUserId !== '' ? pUserId : 'N/A');

  return {
    matchedUser,
    email,
    gameUid,
    gameIgn,
    username,
    userAuthUid
  };
}

export const getMatchBannerImage = (match: Partial<Tournament>, _bannersList: Banner[] = [], categoriesList: MatchCategory[] = []): string => {
  const customImg =
    match.bannerUrl ||
    (match as any)?.imageUrl ||
    (match as any)?.cardImage ||
    (match as any)?.card_image ||
    (match as any)?.card_image_url ||
    (match as any)?.banner_url ||
    (match as any)?.image_url ||
    (match as any)?.thumbnailUrl ||
    (match as any)?.thumbnail_url ||
    (match as any)?.banner ||
    (match as any)?.thumbnail ||
    (match as any)?.image ||
    (match as any)?.matchImage;

  if (customImg && typeof customImg === 'string' && customImg.trim().length > 0 && customImg.trim() !== 'N/A') {
    return customImg.trim();
  }

  // Fallbacks by game category saved locally in code
  const game = match.game || (match as any)?.categoryName || (match as any)?.category || 'FREE FIRE';
  return getCategoryBannerImage(game, categoriesList);
};

function TournamentResultFormPanel({
  match,
  users,
  currentUser,
  onSubmitResultForVerification,
  onPublishMatchResults,
  onClose
}: {
  match: Tournament;
  users: AppUser[];
  currentUser: AppUser | null;
  onSubmitResultForVerification?: (matchId: string, results: any[]) => Promise<any> | void;
  onPublishMatchResults?: (matchId: string, results: any[]) => Promise<any> | void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [statusState, setStatusState] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE'>('NONE');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [participantResults, setParticipantResults] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBgmi = Boolean(
    (match.game || (match as any).game_category || match.title || '').toUpperCase().includes('BGMI') ||
    (match.game || (match as any).game_category || match.title || '').toUpperCase().includes('BATTLEGROUND') ||
    (match.game || (match as any).game_category || match.title || '').toUpperCase().includes('PUBG')
  );

  const loadDataFromSupabase = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: regsData } = await supabase
        .from('registrations')
        .select('*')
        .eq('tournament_id', match.id);

      const userIds = Array.from(new Set([
        ...(regsData || []).map(r => r.user_id).filter(Boolean),
        ...((match.participants || []).map((p: any) => p.userId || p.user_id || p.id).filter(Boolean))
      ]));

      let profilesData: any[] = [];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
        profilesData = profs || [];
      } else {
        const { data: profs } = await supabase.from('profiles').select('*').limit(200);
        profilesData = profs || [];
      }
      const profilesMap = new Map<string, any>();
      profilesData.forEach(p => {
        if (p.id) profilesMap.set(String(p.id).toLowerCase(), p);
      });

      const { data: reqsData } = await supabase
        .from('result_requests')
        .select('*')
        .or(`tournament_id.eq.${match.id},match_id.eq.${match.id}`)
        .order('created_at', { ascending: false });

      console.log('[RESULT VERIFY] result_request fetched for match:', match.id, reqsData);

      const latestReq = reqsData && reqsData.length > 0 ? reqsData[0] : null;
      const currentStatus = (latestReq?.status || 'NONE').toUpperCase() as any;

      let rawResults: any[] = [];
      if (latestReq) {
        rawResults = Array.isArray(latestReq.submitted_results)
          ? latestReq.submitted_results
          : (Array.isArray(latestReq.participant_results) ? latestReq.participant_results : []);
      } else if (regsData && regsData.length > 0) {
        rawResults = regsData;
      } else {
        rawResults = match.participants || [];
      }

      const resolvedList = rawResults.map((p: any, idx: number) => {
        const uId = (p.user_id || p.userId || p.userAuthUid || p.uid || p.id || '').toString().trim();
        const prof = profilesMap.get(uId.toLowerCase());
        const reg = (regsData || []).find(r => String(r.user_id).toLowerCase() === uId.toLowerCase());

        const gameIgn = isBgmi
          ? (prof?.bgmi_ign || prof?.bgmi_name || p.inGameName || p.gameIgn || p.ign || 'N/A')
          : (prof?.ff_ign || prof?.ff_name || p.inGameName || p.gameIgn || p.ign || 'N/A');

        const userName = prof?.name || prof?.full_name || prof?.display_name || prof?.username || p.username || p.name || 'Player';
        const userEmail = prof?.email || p.email || 'N/A';
        const userPhone = prof?.phone || p.phone || 'N/A';
        const slotNo = p.slotNumber || p.slot_number || p.slot || reg?.slot_number || (idx + 1);

        const curRank = Number(p.rank ?? p.rank_position ?? reg?.rank_position ?? (idx + 1));
        const curKills = Number(p.kills ?? reg?.kills ?? 0);
        const curWinnings = Number(p.prizeWon ?? p.winnings ?? reg?.winnings ?? 0);

        return {
          ...p,
          slotNumber: slotNo,
          userId: uId,
          user_id: uId,
          username: userName,
          email: userEmail,
          phone: userPhone,
          inGameId: prof?.bgmi_uid || prof?.ff_uid || p.inGameId || p.gameUid || 'N/A',
          inGameName: gameIgn,
          gameIgn: gameIgn,
          rank: curRank,
          kills: curKills,
          prizeWon: curWinnings
        };
      });

      setStatusState(currentStatus);
      setRejectionReason(latestReq?.review_note || latestReq?.rejection_reason || null);
      setParticipantResults(resolvedList);
    } catch (err) {
      console.error('[RESULT VERIFY] Error fetching tournament result state:', err);
    } finally {
      setLoading(false);
    }
  }, [match.id, match.participants, isBgmi]);

  useEffect(() => {
    loadDataFromSupabase();
  }, [loadDataFromSupabase]);

  const handleSubmit = async (isDirectPublish = false) => {
    if (isSubmitting) return;
    const hasResults = participantResults.some(p => (p.rank || 0) > 0 || (p.kills || 0) > 0 || (p.prizeWon || 0) > 0);
    if (!hasResults && !confirm('No ranks/kills entered. Submit result request?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const enriched = participantResults.map((p, idx) => {
        const details = resolveParticipantDetails(p, users, match);
        const slotNo = p.slotNumber || (idx + 1);
        const curRank = Number(p.rank || idx + 1);
        const curKills = Number(p.kills || 0);
        const rankPrize = getPrizeForRank(curRank, match.prizeDistribution || []);
        const perKillReward = match.perKillReward && !isNaN(Number(match.perKillReward)) ? Number(match.perKillReward) : 0;
        const calculatedTotal = rankPrize + (curKills * perKillReward);
        const finalPrizeWon = p.prizeWon !== undefined && p.prizeWon > 0 ? p.prizeWon : calculatedTotal;

        return {
          ...p,
          slotNumber: slotNo,
          userId: details.userAuthUid !== 'N/A' ? details.userAuthUid : (p.userId || p.user_id || p.uid || ''),
          email: details.email !== 'N/A' ? details.email : (p.email || ''),
          inGameId: details.gameUid !== 'N/A' ? details.gameUid : (p.inGameId || ''),
          inGameName: details.gameIgn !== 'N/A' ? details.gameIgn : (p.inGameName || p.gameIgn || ''),
          username: details.username || 'Player',
          rank: curRank,
          kills: curKills,
          prizeWon: finalPrizeWon
        };
      });

      if (isDirectPublish && onPublishMatchResults) {
        await onPublishMatchResults(match.id, enriched);
        alert('Match results published successfully!');
        onClose();
      } else if (onSubmitResultForVerification) {
        await onSubmitResultForVerification(match.id, enriched);
        await loadDataFromSupabase();
        alert('Match result submitted successfully! Pending Admin verification.');
      }
    } catch (e: any) {
      console.error('Submission failed', e);
      alert(`Submission failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-3 p-4 rounded-xl bg-[#141215] border border-[#29252A] text-center text-xs text-[#B0ACB0] flex items-center justify-center gap-2">
        <Clock className="w-4 h-4 animate-spin text-[#C9A34E]" />
        <span>Fetching live match result status from Supabase...</span>
      </div>
    );
  }

  const isPending = statusState === 'PENDING';
  const isApproved = statusState === 'APPROVED';
  const isRejected = statusState === 'REJECTED';

  return (
    <div className="mt-3 p-4 rounded-xl bg-[#141215] border border-[#29252A] space-y-3.5 max-h-[500px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-1">
      <div className="flex items-center justify-between border-b border-[#29252A] pb-2.5">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-[#C9A34E]" />
          <h4 className="text-xs font-black text-[#F5F5F5]">
            Match Result Verification
          </h4>
        </div>
        <button
          onClick={onClose}
          className="text-[#777278] hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isPending && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
          <div className="flex items-center justify-between font-extrabold text-[#C9A34E]">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#C9A34E]" /> RESULT SENT FOR VERIFICATION
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] uppercase font-black">PENDING REVIEW</span>
          </div>
          <p className="text-[11px] text-[#B0ACB0]">
            Staff submitted results for this match. It is currently PENDING Admin verification.
          </p>
        </div>
      )}

      {isApproved && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
          <div className="flex items-center justify-between font-extrabold text-emerald-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> RESULT APPROVED & PUBLISHED
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] uppercase font-black">APPROVED</span>
          </div>
          <p className="text-[11px] text-[#B0ACB0]">
            Match results were approved by Admin and officially published.
          </p>
        </div>
      )}

      {isRejected && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-extrabold text-rose-400">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" /> RESULT REJECTED BY ADMIN
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-[10px] uppercase font-black">REJECTED</span>
          </div>
          {rejectionReason && (
            <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-200">
              <span className="font-bold">Rejection Reason:</span> {rejectionReason}
            </div>
          )}
          <p className="text-[11px] text-[#B0ACB0]">
            Please review the rejection reason, correct the player ranks/kills below, and click <strong className="text-white">Resubmit for Admin Verification</strong>.
          </p>
        </div>
      )}

      {(!participantResults || participantResults.length === 0) ? (
        <div className="p-4 text-center rounded-xl bg-[#141215] text-[#777278] text-xs">
          No registered participants found for this match.
        </div>
      ) : (
        <div className="space-y-3">
          {participantResults.map((p, idx) => {
            const slotNo = p.slotNumber || (idx + 1);
            const userEmail = p.email || 'N/A';
            const gameIgn = p.inGameName || p.gameIgn || 'N/A';
            const username = p.username || p.displayName || 'Player';

            return (
              <div key={p.userId || p.user_id || idx} className="p-3 rounded-xl bg-[#141215] border border-[#29252A]/40 space-y-2.5 text-xs">
                <div className="flex items-center justify-between font-bold text-[#B0ACB0]">
                  <span className="text-[#C9A34E]">Slot #{slotNo} - {username}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#0D0B0D] p-2 rounded-lg border border-[#29252A]/40 text-[10px] text-[#B0ACB0]">
                  <div className="truncate"><span className="text-[#777278] font-bold mr-1">Email:</span><span className="text-white font-medium">{userEmail}</span></div>
                  <div className="truncate"><span className="text-[#777278] font-bold mr-1">IGN:</span><span className="text-[#C9A34E] font-extrabold">{gameIgn}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="block text-[8px] uppercase font-bold text-[#777278] mb-0.5">Rank</label>
                    <input
                      type="number"
                      min="1"
                      disabled={isPending || isApproved}
                      value={p.rank && !isNaN(Number(p.rank)) ? p.rank : idx + 1}
                      onChange={(e) => {
                        const updated = [...participantResults];
                        const rank = isNaN(Number(e.target.value)) ? idx + 1 : Number(e.target.value);
                        const kills = p.kills && !isNaN(Number(p.kills)) ? p.kills : 0;
                        const rankPrize = getPrizeForRank(rank, match.prizeDistribution || []);
                        const perKill = match.perKillReward && !isNaN(Number(match.perKillReward)) ? match.perKillReward : 0;
                        updated[idx] = { 
                          ...updated[idx], 
                          rank,
                          prizeWon: rankPrize + (kills * perKill)
                        };
                        setParticipantResults(updated);
                      }}
                      className="w-full bg-[#141215] text-white text-xs p-1.5 rounded-lg border border-[#29252A] focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase font-bold text-[#777278] mb-0.5">Kills</label>
                    <input
                      type="number"
                      min="0"
                      disabled={isPending || isApproved}
                      value={p.kills !== undefined && !isNaN(Number(p.kills)) ? p.kills : 0}
                      onChange={(e) => {
                        const updated = [...participantResults];
                        const kills = isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                        const rank = p.rank && !isNaN(Number(p.rank)) ? p.rank : idx + 1;
                        const rankPrize = getPrizeForRank(rank, match.prizeDistribution || []);
                        const perKill = match.perKillReward && !isNaN(Number(match.perKillReward)) ? match.perKillReward : 0;
                        updated[idx] = { 
                          ...updated[idx], 
                          kills, 
                          prizeWon: rankPrize + (kills * perKill)
                        };
                        setParticipantResults(updated);
                      }}
                      className="w-full bg-[#141215] text-white text-xs p-1.5 rounded-lg border border-[#29252A] focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase font-bold text-[#777278] mb-0.5">Prize Won (₹)</label>
                    <input
                      type="number"
                      min="0"
                      disabled={isPending || isApproved}
                      value={p.prizeWon !== undefined && !isNaN(Number(p.prizeWon)) ? p.prizeWon : 0}
                      onChange={(e) => {
                        const updated = [...participantResults];
                        updated[idx] = { ...updated[idx], prizeWon: isNaN(Number(e.target.value)) ? 0 : Number(e.target.value) };
                        setParticipantResults(updated);
                      }}
                      className="w-full bg-[#141215] text-[#C9A34E] font-bold text-xs p-1.5 rounded-lg border border-[#29252A] focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-[#29252A]">
        <div className="text-[10px] text-[#777278]">
          {isPending ? (
            <span className="text-[#C9A34E] font-bold flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#C9A34E]" /> Result is pending Admin review.
            </span>
          ) : isRejected ? (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> You can modify and resubmit the result.
            </span>
          ) : (
            <span className="text-[#B0ACB0]">
              Staff Mode: Submitting creates a result request for Admin verification.
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#B0ACB0] hover:text-white font-medium"
          >
            Close
          </button>

          {!isPending && !isApproved && onSubmitResultForVerification && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(false)}
              className="px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] bg-[#C9A34E] hover:bg-amber-400 text-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isRejected ? 'Resubmit for Admin Verification' : 'Submit for Admin Verification'}</span>
            </button>
          )}

          {currentUser?.role !== 'staff' && !isApproved && onPublishMatchResults && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit(true)}
              className="px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] bg-emerald-500 hover:bg-emerald-400 text-black shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span>Direct Publish</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const TournamentManagement: React.FC<TournamentManagementProps> = ({
  tournaments,
  categories = [],
  banners = [],
  matchRules = [],
  users = [],
  onAddBanner,
  onDeleteBanner,
  onCreateTournament,
  onUpdateTournament,
  onDeleteTournament,
  onReleaseRoomCredentials,
  onPublishMatchResults,
  onSubmitResultForVerification,
  onNavigateToResultRequests,
  onCancelMatchAndRefund,
  onSaveCategory,
  onDeleteCategory,
  onSaveMatchRule,
  onDeleteMatchRule,
  openCreateModalDirectly = false,
  savedImages = [],
  onNavigateToSavedImages,
  onRefresh
}) => {
  const { currentUser } = useAuth();
  const [filterGame, setFilterGame] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [matchSearchQuery, setMatchSearchQuery] = useState<string>('');

  // Admin View & Layout Mode Management
  const [displayView, setDisplayView] = useState<'compact' | 'table' | 'cards'>('compact');
  const [compactImageMode, setCompactImageMode] = useState<'side' | 'banner' | 'none'>('side');
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, { players?: boolean; prizes?: boolean }>>({});

  const toggleAccordion = (matchId: string, type: 'players' | 'prizes') => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [type]: !prev[matchId]?.[type]
      }
    }));
  };

  // Continuous synchronized ticker for dynamic schedule status evaluation without page refresh
  const [, setClockTick] = useState(0);
  useEffect(() => {
    return subscribeServerTimeTick(() => {
      setClockTick(prev => prev + 1);
    });
  }, []);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(openCreateModalDirectly);
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<MatchCategory | null>(null);

  // Category Form State
  const [catNameInput, setCatNameInput] = useState('');
  const [catDescInput, setCatDescInput] = useState('');
  const [catActiveInput, setCatActiveInput] = useState(true);

  // Inline forms & editing matches states
  const [activeReleaseRoomId, setActiveReleaseRoomId] = useState<string | null>(null);
  const [activePublishWinnersId, setActivePublishWinnersId] = useState<string | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [detailsModalTournament, setDetailsModalTournament] = useState<Tournament | null>(null);
  const [resultsListModalTournament, setResultsListModalTournament] = useState<Tournament | null>(null);
  const [isRefreshingResults, setIsRefreshingResults] = useState<boolean>(false);
  const [resultsSearchQuery, setResultsSearchQuery] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');

  const handleCopyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedText(val);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const [inputRoomId, setInputRoomId] = useState('');
  const [inputRoomPass, setInputRoomPass] = useState('');
  const [participantResults, setParticipantResults] = useState<Participant[]>([]);
  const [isRefreshingParticipants, setIsRefreshingParticipants] = useState(false);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [isSubmittingResults, setIsSubmittingResults] = useState<string | null>(null);
  const [isCancellingMatch, setIsCancellingMatch] = useState<string | null>(null);

  // Match management safety & duplicate modal states
  const [duplicatingTournament, setDuplicatingTournament] = useState<Tournament | null>(null);
  const [duplicateStartTime, setDuplicateStartTime] = useState<string>('');
  const [cancellingTournament, setCancellingTournament] = useState<Tournament | null>(null);
  const [deletingTournament, setDeletingTournament] = useState<Tournament | null>(null);
  const [expandedDangerZoneId, setExpandedDangerZoneId] = useState<string | null>(null);

  const handleOpenDuplicateModal = (match: Tournament) => {
    setDuplicatingTournament(match);
    const origDate = new Date(match.startTime);
    if (!isNaN(origDate.getTime()) && origDate.getTime() > Date.now()) {
      setDuplicateStartTime(formatForDateTimeLocal(match.startTime));
    } else {
      // Sensible default for upcoming time (next hour rounded to nearest 5 mins)
      const nextSlot = new Date(Date.now() + 60 * 60 * 1000);
      const y = nextSlot.getFullYear();
      const m = String(nextSlot.getMonth() + 1).padStart(2, '0');
      const d = String(nextSlot.getDate()).padStart(2, '0');
      const h = String(nextSlot.getHours()).padStart(2, '0');
      const min = String(Math.floor(nextSlot.getMinutes() / 5) * 5).padStart(2, '0');
      setDuplicateStartTime(`${y}-${m}-${d}T${h}:${min}`);
    }
  };

  const handleConfirmDuplicateMatch = () => {
    if (!duplicatingTournament) return;
    const match = duplicatingTournament;
    const selectedTime = duplicateStartTime || getCurrentLocalDateTimeString();
    const dtInfo = getMatchDateTimeStrings(selectedTime);

    // Access Code Determination:
    // If original is OFF: Duplicate is OFF + access_code NULL / ''
    // If original is ON: Duplicate is ON + BRAND NEW generated code. Original code is NEVER reused.
    const origRequiresCode = Boolean(
      match.requiresAccessCode ||
      (match as any).requires_access_code ||
      match.requireAccessCode ||
      (match as any).require_access_code ||
      ((match.accessCode || (match as any).access_code) && String(match.accessCode || (match as any).access_code).trim().length > 0)
    );

    const newGeneratedAccessCode = origRequiresCode
      ? ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())
      : '';

    const duplicatePayload: Omit<Tournament, 'id' | 'createdAt' | 'filledSlots' | 'participants'> = {
      title: match.title,
      game: match.game,
      category: match.category || match.game,
      categoryId: match.categoryId,
      bannerUrl: match.bannerUrl,
      thumbnailUrl: match.thumbnailUrl || match.bannerUrl,
      imageUrl: match.imageUrl || match.bannerUrl,
      cardImage: match.cardImage || match.bannerUrl,
      card_image: match.card_image || match.bannerUrl,
      savedImageId: match.savedImageId,
      matchType: match.matchType,
      map: match.map,
      entryFee: Number(match.entryFee || 0),
      prizePool: Number(match.prizePool || 0),
      perKillReward: Number(match.perKillReward ?? match.perKillPrize ?? 0),
      perKillPrize: Number(match.perKillReward ?? match.perKillPrize ?? 0),
      maxSlots: Number(match.maxSlots || match.maxParticipants || 48),
      maxParticipants: Number(match.maxSlots || match.maxParticipants || 48),
      startTime: selectedTime,
      match_time: selectedTime,
      matchSchedule: selectedTime,
      schedule: selectedTime,
      matchDate: dtInfo.matchDate,
      match_date: dtInfo.matchDate,
      dayOfWeek: dtInfo.dayOfWeek,
      formattedTime: dtInfo.formattedTime,
      status: 'upcoming',
      isFeatured: Boolean(match.isFeatured),
      requireAccessCode: origRequiresCode,
      requiresAccessCode: origRequiresCode,
      requires_access_code: origRequiresCode,
      require_access_code: origRequiresCode,
      isPrivate: origRequiresCode,
      is_private: origRequiresCode,
      accessCode: newGeneratedAccessCode,
      access_code: origRequiresCode ? newGeneratedAccessCode : undefined,
      roomId: '',
      roomPassword: '',
      isRoomReleased: false,
      results_published: false,
      rules: typeof match.rules === 'string' ? match.rules : (Array.isArray(match.rules) ? (match.rules as string[]).join('\n') : ''),
      prizeDistribution: match.prizeDistribution || [],
      organizer: match.organizer || 'WinX7 Official',
      tags: match.tags || [],
      version: '1.0',
      matchId: undefined,
      match_id: undefined
    };

    onCreateTournament(duplicatePayload);
    setDuplicatingTournament(null);
  };

  const handleRefreshModalParticipants = async (tournamentId: string) => {
    if (!tournamentId) return;
    setIsRefreshingParticipants(true);
    setParticipantError(null);
    try {
      const realParticipants = await getMatchParticipantsFromSupabase(tournamentId);
      if (realParticipants) {
        setDetailsModalTournament(prev => (prev && prev.id === tournamentId) ? {
          ...prev,
          participants: realParticipants,
          filledSlots: realParticipants.length,
          joinedParticipants: realParticipants.length
        } : prev);
      }
    } catch (err: any) {
      console.error('[TournamentManagement] Error refreshing participants:', err);
      setParticipantError(err?.message || 'Database error occurred while fetching participant list.');
    } finally {
      setIsRefreshingParticipants(false);
    }
  };

  const handleRefreshResultsList = async (tournamentId: string) => {
    if (!tournamentId) return;
    setIsRefreshingResults(true);
    try {
      const realParticipants = await getMatchParticipantsFromSupabase(tournamentId);
      if (realParticipants && realParticipants.length > 0) {
        setResultsListModalTournament(prev => (prev && prev.id === tournamentId) ? {
          ...prev,
          participants: realParticipants,
          filledSlots: realParticipants.length,
          joinedParticipants: realParticipants.length
        } : prev);
      }
    } catch (err: any) {
      console.warn('[TournamentManagement] Error refreshing results list:', err);
    } finally {
      setIsRefreshingResults(false);
    }
  };

  useEffect(() => {
    if (detailsModalTournament && detailsModalTournament.id) {
      handleRefreshModalParticipants(detailsModalTournament.id);
    }
  }, [detailsModalTournament?.id]);

  useEffect(() => {
    if (resultsListModalTournament && resultsListModalTournament.id) {
      handleRefreshResultsList(resultsListModalTournament.id);
    }
  }, [resultsListModalTournament?.id]);

  // Built-in Standard Match Rules Presets
  const BUILTIN_RULE_PRESETS: MatchRulesPreset[] = [
    {
      id: 'preset-ff-br-std',
      name: '🔥 Free Fire BR Standard Rules',
      createdAt: '',
      rules: `1. Hacks, scripts, emulators (without approval), or bugs exploitation strictly prohibited (instant DQ).
2. Room ID and Password will be provided 10-15 minutes prior to start time in the app.
3. Players must join their assigned slot/team. Joining wrong slots will result in kick.
4. Screenshots of final scoreboard with kills are mandatory for claiming results/prizes.
5. In-Game Name (IGN) must match registered account details exactly.`
    },
    {
      id: 'preset-bgmi-br-std',
      name: '🪖 BGMI Classic Battle Royale Rules',
      createdAt: '',
      rules: `1. Mode: Classic Battle Royale (TPP). Emulators strictly prohibited. Mobile devices and iPad only as per official BGMI competitive rules.
2. Room ID and Password will be provided 10-15 minutes prior to match schedule in the tournament tab.
3. Players must join their assigned slot / team numbers. Occupying another clan's slot will result in immediate kick.
4. Flare guns, red zone, and recall towers rules follow standard custom room settings.
5. Screenshot of the final match end screen showing rank and kills is mandatory for result validation.
6. Hacking, third-party plug-ins, teaming up, or exploiting glitches will lead to permanent disqualification.`
    },
    {
      id: 'preset-bgmi-tdm-4v4',
      name: '🔫 BGMI TDM Warehouse 4v4 Rules',
      createdAt: '',
      rules: `1. Mode: Team Deathmatch (TDM) 4v4 in Warehouse. Target Score: 40 kills.
2. Guns: All standard AR/SMG allowed. M24 / AWM / Shotguns / Grenades / RPG strictly forbidden unless agreed beforehand.
3. Slide: Allowed as per room settings. Level 2 armor & helmet standard.
4. Screen recording from at least one player in each team is mandatory for dispute resolution.
5. In case of tie, a 2-minute golden kill round will be hosted.`
    },
    {
      id: 'preset-ff-cs-4v4',
      name: '⚔️ Clash Squad 4v4 Rules',
      createdAt: '',
      rules: `1. Mode: Clash Squad 4v4. Gun attributes: OFF. Unlimited Ammo: OFF.
2. Character skills active. No character skill or loadout changes after room start.
3. Rematch only if server crashes or room bugged before Round 1 starts.
4. Video record or screenshots required for proof in case of disputes.
5. Abusive language in match chat or toxic behavior will lead to instant team disqualification.`
    },
    {
      id: 'preset-ff-solo-survival',
      name: '🏆 Solo Survival BR Rules',
      createdAt: '',
      rules: `1. Solo Battle Royale mode. Teaming up with enemies is strictly illegal (Instant Ban).
2. Minimum level 30 Free Fire ID required.
3. Players must maintain continuous recording or take screenshot of Booyah/Rank page.
4. Prize money will be credited within 30 minutes after result verification.`
    },
    {
      id: 'preset-ff-duo-squad',
      name: '🛡️ Duo / Squad Championship Rules',
      createdAt: '',
      rules: `1. All team members must register before slot closing.
2. Substitute players must be declared before room code release.
3. Points System: Booyah = 12 pts, 2nd = 9 pts, 3rd = 8 pts, 4th = 7 pts, Per Kill = 1 pt.
4. Final standings decided by overall cumulative points.`
    }
  ];

  // Rules Presets State
  const [editingRulePreset, setEditingRulePreset] = useState<MatchRulesPreset | null>(null);
  const [rulePresetName, setRulePresetName] = useState('');
  const [rulePresetText, setRulePresetText] = useState('');

  // Maps for Free Fire & BGMI
  const freeFireMaps: MapType[] = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra', 'Solitary', 'Bermuda Remastered', 'CS Arena', 'Iron Cage', 'Craftland'];
  const bgmiMaps: MapType[] = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa', 'Warehouse (TDM)', 'Hangar (TDM)', 'Ruins (TDM)'];

  // Modes for Free Fire & BGMI
  const freeFireModes: string[] = ['Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf', 'TDM', '2v2 Lone Wolf', '1v1', 'Guild War'];
  const bgmiModes: string[] = ['Solo', 'Duo', 'Squad', 'TDM', '4v4 TDM', '2v2 TDM', '1v1 TDM', 'Ultimate Royale'];

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Real Match Category Options (SURVIVOR, ARENA, LONE WOLF, etc.)
  const categoryOptions = useMemo(() => {
    const list = [...(categories || [])];
    // Filter out legacy accidental entries where GAME was stored as category
    const validCats = list.filter(c => {
      const n = c?.name?.toUpperCase() || '';
      return n !== 'FREE FIRE' && n !== 'FREEFIRE' && n !== 'BGMI' && !n.includes('BATTLEGROUND');
    });

    if (validCats.length === 0) {
      return initialCategories;
    }

    return validCats;
  }, [categories]);

  // New Match Form State
  const [formTitle, setFormTitle] = useState('');
  const [formGame, setFormGame] = useState<'FREE FIRE' | 'BGMI'>('FREE FIRE');
  const [formMatchCategory, setFormMatchCategory] = useState<string>('SURVIVOR');
  const [formSavedImageId, setFormSavedImageId] = useState<string>('');
  const [formBannerUrl, setFormBannerUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState<boolean>(false);
  const [imagePickerSearch, setImagePickerSearch] = useState<string>('');
  const [imagePickerGameFilter, setImagePickerGameFilter] = useState<'ALL' | 'FREE FIRE' | 'BGMI'>('ALL');

  // Helpers to detect active game
  const isBgmiSelected = formGame === 'BGMI';
  const isFreeFireSelected = formGame === 'FREE FIRE';

  const currentMapList = isBgmiSelected ? bgmiMaps : freeFireMaps;
  const currentModeList = isBgmiSelected ? bgmiModes : freeFireModes;

  // Handler to smoothly switch game with smart defaults
  const handleSelectGame = (gameChoice: 'FREE FIRE' | 'BGMI') => {
    console.log('[DEBUG TRACE 1] Game Category selector exact selected value:', gameChoice);
    setFormGame(gameChoice);

    if (gameChoice === 'BGMI') {
      if (freeFireMaps.some(m => m.toLowerCase() === formMap.toLowerCase()) || formMap === 'Bermuda' || !formMap) {
        setFormMap('Erangel');
      }
      if (formMaxSlots === 48 || !formMaxSlots) {
        setFormMaxSlots(100);
      }
      if (formMatchType === 'Clash Squad' || formMatchType === 'Lone Wolf' || formMatchType === '2v2 Lone Wolf' || formMatchType === 'Guild War') {
        setFormMatchType('Solo');
      }
      if (!formSavedImageId && (!formBannerUrl || formBannerUrl.includes('photo-1542751371') || formBannerUrl.includes('photo-1538481199'))) {
        setFormBannerUrl(getCategoryBannerImage('BGMI', categories));
      }
      if (BUILTIN_RULE_PRESETS.some(p => p.id.startsWith('preset-ff') && p.rules === formRules)) {
        const bgmiPreset = BUILTIN_RULE_PRESETS.find(p => p.id === 'preset-bgmi-br-std');
        if (bgmiPreset) {
          setSelectedRuleTemplateId(bgmiPreset.id);
          setFormRules(bgmiPreset.rules);
        }
      }
    } else {
      if (bgmiMaps.some(m => m.toLowerCase() === formMap.toLowerCase()) || formMap === 'Erangel' || !formMap) {
        setFormMap('Bermuda');
      }
      if (formMaxSlots === 100 || !formMaxSlots) {
        setFormMaxSlots(48);
      }
      if (formMatchType === '4v4 TDM' || formMatchType === '2v2 TDM' || formMatchType === '1v1 TDM' || formMatchType === 'Ultimate Royale') {
        setFormMatchType('Solo');
      }
      if (!formSavedImageId && (!formBannerUrl || formBannerUrl.includes('photo-1542751371') || formBannerUrl.includes('photo-1538481199'))) {
        setFormBannerUrl(getCategoryBannerImage('FREE FIRE', categories));
      }
      if (BUILTIN_RULE_PRESETS.some(p => p.id.startsWith('preset-bgmi') && p.rules === formRules)) {
        const ffPreset = BUILTIN_RULE_PRESETS.find(p => p.id === 'preset-ff-br-std');
        if (ffPreset) {
          setSelectedRuleTemplateId(ffPreset.id);
          setFormRules(ffPreset.rules);
        }
      }
    }
  };

  const handleSelectMatchCategory = (catName: string) => {
    setFormMatchCategory(catName);
    if (!formSavedImageId && (!formBannerUrl || formBannerUrl.includes('unsplash'))) {
      const banner = getCategoryBannerImage(catName, categories);
      if (banner) {
        setFormBannerUrl(banner);
      }
    }
  };

  const handleDirectTournamentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const cleanFileName = `tournament-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const uploadedUrl = await uploadToStorage('tournaments', file, cleanFileName);
      if (uploadedUrl) {
        setFormBannerUrl(uploadedUrl);
        setFormSavedImageId('');
      }
    } catch (err: any) {
      console.error('Tournament image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };
  const [formMatchType, setFormMatchType] = useState<MatchType | ''>('Solo');
  const [formMap, setFormMap] = useState<MapType>('Bermuda');
  const [formEntryFee, setFormEntryFee] = useState<number | ''>(0);
  const [formPrizePool, setFormPrizePool] = useState<number | ''>(0);
  const [formPerKillReward, setFormPerKillReward] = useState<number | ''>(0);
  const [formStartTime, setFormStartTime] = useState<string>('');
  const [formMaxSlots, setFormMaxSlots] = useState<number | ''>(48);
  const [formRequireAccessCode, setFormRequireAccessCode] = useState<boolean>(false);
  const [formAccessCode, setFormAccessCode] = useState('');
  const [formRules, setFormRules] = useState('');
  const [selectedRuleTemplateId, setSelectedRuleTemplateId] = useState<string>('');
  const [formPrizeDistribution, setFormPrizeDistribution] = useState<PrizeDistributionItem[]>([]);

  // Automatically synchronize formMatchCategory with active categoryOptions if empty or invalid
  useEffect(() => {
    if (categoryOptions && categoryOptions.length > 0) {
      const exists = categoryOptions.some(c => 
        c.name?.toUpperCase() === formMatchCategory?.toUpperCase() || 
        c.id === formMatchCategory
      );
      if (!formMatchCategory || !exists) {
        setFormMatchCategory(categoryOptions[0].name);
      }
    }
  }, [categoryOptions, formMatchCategory]);

  // Start Date & Time Live Synchronization State & Effect
  const [isTimeManual, setIsTimeManual] = useState(false);

  const getCurrentLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const formatForDateTimeLocal = (dateStr: string) => {
    if (!dateStr) return getCurrentLocalDateTimeString();
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr.length >= 16 ? dateStr.slice(0, 16) : getCurrentLocalDateTimeString();
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
      return getCurrentLocalDateTimeString();
    }
  };

  useEffect(() => {
    if (showCreateModal && !editingTournament && !isTimeManual) {
      setFormStartTime(getCurrentLocalDateTimeString());
    }
  }, [showCreateModal, editingTournament, isTimeManual]);
  // Filter logic
  const filteredTournaments = (tournaments || []).filter((t) => {
    if (!t) return false;

    // 0. Search Query filter (Match ID, Title, Map, Game, ID)
    if (matchSearchQuery.trim()) {
      const q = matchSearchQuery.trim().toLowerCase();
      const rawMatch = t.matchId || (t as any).match_id;
      const normalizedMatch = normalizePublicMatchId(rawMatch);
      const matchIdStr = (normalizedMatch || rawMatch || '').toLowerCase();
      const rawMatchStr = (rawMatch || '').toLowerCase();
      const titleStr = (t.title || '').toLowerCase();
      const idStr = (t.id || '').toLowerCase();
      const mapStr = (t.map || '').toLowerCase();
      const gameStr = (t.game || '').toLowerCase();
      const matchesSearch = matchIdStr.includes(q) || rawMatchStr.includes(q) || titleStr.includes(q) || idStr.includes(q) || mapStr.includes(q) || gameStr.includes(q);
      if (!matchesSearch) return false;
    }
    
    // 1. GAME filter
    const isTGameBgmi = 
      (t.game || '').toUpperCase() === 'BGMI' || 
      (t.game || '').toUpperCase().includes('BATTLEGROUND') || 
      (t.game || '').toUpperCase() === 'PUBG' ||
      (t.title || '').toUpperCase().includes('BGMI') ||
      (t.title || '').toUpperCase().includes('BATTLEGROUND') ||
      (t.title || '').toUpperCase().includes('PUBG') ||
      (t.category || '').toUpperCase() === 'BGMI' ||
      (t.matchCategory || '').toUpperCase() === 'BGMI' ||
      ((t as any).category_name || '').toUpperCase() === 'BGMI' ||
      ((t as any).game_name || '').toUpperCase() === 'BGMI' ||
      ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes((t.map || '').toUpperCase()) ||
      (t.matchType || '').toUpperCase().includes('TDM') ||
      (t.matchType || '').toUpperCase().includes('ULTIMATE ROYALE') ||
      Number(t.maxSlots || t.maxParticipants) === 100;
    const normalizedGame = isTGameBgmi ? 'BGMI' : (t.game || 'FREE FIRE').toUpperCase();
    
    let matchesGame = true;
    if (filterGame !== 'all') {
      const filterGameUpper = filterGame.toUpperCase();
      if (filterGameUpper === 'BGMI') {
        matchesGame = isTGameBgmi;
      } else if (filterGameUpper === 'FREE FIRE' || filterGameUpper === 'FREEFIRE') {
        matchesGame = !isTGameBgmi;
      } else {
        matchesGame = normalizedGame === filterGameUpper || (t.game || '').toUpperCase() === filterGameUpper;
      }
    }

    // 2. MATCH CATEGORY filter
    let matchesCategory = true;
    if (filterCategory !== 'all') {
      const tCat = (t.matchCategory || t.category || '').toUpperCase();
      matchesCategory = tCat === filterCategory.toUpperCase() || tCat.includes(filterCategory.toUpperCase());
    }

    // 3. MODE filter
    let matchesMode = true;
    if (filterMode !== 'all') {
      const tMode = (t.matchType || (t as any).mode || 'Solo').toUpperCase();
      const filterModeUpper = filterMode.toUpperCase();
      matchesMode = tMode === filterModeUpper || tMode.includes(filterModeUpper);
    }
    
    let tStatus = (t.status || '').toLowerCase();
    const isCompleted = tStatus === 'finished' || tStatus === 'completed' || (t as any).results_published === true || Boolean((t as any).completedAt || (t as any).completed_at);
    const isCancelled = tStatus === 'cancelled';

    if (!isCompleted && !isCancelled && (tStatus === 'upcoming' || tStatus === 'scheduled')) {
      const rawTime = t.startTime || t.matchTime || (t as any).start_time || (t as any).match_time;
      if (isMatchLiveBySchedule(rawTime, t.matchDate, (t as any).time)) {
        tStatus = 'live';
      }
    }

    let matchesStatus = false;
    if (filterStatus === 'all') {
      // Completed and cancelled matches must ONLY appear in their respective tabs
      matchesStatus = !isCompleted && !isCancelled;
    } else if (filterStatus === 'finished') {
      // Completed tab shows completed / finished / results published matches
      matchesStatus = isCompleted;
    } else if (filterStatus === 'cancelled') {
      matchesStatus = isCancelled;
    } else {
      // 'upcoming', 'live', etc.
      matchesStatus = tStatus === filterStatus.toLowerCase() && !isCompleted && !isCancelled;
    }

    return matchesGame && matchesCategory && matchesMode && matchesStatus;
  }).sort((a, b) => {
    if (filterStatus === 'finished') {
      const timeA = new Date(a.completedAt || (a as any).completed_at || (a as any).finishedAt || a.updatedAt || a.createdAt || a.startTime || 0).getTime();
      const timeB = new Date(b.completedAt || (b as any).completed_at || (b as any).finishedAt || b.updatedAt || b.createdAt || b.startTime || 0).getTime();
      return timeB - timeA; // Newest completedAt first
    }
    const rawTimeA = a.startTime || a.matchTime || (a as any).start_time || (a as any).match_time;
    const rawTimeB = b.startTime || b.matchTime || (b as any).start_time || (b as any).match_time;
    const timeA = parseMatchStartTimeMs(rawTimeA, a.matchDate || (a as any).match_date) || new Date(a.createdAt || 0).getTime();
    const timeB = parseMatchStartTimeMs(rawTimeB, b.matchDate || (b as any).match_date) || new Date(b.createdAt || 0).getTime();
    return timeB - timeA; // Latest timing match at top
  });



  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeCategories = categoryOptions;
    let selectedCatObj = activeCategories.find(c => 
      c.name.toUpperCase() === formMatchCategory.toUpperCase() || 
      c.id === formMatchCategory
    );

    const matchCategoryName = (formMatchCategory || (selectedCatObj ? selectedCatObj.name : 'SURVIVOR')).toUpperCase();
    const catId = selectedCatObj ? selectedCatObj.id : `cat-${matchCategoryName.toLowerCase().replace(/\s+/g, '-')}`;
    const isBgmiFormSignal = 
      formGame === 'BGMI' || 
      (formTitle || '').toUpperCase().includes('BGMI') ||
      (formTitle || '').toUpperCase().includes('BATTLEGROUND') ||
      (formTitle || '').toUpperCase().includes('PUBG') ||
      (formMatchCategory || '').toUpperCase() === 'BGMI' ||
      ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes(((formMap || '') as string).toUpperCase()) ||
      (formMatchType || '').toUpperCase().includes('TDM') ||
      (formMatchType || '').toUpperCase().includes('ULTIMATE ROYALE') ||
      Number(formMaxSlots) === 100;

    const gameChoice: GameCategory = isBgmiFormSignal ? 'BGMI' : formGame;
    const finalFormat = formMatchType || 'Solo';
    const selectedMap = (formMap && formMap.trim()) ? formMap.trim() : (gameChoice === 'BGMI' ? 'Erangel' : 'Bermuda');

    const pkr = Number(formPerKillReward || 0);
    let finalPrizeDist = [...formPrizeDistribution];
    
    // Auto-inject Per Kill reward into the array if it exists and isn't already there
    // This ensures the visual UI representation exactly matches the saved array for the User App
    if (pkr > 0) {
      const hasKill = finalPrizeDist.some(p => String(p.rankRange || '').toLowerCase().includes('kill'));
      if (!hasKill) {
        finalPrizeDist.push({ rankRange: 'Per Kill', prize: pkr });
      }
    }

    const defaultCategoryBanner = getCategoryBannerImage(matchCategoryName, categories) || getCategoryBannerImage(gameChoice, categories);
    const finalBannerUrl = (formBannerUrl && formBannerUrl.trim()) ? formBannerUrl.trim() : defaultCategoryBanner;
    const finalSavedImageId = formSavedImageId || undefined;

    const finalRequireAccessCode = Boolean(formRequireAccessCode);
    const finalAccessCode = finalRequireAccessCode
      ? ((formAccessCode && formAccessCode.trim()) ? formAccessCode.trim() : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase()))
      : '';

    const selectedStartTime = formStartTime || getCurrentLocalDateTimeString();
    const dtInfo = getMatchDateTimeStrings(selectedStartTime);

    console.log('[DEBUG TRACE 2] Tournament model before save gameCategory:', gameChoice);

    if (editingTournament) {
      try {
        await onUpdateTournament({
          ...editingTournament,
          title: (formTitle || 'UNTITLED MATCH').toUpperCase(),
          game: gameChoice,
          gameCategory: gameChoice,
          game_category: gameChoice,
          category: matchCategoryName as any,
          matchCategory: matchCategoryName,
          categoryId: catId,
          bannerUrl: finalBannerUrl,
          savedImageId: finalSavedImageId,
          matchType: finalFormat as MatchType,
          map: selectedMap as MapType,
          entryFee: Number(formEntryFee || 0),
          prizePool: Number(formPrizePool || 0),
          perKillReward: pkr,
          perKillPrize: pkr,
          startTime: selectedStartTime,
          match_time: selectedStartTime,
          matchSchedule: selectedStartTime,
          schedule: selectedStartTime,
          matchDate: dtInfo.matchDate,
          match_date: dtInfo.matchDate,
          dayOfWeek: dtInfo.dayOfWeek,
          formattedTime: dtInfo.formattedTime,
          maxSlots: Number(formMaxSlots || (gameChoice === 'BGMI' ? 100 : 48)),
          requireAccessCode: finalRequireAccessCode,
          requiresAccessCode: finalRequireAccessCode,
          requires_access_code: finalRequireAccessCode,
          require_access_code: finalRequireAccessCode,
          accessCode: finalAccessCode,
          access_code: finalAccessCode,
          rules: formRules,
          prizeDistribution: finalPrizeDist
        });
        setEditingTournament(null);
        setShowCreateModal(false);
      } catch (updateErr) {
        console.error('[Tournament Edit Failed]:', updateErr);
      }
    } else {
      try {
        await onCreateTournament({
          title: (formTitle || 'NEW MATCH').toUpperCase(),
          game: gameChoice,
          gameCategory: gameChoice,
          game_category: gameChoice,
          category: matchCategoryName as any,
          matchCategory: matchCategoryName,
          categoryId: catId,
          bannerUrl: finalBannerUrl,
          savedImageId: finalSavedImageId,
          matchType: finalFormat as MatchType,
          map: selectedMap as MapType,
          entryFee: Number(formEntryFee || 0),
          prizePool: Number(formPrizePool || 0),
          perKillReward: pkr,
          perKillPrize: pkr,
          startTime: selectedStartTime,
          match_time: selectedStartTime,
          matchSchedule: selectedStartTime,
          schedule: selectedStartTime,
          matchDate: dtInfo.matchDate,
          match_date: dtInfo.matchDate,
          dayOfWeek: dtInfo.dayOfWeek,
          formattedTime: dtInfo.formattedTime,
          maxSlots: Number(formMaxSlots || (gameChoice === 'BGMI' ? 100 : 48)),
          requireAccessCode: finalRequireAccessCode,
          requiresAccessCode: finalRequireAccessCode,
          requires_access_code: finalRequireAccessCode,
          require_access_code: finalRequireAccessCode,
          accessCode: finalAccessCode,
          access_code: finalAccessCode,
          status: 'upcoming',
          isRoomReleased: false,
          rules: formRules,
          prizeDistribution: finalPrizeDist
        });
        setShowCreateModal(false);
      } catch (createErr) {
        console.error('[Tournament Creation Failed - Modal kept open for retry]:', createErr);
      }
    }
  };

  const handleOpenEditModal = (match: Tournament) => {
    setEditingTournament(match);
    setFormTitle(match.title);
    const hasCode = Boolean(
      match.requireAccessCode ??
      match.requiresAccessCode ??
      match.requires_access_code ??
      match.require_access_code ??
      ((match.accessCode || (match as any).access_code) && String(match.accessCode || (match as any).access_code).trim().length > 0)
    );
    setFormRequireAccessCode(hasCode);
    setFormAccessCode(match.accessCode || (match as any).access_code || '');

    // Properly derive GAME with multi-signal detection
    const isBgmi = 
      (match.game || '').toUpperCase() === 'BGMI' || 
      (match.game || '').toUpperCase().includes('BATTLEGROUND') || 
      (match.game || '').toUpperCase() === 'PUBG' ||
      (match.title && match.title.toUpperCase().includes('BGMI')) ||
      (match.title && match.title.toUpperCase().includes('BATTLEGROUND')) ||
      (match.title && match.title.toUpperCase().includes('PUBG')) ||
      (match.category || '').toUpperCase() === 'BGMI' ||
      (match.matchCategory || '').toUpperCase() === 'BGMI' ||
      ((match as any).category_name || '').toUpperCase() === 'BGMI' ||
      ((match as any).game_name || '').toUpperCase() === 'BGMI' ||
      ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes((match.map || '').toUpperCase()) ||
      (match.matchType || '').toUpperCase().includes('TDM') ||
      (match.matchType || '').toUpperCase().includes('ULTIMATE ROYALE') ||
      Number(match.maxSlots) === 100;
    setFormGame(isBgmi ? 'BGMI' : 'FREE FIRE');

    // Properly derive MATCH CATEGORY
    let initialCat = match.matchCategory || match.category || 'SURVIVOR';
    if (initialCat.toUpperCase() === 'FREE FIRE' || initialCat.toUpperCase() === 'FREEFIRE' || initialCat.toUpperCase() === 'BGMI' || initialCat.toUpperCase().includes('BATTLEGROUND')) {
      const modeUpper = String(match.matchType || (match as any).mode || '').toUpperCase();
      if (modeUpper.includes('LONE WOLF') || modeUpper.includes('1 VS 1') || modeUpper.includes('2 VS 2')) {
        initialCat = 'LONE WOLF';
      } else if (modeUpper.includes('ARENA') || modeUpper.includes('TDM') || modeUpper.includes('CLASH SQUAD') || modeUpper.includes('4 VS 4')) {
        initialCat = 'ARENA';
      } else {
        initialCat = 'SURVIVOR';
      }
    }
    setFormMatchCategory(initialCat.toUpperCase());

    setFormSavedImageId(match.savedImageId || '');
    const currentImg = match.bannerUrl || (match as any).imageUrl || (match as any).card_image || (match as any).thumbnailUrl || (match as any).banner || '';
    setFormBannerUrl(currentImg);

    // Properly derive MODE (guard against corrupted mode values like 'FREE FIRE' or 'BGMI')
    let rawMode = match.matchType || (match as any).mode || 'Solo';
    if (rawMode.toUpperCase() === 'FREE FIRE' || rawMode.toUpperCase() === 'FREEFIRE' || rawMode.toUpperCase() === 'BGMI') {
      rawMode = 'Solo';
    }
    setFormMatchType(rawMode as MatchType);

    // Properly derive MAP
    let rawMap = match.map;
    if (!rawMap || rawMap.trim() === '') {
      rawMap = isBgmi ? 'Erangel' : 'Bermuda';
    }
    setFormMap(rawMap as MapType);

    setFormEntryFee(match.entryFee);
    setFormPrizePool(match.prizePool);
    setFormPerKillReward(match.perKillReward);
    setFormStartTime(formatForDateTimeLocal(match.startTime));
    setFormMaxSlots(match.maxSlots || (isBgmi ? 100 : 48));
    setFormRules(match.rules);
    const allPresets = [...BUILTIN_RULE_PRESETS, ...(matchRules || [])];
    const matchedPreset = allPresets.find(p => p.rules.trim() === (match.rules || '').trim());
    setSelectedRuleTemplateId(matchedPreset ? matchedPreset.id : '');
    setFormPrizeDistribution(match.prizeDistribution || []);
    setShowCreateModal(true);
  };

  const handleSaveCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim()) return;

    const sortVal = editingCategory?.sortOrder ?? editingCategory?.displayOrder ?? editingCategory?.order ?? (categories.length + 1);

    const catNameUpper = catNameInput.trim().toUpperCase();
    const catImage = getCategoryBannerImage(catNameUpper);

    const newCategory: MatchCategory = {
      id: editingCategory ? editingCategory.id : `cat-${Date.now()}`,
      name: catNameUpper,
      description: catDescInput.trim() || `${catNameUpper} Match Category`,
      isActive: catActiveInput,
      imageUrl: editingCategory?.imageUrl || catImage,
      bannerUrl: editingCategory?.bannerUrl || catImage,
      sortOrder: sortVal,
      displayOrder: sortVal,
      order: sortVal,
      createdAt: editingCategory?.createdAt || new Date().toISOString()
    };

    if (onSaveCategory) {
      onSaveCategory(newCategory);
    }
    setCatNameInput('');
    setCatDescInput('');
    setEditingCategory(null);
  };

  const handleStartEditCategory = (cat: MatchCategory) => {
    setEditingCategory(cat);
    setCatNameInput(cat.name);
    setCatDescInput(cat.description || '');
    setCatActiveInput(cat.isActive);
  };

  const formatStartTime = (startTimeStr: string) => {
    if (!startTimeStr) return 'TBD';
    const start = new Date(startTimeStr);
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    
    // Format actual date/time: e.g. "03 Aug, 9:00 PM"
    let dateStr = '';
    try {
      const datePart = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short'
      }).format(start);

      const timePart = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(start);

      dateStr = `${datePart}, ${timePart}`;
    } catch (e) {
      dateStr = startTimeStr;
    }

    let relativeStr = '';
    if (diffMs <= 0) {
      relativeStr = 'Live / Started';
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 60) {
        relativeStr = `Starts in ${diffMinutes}m`;
      } else {
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
        if (diffHours < 24) {
          relativeStr = `Starts in ${diffHours}h`;
        } else {
          const diffDays = Math.floor(diffHours / 24);
          relativeStr = `Starts in ${diffDays}d`;
        }
      }
    }
    
    return `${dateStr} (${relativeStr})`;
  };

  return (
    <div className="space-y-5 animate-in fade-in pb-16 md:pb-6">
      
      {/* Visual Identity Title & Quick Actions Header Block */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#141215] border border-[#29252A]/30 shadow-xl">
        {/* Top-Left Logo / Brand info */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 via-[#1C1540] to-[#C9A34E] p-[1.5px] shadow-lg flex items-center justify-center">
            <div className="w-full h-full bg-[#0D0B0D] rounded-full flex items-center justify-center font-black text-[#C9A34E] text-lg">
              X
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 font-sans uppercase">
                WIN X7
              </span>
            </div>
            <p className="text-[10px] text-[#C9A34E]/90 font-black tracking-widest uppercase -mt-0.5">
              Admin Portal
            </p>
          </div>
        </div>

        {/* Top-Right Action: Create Match */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] font-bold text-xs transition active:scale-95"
          >
            <Tag className="w-4 h-4 text-[#C9A34E]" />
            <span>Categories ({(categories || []).length})</span>
          </button>

          <button
            id="admin-create-match-btn"
            onClick={() => {
              setEditingTournament(null);
              setFormTitle('');
              const isFilterBgmi = filterGame && filterGame !== 'all' && (
                filterGame.toUpperCase() === 'BGMI' || 
                filterGame.toUpperCase().includes('BATTLEGROUND') || 
                filterGame.toUpperCase() === 'PUBG'
              );
              const initialGame = isFilterBgmi ? 'BGMI' : 'FREE FIRE';
              setFormGame(initialGame);
              setFormMatchType('Solo');
              setFormMap(initialGame === 'BGMI' ? 'Erangel' : 'Bermuda');
              setFormEntryFee(0);
              setFormPrizePool(0);
              setFormPerKillReward(0);
              setFormStartTime(getCurrentLocalDateTimeString());
              setFormMaxSlots(initialGame === 'BGMI' ? 100 : 48);
              setFormRequireAccessCode(false);
              setFormAccessCode('');
              const matchedPreset = initialGame === 'BGMI'
                ? (BUILTIN_RULE_PRESETS.find(p => p.id === 'preset-bgmi-br-std') || BUILTIN_RULE_PRESETS[0])
                : (BUILTIN_RULE_PRESETS.find(p => p.id === 'preset-ff-br-std') || BUILTIN_RULE_PRESETS[0]);
              setSelectedRuleTemplateId(matchedPreset.id);
              setFormRules(matchedPreset.rules);
              setFormPrizeDistribution([]);
              setFormSavedImageId('');
              setFormBannerUrl(getCategoryBannerImage(initialGame, categories));
              setIsTimeManual(false); // Reset to false to start live syncing!
              setShowCreateModal(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[#C9A34E] hover:bg-amber-400 text-black font-black text-xs sm:text-xs transition shadow-lg shadow-amber-500/10 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Match</span>
          </button>
        </div>
      </div>

      {/* Main Status Navigation Tabs (Slick Bottom-Line Active State) */}
      <div className="flex items-center gap-6 border-b border-[#29252A]/40 pb-2 overflow-x-auto custom-scrollbar">
        {['all', 'upcoming', 'live', 'finished', 'cancelled', 'rules'].map((st) => {
          const label = st === 'all' ? 'All' : st === 'finished' ? 'Completed' : st === 'rules' ? 'Rules Presets' : st.charAt(0).toUpperCase() + st.slice(1);
          const isActive = filterStatus === st;
          return (
            <button
              key={st}
              onClick={() => {
                setFilterStatus(st);
                setActiveReleaseRoomId(null);
                setActivePublishWinnersId(null);
              }}
              className={`pb-1 pb-1 text-[11px] font-extrabold tracking-wide uppercase transition-all duration-200 border-b-2 whitespace-nowrap ${
                isActive
                  ? 'text-[#C9A34E] border-[#C9A34E]'
                  : 'text-[#B0ACB0]/60 border-transparent hover:text-[#F5F5F5]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filter Section: CATEGORY, GAME & MODE (Clearly separated) - Only visible if not on Rules Presets tab */}
      {filterStatus !== 'rules' && (
        <div className="space-y-2 pb-1 pt-0.5">
          {/* Match Search & View Switcher Toolbar */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 pb-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777278]" />
              <input
                type="text"
                value={matchSearchQuery}
                onChange={(e) => setMatchSearchQuery(e.target.value)}
                placeholder="Search by Match ID (e.g. WX7-1309-001) or title..."
                className="w-full bg-[#141215] text-white text-xs pl-8 pr-7 py-2 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E] placeholder:text-[#777278] transition shadow-inner"
              />
              {matchSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMatchSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777278] hover:text-white text-xs font-bold"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* View Mode Switcher & Image Density Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* View Selector Segmented Control */}
              <div className="flex items-center gap-1 bg-[#141215] p-1 rounded-xl border border-[#29252A]">
                <button
                  type="button"
                  onClick={() => setDisplayView('compact')}
                  className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
                    displayView === 'compact'
                      ? 'bg-[#C9A34E] text-black shadow-sm font-black'
                      : 'text-[#B0ACB0] hover:text-white'
                  }`}
                  title="Compact Admin Cards (Scannable, Collapsible Lists)"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Compact Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayView('table')}
                  className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
                    displayView === 'table'
                      ? 'bg-[#C9A34E] text-black shadow-sm font-black'
                      : 'text-[#B0ACB0] hover:text-white'
                  }`}
                  title="Admin Data Table (High-Density B2B List)"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Admin Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayView('cards')}
                  className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition flex items-center gap-1.5 ${
                    displayView === 'cards'
                      ? 'bg-[#C9A34E] text-black shadow-sm font-black'
                      : 'text-[#B0ACB0] hover:text-white'
                  }`}
                  title="Hero Artwork Grid"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hero Cards</span>
                </button>
              </div>

              {/* Image Mode Selector (only when in compact view) */}
              {displayView === 'compact' && (
                <div className="flex items-center gap-1 bg-[#141215] p-1 rounded-xl border border-[#29252A]">
                  <span className="text-[9px] font-black text-[#777278] uppercase px-1 hidden md:inline">IMAGE:</span>
                  <button
                    type="button"
                    onClick={() => setCompactImageMode('side')}
                    className={`px-2 py-1 rounded text-[9.5px] font-bold transition ${
                      compactImageMode === 'side' ? 'bg-[#29252A] text-white font-black' : 'text-[#777278] hover:text-[#B0ACB0]'
                    }`}
                    title="Side Thumbnail Image"
                  >
                    Thumbnail
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompactImageMode('banner')}
                    className={`px-2 py-1 rounded text-[9.5px] font-bold transition ${
                      compactImageMode === 'banner' ? 'bg-[#29252A] text-white font-black' : 'text-[#777278] hover:text-[#B0ACB0]'
                    }`}
                    title="Header Banner"
                  >
                    Banner
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompactImageMode('none')}
                    className={`px-2 py-1 rounded text-[9.5px] font-bold transition ${
                      compactImageMode === 'none' ? 'bg-[#29252A] text-white font-black' : 'text-[#777278] hover:text-[#B0ACB0]'
                    }`}
                    title="Hide Images for Max Density"
                  >
                    No Image
                  </button>
                </div>
              )}

              {matchSearchQuery && (
                <div className="text-[11px] text-[#B0ACB0] flex items-center gap-1.5">
                  <span>Showing: <strong className="text-amber-400 font-bold">{filteredTournaments.length}</strong></span>
                  <button
                    type="button"
                    onClick={() => setMatchSearchQuery('')}
                    className="text-xs text-amber-400/80 hover:text-amber-300 underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171418] hover:bg-[#201C22] text-xs text-[#B0ACB0] hover:text-white border border-[#29252A] rounded-xl font-bold transition shadow-sm"
                  title="Refresh matches from Supabase"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 1: MATCH CATEGORY Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
            <span className="text-[10px] font-black uppercase text-[#C9A34E] shrink-0 tracking-wider">CATEGORY:</span>
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                filterCategory === 'all'
                  ? 'bg-[#C9A34E] text-black shadow-md font-black'
                  : 'text-[#B0ACB0] hover:text-white bg-[#141215]/60 border border-[#29252A]/30'
              }`}
            >
              ALL CATEGORIES
            </button>
            {categoryOptions
              .filter(c => c && c.isActive && c.name?.toUpperCase() !== 'ALL MATCHES' && c.name?.toUpperCase() !== 'ALL')
              .map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.name)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                  filterCategory.toUpperCase() === cat.name.toUpperCase()
                    ? 'bg-[#C9A34E] text-black shadow-md font-black'
                    : 'text-[#B0ACB0] hover:text-white bg-[#141215]/60 border border-[#29252A]/30'
                }`}
              >
                {cat.name}
              </button>
            ))}

            {/* Category Edit Pill Trigger */}
            <button
              onClick={() => {
                setEditingCategory(null);
                setCatNameInput('');
                setCatDescInput('');
                setCatActiveInput(true);
                setShowCategoryModal(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase text-[#C9A34E] bg-[#0D0B0D] hover:bg-[#141215] border border-[#29252A] transition flex-shrink-0 ml-auto"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#C9A34E]" />
              <span>Edit Categories</span>
            </button>
          </div>

          {/* Row 2: GAME Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
            <span className="text-[10px] font-black uppercase text-[#777278] shrink-0 tracking-wider">GAME:</span>
            <button
              onClick={() => setFilterGame('all')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                filterGame === 'all'
                  ? 'bg-white text-black shadow-md font-black'
                  : 'text-[#B0ACB0] hover:text-white bg-[#141215]/60 border border-[#29252A]/30'
              }`}
            >
              ALL GAMES
            </button>
            <button
              onClick={() => setFilterGame('FREE FIRE')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                filterGame.toUpperCase() === 'FREE FIRE' || filterGame.toUpperCase() === 'FREEFIRE'
                  ? 'bg-[#FF3048] text-white shadow-md font-black'
                  : 'text-[#B0ACB0] hover:text-white bg-[#141215]/60 border border-[#29252A]/30'
              }`}
            >
              FREE FIRE
            </button>
            <button
              onClick={() => setFilterGame('BGMI')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                filterGame.toUpperCase() === 'BGMI'
                  ? 'bg-emerald-500 text-black shadow-md font-black'
                  : 'text-[#B0ACB0] hover:text-white bg-[#141215]/60 border border-[#29252A]/30'
              }`}
            >
              BGMI
            </button>
          </div>

          {/* Row 3: MODE Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            <span className="text-[10px] font-black uppercase text-[#777278] shrink-0 tracking-wider">MODE:</span>
            {['all', 'Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf', 'TDM'].map((m) => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                className={`px-2 py-0.5 rounded-lg text-[9px] font-black whitespace-nowrap uppercase tracking-wider transition ${
                  filterMode === m
                    ? 'bg-[#C9A34E]/20 text-[#C9A34E] border border-[#C9A34E]/50 shadow-sm'
                    : 'text-[#777278] hover:text-[#B0ACB0] bg-[#0D0B0D]/40 border border-transparent'
                }`}
              >
                {m === 'all' ? 'ALL MODES' : m}
              </button>
            ))}
          </div>
        </div>
      )}

      {filterStatus === 'rules' ? (
        <div className="space-y-6">
          <div className="bg-[#141215]/60 border border-[#29252A]/30 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-white text-sm tracking-wide uppercase">
                  {editingRulePreset ? '✏️ Edit Rules Preset' : '✨ Create New Rules Preset'}
                </h3>
                <p className="text-[10px] sm:text-xs text-[#B0ACB0] leading-relaxed mt-0.5">
                  Save templates of rules for different match modes so you can select them with 1-click while hosting new tournaments.
                </p>
              </div>
              {editingRulePreset && (
                <button
                  onClick={() => {
                    setEditingRulePreset(null);
                    setRulePresetName('');
                    setRulePresetText('');
                  }}
                  className="px-3 py-1 bg-[#141215] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white text-[10px] font-bold rounded-lg transition"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!rulePresetName.trim() || !rulePresetText.trim()) return;
                if (onSaveMatchRule) {
                  onSaveMatchRule({
                    id: editingRulePreset ? editingRulePreset.id : `rule-${Date.now()}`,
                    name: rulePresetName.trim(),
                    rules: rulePresetText.trim()
                  });
                }
                setRulePresetName('');
                setRulePresetText('');
                setEditingRulePreset(null);
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                  Preset Name / Category
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Clash Squad 4v4 Official, Classic Solo Survival"
                  value={rulePresetName}
                  onChange={(e) => setRulePresetName(e.target.value)}
                  className="w-full bg-[#141215] text-white text-xs p-2.5 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                  Rules Content
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Official Match Rules:&#10;1. Emulator not allowed.&#10;2. PC or tablet not allowed.&#10;3. No teaming/hacking allowed. Violators will be banned."
                  value={rulePresetText}
                  onChange={(e) => setRulePresetText(e.target.value)}
                  className="w-full bg-[#141215] text-white text-xs p-2.5 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#C9A34E] hover:bg-amber-400 text-black font-black text-xs transition shadow-lg shadow-amber-500/10 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingRulePreset ? 'Update Preset' : 'Save Preset'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Saved Rules List */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs text-[#B0ACB0] uppercase tracking-widest px-1">
              Saved Rules Templates ({matchRules.length})
            </h4>

            {matchRules.length === 0 ? (
              <div className="p-8 text-center bg-[#171418]/40 border border-dashed border-[#29252A]/30 rounded-2xl text-[#777278] text-xs">
                No rules presets saved yet. Create your first preset above to use it during match hosting.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchRules.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-[#141215]/80 border border-[#29252A]/30 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-[#29252A] animate-in fade-in duration-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-[#29252A]/40 pb-1.5 mb-2">
                        <span className="font-extrabold text-[#C9A34E] text-xs truncate max-w-[70%] uppercase">
                          {preset.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingRulePreset(preset);
                              setRulePresetName(preset.name);
                              setRulePresetText(preset.rules);
                            }}
                            className="p-1 rounded bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white transition"
                            title="Edit Preset"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {onDeleteMatchRule && (
                            <button
                              onClick={() => onDeleteMatchRule(preset.id)}
                              className="p-1 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
                              title="Delete Preset"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-[#B0ACB0] whitespace-pre-wrap leading-relaxed">
                        {preset.rules}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tournaments Match List - Multi-Mode Admin View (Compact Cards / Data Table / Hero Artwork Grid) */
        tournaments.length === 0 ? (
          <div className="p-12 text-center bg-[#171418] rounded-2xl border border-[#29252A]/30 text-[#777278] text-xs">
            No tournaments available. Create your first tournament.
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="p-12 text-center bg-[#171418] rounded-2xl border border-[#29252A]/30 text-[#777278] text-xs">
            No tournament matches found in the selected category or filter.
          </div>
        ) : displayView === 'table' ? (
          /* High-Density Admin Data Table Mode */
          <div className="overflow-x-auto rounded-2xl border border-[#29252A] bg-[#141215] shadow-xl">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-[#171418] border-b border-[#29252A] text-[#777278] text-[10px] font-black uppercase tracking-wider">
                  <th className="p-3 pl-4">Match ID & Title</th>
                  <th className="p-3">Game / Format</th>
                  <th className="p-3">Schedule & Map</th>
                  <th className="p-3">Entry & Prize</th>
                  <th className="p-3">Slots Joined</th>
                  <th className="p-3">Credentials</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#29252A]/30 text-[#F5F5F5]">
                {filteredTournaments.map((match) => {
                  const displayMatchId = normalizePublicMatchId(match.matchId || (match as any).match_id) || match.matchId || (match as any).match_id;
                  const isCopied = copiedText === displayMatchId;
                  const isMatchBgmi = 
                    (match.game || '').toUpperCase() === 'BGMI' || 
                    (match.game || '').toUpperCase().includes('BATTLEGROUND') || 
                    (match.game || '').toUpperCase() === 'PUBG' ||
                    (match.title || '').toUpperCase().includes('BGMI') ||
                    (match.category || '').toUpperCase() === 'BGMI' ||
                    ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK'].includes((match.map || '').toUpperCase());
                  const gameName = isMatchBgmi ? 'BGMI' : (match.game || 'FREE FIRE');
                  const modeName = (match.matchType && match.matchType.toUpperCase() !== 'FREE FIRE' && match.matchType.toUpperCase() !== 'BGMI')
                    ? match.matchType
                    : ((match as any).mode || 'Solo');
                  const mapName = match.map || (isMatchBgmi ? 'Erangel' : 'Bermuda');
                  const totalSlots = match.maxSlots || (isMatchBgmi ? 100 : 48);
                  const slotsRemaining = Math.max(0, totalSlots - (match.filledSlots || 0));
                  const percentFilled = Math.min(100, Math.max(0, (match.filledSlots / (totalSlots || 1)) * 100));

                  const s = (match.status || '').toLowerCase();
                  const isCompleted = s === 'finished' || s === 'completed' || (match as any).results_published || Boolean((match as any).completedAt || (match as any).completed_at);
                  const isCancelled = s === 'cancelled';
                  const rawTime = match.startTime || match.matchTime || (match as any).start_time || (match as any).match_time;
                  const isLiveScheduled = isMatchLiveBySchedule(rawTime, match.matchDate, (match as any).time);
                  const effectiveStatus = isCompleted ? 'completed' : isCancelled ? 'cancelled' : (s === 'live' || isLiveScheduled) ? 'live' : 'upcoming';

                  return (
                    <React.Fragment key={match.id}>
                      <tr className="hover:bg-[#1A171D] transition-colors group">
                        {/* Match ID & Title */}
                        <td className="p-3 pl-4">
                          <div className="flex flex-col gap-0.5 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded tracking-wider select-all shrink-0">
                                {displayMatchId || 'N/A'}
                              </span>
                              {displayMatchId && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(displayMatchId)}
                                  className="text-[#777278] hover:text-amber-300 p-0.5 transition"
                                  title="Copy Match ID"
                                >
                                  {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                                </button>
                              )}
                            </div>
                            <span className="font-extrabold text-white text-xs truncate uppercase mt-0.5" title={match.title}>
                              {match.title}
                            </span>
                          </div>
                        </td>

                        {/* Game / Format */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider inline-block w-fit ${
                              isMatchBgmi ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-[#FF3048]/15 text-[#FF3048] border border-[#FF3048]/30'
                            }`}>
                              {gameName}
                            </span>
                            <span className="text-[#B0ACB0] font-extrabold text-[11px] uppercase">
                              {modeName}
                            </span>
                          </div>
                        </td>

                        {/* Schedule & Map */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#00FFB2] font-bold text-[11px]">
                              {formatStartTime(match.startTime)}
                            </span>
                            <span className="text-[#777278] font-semibold text-[10px] uppercase">
                              Map: {mapName}
                            </span>
                          </div>
                        </td>

                        {/* Entry & Prize */}
                        <td className="p-3 whitespace-nowrap font-mono tabular-nums">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#FF3E6C] font-black text-xs">
                              ₹{match.prizePool} PRIZE
                            </span>
                            <span className="text-[#C9A34E] font-bold text-[10.5px]">
                              ₹{match.entryFee} ENTRY
                            </span>
                          </div>
                        </td>

                        {/* Slots Joined */}
                        <td className="p-3 whitespace-nowrap min-w-[110px]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px] font-black">
                              <span className="text-[#00FFB2]">{match.filledSlots}/{totalSlots}</span>
                              <span className="text-[#777278]">{slotsRemaining} left</span>
                            </div>
                            <div className="w-full h-1.5 bg-[#0D0B0D] rounded-full overflow-hidden border border-[#29252A]/40">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                                style={{ width: `${percentFilled}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Credentials */}
                        <td className="p-3 whitespace-nowrap">
                          {match.isRoomReleased ? (
                            <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                              <Key className="w-2.5 h-2.5 text-amber-400" />
                              <span>Released</span>
                            </span>
                          ) : (
                            <span className="text-[#777278] text-[10px] italic">Not Dispatched</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border inline-block ${
                            effectiveStatus === 'live'
                              ? 'bg-rose-950/80 text-rose-400 border-[#350A12] animate-pulse'
                              : effectiveStatus === 'upcoming'
                              ? 'bg-[#1B181C]/60 text-[#B590FF] border-[#B590FF]/30'
                              : effectiveStatus === 'completed'
                              ? 'bg-[#350A12]/80 text-[#C9A34E] border-emerald-500/40'
                              : 'bg-red-950/80 text-red-300 border-red-800/40'
                          }`}>
                            {effectiveStatus.toUpperCase()}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 pr-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Details modal trigger */}
                            <button
                              type="button"
                              onClick={() => setDetailsModalTournament(match)}
                              className="p-1.5 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                              title="View Match Details & Players"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#C9A34E]" />
                            </button>

                            {/* Release Room */}
                            {effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeReleaseRoomId === match.id) setActiveReleaseRoomId(null);
                                  else {
                                    setActiveReleaseRoomId(match.id);
                                    setInputRoomId(match.roomId || '');
                                    setInputRoomPass(match.roomPassword || '');
                                    setActivePublishWinnersId(null);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-400 text-amber-300 hover:text-black border border-amber-500/30 transition text-[10px] font-bold"
                                title="Release Room Credentials"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Winners */}
                            {effectiveStatus === 'completed' ? (
                              <button
                                type="button"
                                onClick={() => setResultsListModalTournament(match)}
                                className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-800 text-emerald-300 border border-emerald-500/40 transition text-[10px] font-bold"
                                title="Result Out List"
                              >
                                <Trophy className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activePublishWinnersId === match.id) setActivePublishWinnersId(null);
                                  else {
                                    setActivePublishWinnersId(match.id);
                                    const initMap = new Map<string, any>();
                                    (match.participants || []).forEach((p, idx) => {
                                      const details = resolveParticipantDetails(p, users, match);
                                      const pUserId = details.userAuthUid !== 'N/A' ? details.userAuthUid : ((p as any).userId || (p as any).uid || (p as any).id || '');
                                      const gameUid = details.gameUid !== 'N/A' ? details.gameUid : ((p as any).inGameId || (p as any).gameUid || pUserId);
                                      const key = gameUid && gameUid !== 'N/A' ? gameUid : (pUserId || `idx_${idx}`);

                                      const suggestedRank = Number(p.rank ?? (p as any).playerRank ?? (p as any).player_rank ?? (p as any).position ?? (p as any).resultRank ?? (p as any).result_rank ?? (idx + 1));
                                      const kills = Number(p.kills ?? (p as any).kill ?? (p as any).killCount ?? (p as any).kill_count ?? (p as any).playerKills ?? (p as any).player_kills ?? (p as any).totalKills ?? (p as any).total_kills ?? 0);
                                      const rankPrize = getPrizeForRank(suggestedRank, match.prizeDistribution || []);
                                      const effectiveRankPrize = rankPrize > 0 ? rankPrize : (suggestedRank === 1 && match.prizePool ? Number(match.prizePool) : 0);
                                      const perKillReward = match.perKillReward && !isNaN(Number(match.perKillReward)) ? Number(match.perKillReward) : 0;
                                      const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);
                                      
                                      const rawExistingPrize = p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount;
                                      const existingPrizeNum = rawExistingPrize !== undefined && rawExistingPrize !== null ? Number(rawExistingPrize) : 0;
                                      const prizeWon = existingPrizeNum > 0 ? existingPrizeNum : (effectiveRankPrize + (kills * perKillReward));

                                      const entry = {
                                        ...p,
                                        slotNumber: slotNo,
                                        userId: pUserId,
                                        email: details.email !== 'N/A' ? details.email : ((p as any).email || (p as any).userEmail || ''),
                                        inGameId: gameUid,
                                        inGameName: details.gameIgn !== 'N/A' ? details.gameIgn : ((p as any).inGameName || (p as any).gameIgn || (p as any).ign || ''),
                                        username: details.username || 'Player',
                                        rank: suggestedRank,
                                        kills,
                                        prizeWon
                                      };

                                      if (!initMap.has(key)) {
                                        initMap.set(key, entry);
                                      } else {
                                        const existing = initMap.get(key);
                                        if (kills > Number(existing.kills || 0) || prizeWon > Number(existing.prizeWon || 0)) {
                                          initMap.set(key, entry);
                                        }
                                      }
                                    });
                                    setParticipantResults(Array.from(initMap.values()));
                                    setActiveReleaseRoomId(null);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black border border-[#C9A34E]/30 transition text-[10px] font-bold"
                                title="Publish Winners"
                              >
                                <Award className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(match)}
                              className="p-1.5 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                              title="Edit Match"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#C9A34E]" />
                            </button>

                            {/* Duplicate */}
                            <button
                              type="button"
                              onClick={() => handleOpenDuplicateModal(match)}
                              className="p-1.5 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                              title="Duplicate Match"
                            >
                              <Copy className="w-3.5 h-3.5 text-[#C9A34E]" />
                            </button>

                            {/* Danger Zone */}
                            <button
                              type="button"
                              onClick={() => setExpandedDangerZoneId(expandedDangerZoneId === match.id ? null : match.id)}
                              className={`p-1.5 rounded-lg border transition ${
                                expandedDangerZoneId === match.id ? 'bg-rose-950 text-rose-300 border-rose-600' : 'bg-[#141215] text-[#777278] hover:text-rose-300 border-[#29252A]'
                              }`}
                              title="Danger Zone (Delete / Cancel)"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row for Table View Forms */}
                      {(activeReleaseRoomId === match.id || activePublishWinnersId === match.id || expandedDangerZoneId === match.id) && (
                        <tr className="bg-[#0D0B0D]">
                          <td colSpan={8} className="p-4 border-b border-[#29252A]">
                            {activeReleaseRoomId === match.id && (
                              <div className="p-3 rounded-xl bg-[#141215] border border-[#29252A] space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-black text-[#C9A34E] flex items-center gap-1.5">
                                    <Key className="w-3.5 h-3.5 text-[#C9A34E]" /> Dispatch Game Room Credentials
                                  </h4>
                                  <button onClick={() => setActiveReleaseRoomId(null)} className="text-[#777278] hover:text-white">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={inputRoomId}
                                    onChange={(e) => setInputRoomId(e.target.value)}
                                    placeholder="Room ID (e.g. 894021)"
                                    className="bg-[#0D0B0D] text-white text-xs font-mono p-2 rounded-lg border border-[#29252A]"
                                  />
                                  <input
                                    type="text"
                                    value={inputRoomPass}
                                    onChange={(e) => setInputRoomPass(e.target.value)}
                                    placeholder="Room Password (e.g. WINX7)"
                                    className="bg-[#0D0B0D] text-white text-xs font-mono p-2 rounded-lg border border-[#29252A]"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setActiveReleaseRoomId(null)} className="text-xs text-[#B0ACB0]">Cancel</button>
                                  <button
                                    onClick={() => {
                                      if (inputRoomId && inputRoomPass) {
                                        onReleaseRoomCredentials(match.id, inputRoomId, inputRoomPass);
                                        setActiveReleaseRoomId(null);
                                      }
                                    }}
                                    className="px-3 py-1 bg-[#C9A34E] text-black font-extrabold text-xs rounded-lg"
                                  >
                                    Release
                                  </button>
                                </div>
                              </div>
                            )}

                            {activePublishWinnersId === match.id && (
                              <TournamentResultFormPanel
                                match={match}
                                users={users}
                                currentUser={currentUser as any}
                                onSubmitResultForVerification={onSubmitResultForVerification}
                                onPublishMatchResults={onPublishMatchResults}
                                onClose={() => setActivePublishWinnersId(null)}
                              />
                            )}

                            {expandedDangerZoneId === match.id && (
                              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-rose-400" /> Danger Zone Actions
                                </span>
                                <div className="flex items-center gap-2">
                                  {onCancelMatchAndRefund && (match.status !== 'completed' && match.status !== 'finished' && match.status !== 'cancelled') && (
                                    <button
                                      type="button"
                                      onClick={() => setCancellingTournament(match)}
                                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-extrabold"
                                    >
                                      Cancel Match & Refund
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeletingTournament(match)}
                                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-extrabold"
                                  >
                                    Delete Match
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards Grid Mode (Compact Cards or Hero Cards) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTournaments.map((match) => {
              const displayMatchId = normalizePublicMatchId(match.matchId || (match as any).match_id) || match.matchId || (match as any).match_id;
              const isCopied = copiedText === displayMatchId;
              const isMatchBgmi = 
                (match.game || '').toUpperCase() === 'BGMI' || 
                (match.game || '').toUpperCase().includes('BATTLEGROUND') || 
                (match.game || '').toUpperCase() === 'PUBG' ||
                (match.title || '').toUpperCase().includes('BGMI') ||
                (match.category || '').toUpperCase() === 'BGMI' ||
                ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK'].includes((match.map || '').toUpperCase());
              const gameName = isMatchBgmi ? 'BGMI' : (match.game || 'FREE FIRE');
              const modeName = (match.matchType && match.matchType.toUpperCase() !== 'FREE FIRE' && match.matchType.toUpperCase() !== 'BGMI')
                ? match.matchType
                : ((match as any).mode || 'Solo');
              const mapName = match.map || (isMatchBgmi ? 'Erangel' : 'Bermuda');
              const totalSlots = match.maxSlots || (isMatchBgmi ? 100 : 48);
              const slotsRemaining = Math.max(0, totalSlots - (match.filledSlots || 0));
              const percentFilled = Math.min(100, Math.max(0, (match.filledSlots / (totalSlots || 1)) * 100));

              const s = (match.status || '').toLowerCase();
              const isCompleted = s === 'finished' || s === 'completed' || (match as any).results_published || Boolean((match as any).completedAt || (match as any).completed_at);
              const isCancelled = s === 'cancelled';
              const rawTime = match.startTime || match.matchTime || (match as any).start_time || (match as any).match_time;
              const isLiveScheduled = isMatchLiveBySchedule(rawTime, match.matchDate, (match as any).time);
              const effectiveStatus = isCompleted ? 'completed' : isCancelled ? 'cancelled' : (s === 'live' || isLiveScheduled) ? 'live' : 'upcoming';
              const imgUrl = getMatchBannerImage(match, banners, categories);

              const isPlayersExpanded = expandedAccordions[match.id]?.players;
              const isPrizesExpanded = expandedAccordions[match.id]?.prizes;

              return (
                <div
                  key={match.id}
                  className="bg-[#141215] border border-[#29252A]/40 rounded-2xl p-3.5 transition-all shadow-md flex flex-col gap-2.5 hover:border-[#29252A]"
                >
                  {/* Card Header Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isMatchBgmi ? (
                          <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            BGMI
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider bg-[#FF3048]/15 text-[#FF3048] border border-[#FF3048]/30 shrink-0">
                            {gameName}
                          </span>
                        )}
                        <h3 className="font-extrabold text-white text-xs tracking-wide truncate uppercase">
                          {match.title}
                        </h3>
                      </div>

                      {displayMatchId && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-mono text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded tracking-wider select-all">
                            {displayMatchId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyValue(displayMatchId);
                            }}
                            className={`p-1 rounded transition flex items-center gap-0.5 text-[10px] font-semibold ${
                              isCopied
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-[#777278] hover:text-amber-300 hover:bg-white/5'
                            }`}
                            title="Copy Match ID"
                          >
                            {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      )}
                    </div>

                    <span
                      className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border shrink-0 ${
                        effectiveStatus === 'live'
                          ? 'bg-rose-950/80 text-rose-400 border-[#350A12] animate-pulse'
                          : effectiveStatus === 'upcoming'
                          ? 'bg-[#1B181C]/60 text-[#B590FF] border-[#B590FF]/30'
                          : effectiveStatus === 'completed'
                          ? 'bg-[#350A12]/80 text-[#C9A34E] border-emerald-500/40'
                          : 'bg-red-950/80 text-red-300 border-red-800/40'
                      }`}
                    >
                      {effectiveStatus.toUpperCase()}
                    </span>
                  </div>

                  {/* Card Image Rendering Strategy */}
                  {displayView === 'cards' ? (
                    /* Full Hero Aspect Ratio Image */
                    imgUrl && imgUrl !== 'N/A' && (
                      <div className="relative w-full aspect-[1.92/1] rounded-xl overflow-hidden bg-black/60 border border-[#29252A] shadow-inner">
                        <img
                          src={imgUrl}
                          alt={match.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImageFallback(e, match.game || match.title)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141215] via-transparent to-transparent pointer-events-none" />
                      </div>
                    )
                  ) : compactImageMode === 'side' && imgUrl && imgUrl !== 'N/A' ? (
                    /* Compact Side Thumbnail Row */
                    <div className="flex items-center gap-3 bg-[#171418] p-2 rounded-xl border border-[#29252A]/30">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-black border border-[#29252A] shrink-0 relative shadow-sm">
                        <img
                          src={imgUrl}
                          alt={match.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImageFallback(e, match.game || match.title)}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="text-[#C9A34E] font-black uppercase">{modeName}</span>
                          <span className="text-[#00FFB2] font-bold">{formatStartTime(match.startTime)}</span>
                        </div>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-[#FF3E6C] font-black">₹{match.prizePool} PRIZE</span>
                          <span className="text-[#C9A34E] font-extrabold text-[11px]">₹{match.entryFee} ENTRY</span>
                        </div>
                        <div className="flex items-center justify-between text-[9.5px] text-[#777278] font-bold">
                          <span>Map: {mapName}</span>
                          <span className="text-[#00FFB2]">{match.filledSlots}/{totalSlots} SLOTS</span>
                        </div>
                      </div>
                    </div>
                  ) : compactImageMode === 'banner' && imgUrl && imgUrl !== 'N/A' ? (
                    /* Compact Header Banner */
                    <div className="relative w-full h-16 rounded-xl overflow-hidden bg-black/60 border border-[#29252A]">
                      <img
                        src={imgUrl}
                        alt={match.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleImageFallback(e, match.game || match.title)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent p-2 flex items-center justify-between">
                        <span className="text-[#C9A34E] font-black text-xs uppercase">{modeName} • {mapName}</span>
                        <span className="text-[#00FFB2] font-bold text-xs">{formatStartTime(match.startTime)}</span>
                      </div>
                    </div>
                  ) : null}

                  {/* Scannable Metrics Grid (If side thumbnail or image mode 'none' or 'cards') */}
                  {(compactImageMode !== 'side' || displayView === 'cards') && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/30 text-xs">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-[#777278] block">Schedule</span>
                        <span className="text-[#00FFB2] font-bold text-[11px] truncate block">{formatStartTime(match.startTime)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase font-bold text-[#777278] block">Format</span>
                        <span className="text-white font-black text-[11px] uppercase truncate block">{modeName} • {mapName}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-[#777278] block">Prize Pool</span>
                        <span className="text-[#FF3E6C] font-black text-xs block">₹{match.prizePool}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase font-bold text-[#777278] block">Entry Fee</span>
                        <span className="text-[#C9A34E] font-black text-xs block">₹{match.entryFee}</span>
                      </div>
                    </div>
                  )}

                  {/* Slots Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase">
                      <span className="text-[#00FFB2]">{slotsRemaining} SLOTS LEFT</span>
                      <span className="text-[#777278]">{match.filledSlots}/{totalSlots} JOINED</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#0D0B0D] rounded-full overflow-hidden border border-[#29252A]/30">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                        style={{ width: `${percentFilled}%` }}
                      />
                    </div>
                  </div>

                  {/* Collapsible Accordion Toggles (Registered Players & Prize Pool) */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[#29252A]/40">
                    <button
                      type="button"
                      onClick={() => toggleAccordion(match.id, 'players')}
                      className={`flex-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-between border ${
                        isPlayersExpanded
                          ? 'bg-[#29252A] text-amber-300 border-amber-500/40'
                          : 'bg-[#171418] hover:bg-[#201C22] text-[#B0ACB0] border-[#29252A]/50'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-[#C9A34E]" />
                        <span>Players ({match.participants?.length || 0})</span>
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isPlayersExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleAccordion(match.id, 'prizes')}
                      className={`flex-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-between border ${
                        isPrizesExpanded
                          ? 'bg-[#29252A] text-amber-300 border-amber-500/40'
                          : 'bg-[#171418] hover:bg-[#201C22] text-[#B0ACB0] border-[#29252A]/50'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Award className="w-3 h-3 text-[#C9A34E]" />
                        <span>Prize Pool</span>
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isPrizesExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDetailsModalTournament(match)}
                      className="px-2 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-400 hover:bg-amber-300 text-black transition flex items-center gap-1 shrink-0"
                      title="View Full Details Modal"
                    >
                      <Eye className="w-3 h-3" />
                      <span className="hidden sm:inline">Details</span>
                    </button>
                  </div>

                  {/* Expanded Registered Players Drawer */}
                  {isPlayersExpanded && (
                    <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/40 space-y-1.5 animate-in slide-in-from-top-1">
                      <div className="flex items-center justify-between text-[10px] font-black text-[#C9A34E]">
                        <span>REGISTERED SLOTS ({match.participants?.length || 0})</span>
                        <button onClick={() => setDetailsModalTournament(match)} className="underline text-[#00FFB2]">Full List</button>
                      </div>
                      {match.participants && match.participants.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                          {match.participants.map((p, pIdx) => {
                            const { gameIgn, username } = resolveParticipantDetails(p, users, match);
                            const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (pIdx + 1);
                            return (
                              <div key={pIdx} className="p-1 px-1.5 rounded bg-[#141215] border border-[#29252A]/20 text-[9.5px] flex items-center justify-between">
                                <span className="font-mono text-[#C9A34E] font-bold">#{slotNo}</span>
                                <span className="text-white font-bold truncate max-w-[70%]">{gameIgn !== 'N/A' ? gameIgn : username}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-[10px] text-[#777278] py-2">No players registered yet.</div>
                      )}
                    </div>
                  )}

                  {/* Expanded Prize Distribution Drawer */}
                  {isPrizesExpanded && (
                    <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/40 space-y-1.5 animate-in slide-in-from-top-1">
                      <span className="text-[10px] font-black text-[#C9A34E] uppercase block">Prize Ranks & Rewards</span>
                      <div className="grid grid-cols-2 gap-1 max-h-28 overflow-y-auto custom-scrollbar">
                        {match.perKillReward ? (
                          <div className="p-1 px-1.5 rounded bg-rose-950/40 border border-rose-500/30 text-[9.5px] flex justify-between">
                            <span className="text-rose-300 font-extrabold">Per Kill</span>
                            <span className="text-[#C9A34E] font-black font-mono">₹{match.perKillReward}</span>
                          </div>
                        ) : null}
                        {(match.prizeDistribution || []).map((p: any, pIdx: number) => (
                          <div key={pIdx} className="p-1 px-1.5 rounded bg-[#0D0B0D] border border-[#29252A]/20 text-[9.5px] flex justify-between">
                            <span className="text-[#B0ACB0] font-bold truncate">{p.rankRange || p.rankName || `Rank ${pIdx + 1}`}</span>
                            <span className="text-[#C9A34E] font-black font-mono">₹{p.prize ?? p.amount ?? 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Room Credentials Status Badge (If released) */}
                  {match.isRoomReleased && (
                    <div className="bg-[#350A12]/30 border border-emerald-900/40 p-2 rounded-xl flex items-center justify-between text-[11px] text-[#C9A34E] font-bold px-2.5">
                      <span className="flex items-center gap-1">
                        <Key className="w-3 h-3 text-[#C9A34E]" />
                        <span>Room Dispatched:</span>
                      </span>
                      <span className="font-mono text-[#B0ACB0] text-[10px]">ID: {match.roomId} | PASS: {match.roomPassword}</span>
                    </div>
                  )}

                  {/* Admin Bottom Action Bar */}
                  <div className="border-t border-[#29252A]/40 pt-2.5 flex flex-wrap items-center justify-between gap-1.5 mt-auto">
                    {/* Left Actions: Room / Winners */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (activeReleaseRoomId === match.id) setActiveReleaseRoomId(null);
                            else {
                              setActiveReleaseRoomId(match.id);
                              setInputRoomId(match.roomId || '');
                              setInputRoomPass(match.roomPassword || '');
                              setActivePublishWinnersId(null);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer ${
                            match.isRoomReleased
                              ? 'bg-[#171418] text-[#C9A34E] border border-[#29252A]'
                              : 'bg-gradient-to-r from-amber-400 to-amber-500 text-black'
                          }`}
                        >
                          <Key className="w-3 h-3" />
                          <span>{match.isRoomReleased ? 'Credentials' : 'Release Room'}</span>
                        </button>
                      )}

                      {effectiveStatus === 'completed' ? (
                        <button
                          type="button"
                          onClick={() => setResultsListModalTournament(match)}
                          className="px-2.5 py-1 rounded-xl text-[10px] font-black transition flex items-center gap-1 border bg-gradient-to-r from-[#0d2a27] to-[#123834] text-[#C9A34E] border-emerald-500/50 cursor-pointer"
                        >
                          <Trophy className="w-3 h-3 text-[#C9A34E]" />
                          <span>Results</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (activePublishWinnersId === match.id) setActivePublishWinnersId(null);
                            else {
                              setActivePublishWinnersId(match.id);
                              const initMap = new Map<string, any>();
                              (match.participants || []).forEach((p, idx) => {
                                const details = resolveParticipantDetails(p, users, match);
                                const pUserId = details.userAuthUid !== 'N/A' ? details.userAuthUid : ((p as any).userId || (p as any).uid || (p as any).id || '');
                                const gameUid = details.gameUid !== 'N/A' ? details.gameUid : ((p as any).inGameId || (p as any).gameUid || pUserId);
                                const key = gameUid && gameUid !== 'N/A' ? gameUid : (pUserId || `idx_${idx}`);

                                const suggestedRank = Number(p.rank ?? (p as any).playerRank ?? (p as any).player_rank ?? (p as any).position ?? (p as any).resultRank ?? (p as any).result_rank ?? (idx + 1));
                                const kills = Number(p.kills ?? (p as any).kill ?? (p as any).killCount ?? (p as any).kill_count ?? (p as any).playerKills ?? (p as any).player_kills ?? (p as any).totalKills ?? (p as any).total_kills ?? 0);
                                const rankPrize = getPrizeForRank(suggestedRank, match.prizeDistribution || []);
                                const effectiveRankPrize = rankPrize > 0 ? rankPrize : (suggestedRank === 1 && match.prizePool ? Number(match.prizePool) : 0);
                                const perKillReward = match.perKillReward && !isNaN(Number(match.perKillReward)) ? Number(match.perKillReward) : 0;
                                const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);
                                
                                const rawExistingPrize = p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount;
                                const existingPrizeNum = rawExistingPrize !== undefined && rawExistingPrize !== null ? Number(rawExistingPrize) : 0;
                                const prizeWon = existingPrizeNum > 0 ? existingPrizeNum : (effectiveRankPrize + (kills * perKillReward));

                                const entry = {
                                  ...p,
                                  slotNumber: slotNo,
                                  userId: pUserId,
                                  email: details.email !== 'N/A' ? details.email : ((p as any).email || (p as any).userEmail || ''),
                                  inGameId: gameUid,
                                  inGameName: details.gameIgn !== 'N/A' ? details.gameIgn : ((p as any).inGameName || (p as any).gameIgn || (p as any).ign || ''),
                                  username: details.username || 'Player',
                                  rank: suggestedRank,
                                  kills,
                                  prizeWon
                                };

                                if (!initMap.has(key)) {
                                  initMap.set(key, entry);
                                } else {
                                  const existing = initMap.get(key);
                                  if (kills > Number(existing.kills || 0) || prizeWon > Number(existing.prizeWon || 0)) {
                                    initMap.set(key, entry);
                                  }
                                }
                              });
                              setParticipantResults(Array.from(initMap.values()));
                              setActiveReleaseRoomId(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-xl text-[10px] font-black transition flex items-center gap-1 border bg-[#141215] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black border-[#C9A34E]/40 cursor-pointer"
                        >
                          <Award className="w-3 h-3" />
                          <span>Winners</span>
                        </button>
                      )}
                    </div>

                    {/* Right Actions: Edit, Duplicate, Danger Zone */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(match)}
                        className="p-1.5 rounded-xl bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                        title="Edit Match"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#C9A34E]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDuplicateModal(match)}
                        className="p-1.5 rounded-xl bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                        title="Duplicate Match"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#C9A34E]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedDangerZoneId(expandedDangerZoneId === match.id ? null : match.id)}
                        className={`p-1.5 rounded-xl border transition ${
                          expandedDangerZoneId === match.id
                            ? 'bg-rose-950 text-rose-300 border-rose-600'
                            : 'bg-[#141215] text-[#777278] hover:text-rose-300 border-[#29252A]/50'
                        }`}
                        title="Danger Zone (Delete / Cancel)"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Danger Zone Panel */}
                  {expandedDangerZoneId === match.id && (
                    <div className="mt-2 p-2.5 rounded-xl bg-[#171418] border border-rose-900/50 space-y-2 animate-in slide-in-from-top-1">
                      <div className="flex items-center justify-between text-[10px] uppercase font-black text-rose-400">
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone Actions
                        </span>
                        <button onClick={() => setExpandedDangerZoneId(null)} className="text-[#777278] hover:text-white">✕</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {onCancelMatchAndRefund && (match.status !== 'completed' && match.status !== 'finished' && match.status !== 'cancelled') && (
                          <button
                            type="button"
                            onClick={() => setCancellingTournament(match)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Cancel & Refund</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingTournament(match)}
                          className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-black flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Match</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Room Credentials Form Panel */}
                  {activeReleaseRoomId === match.id && (
                    <div className="mt-2 p-3 rounded-xl bg-[#141215] border border-[#29252A] space-y-3 animate-in slide-in-from-top-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-[#C9A34E] flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-[#C9A34E]" /> Enter Game Room ID & Pass
                        </h4>
                        <button onClick={() => setActiveReleaseRoomId(null)} className="text-[#777278] hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-[#B0ACB0] mb-1">Room ID</label>
                          <input
                            type="text"
                            required
                            value={inputRoomId}
                            onChange={(e) => setInputRoomId(e.target.value)}
                            placeholder="e.g. 894021"
                            className="w-full bg-[#141215] text-white text-xs font-mono p-2 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-[#B0ACB0] mb-1">Room Password</label>
                          <input
                            type="text"
                            required
                            value={inputRoomPass}
                            onChange={(e) => setInputRoomPass(e.target.value)}
                            placeholder="e.g. WINX7"
                            className="w-full bg-[#141215] text-white text-xs font-mono p-2 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button onClick={() => setActiveReleaseRoomId(null)} className="text-xs text-[#B0ACB0]">Cancel</button>
                        <button
                          onClick={() => {
                            if (inputRoomId && inputRoomPass) {
                              onReleaseRoomCredentials(match.id, inputRoomId, inputRoomPass);
                              setActiveReleaseRoomId(null);
                            }
                          }}
                          disabled={!inputRoomId || !inputRoomPass}
                          className="px-3.5 py-1.5 rounded-xl bg-[#C9A34E] text-black font-extrabold text-[11px] hover:bg-amber-400 disabled:opacity-50"
                        >
                          Release Credentials
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Publish Winners Form Panel */}
                  {activePublishWinnersId === match.id && (
                    <TournamentResultFormPanel
                      match={match}
                      users={users}
                      currentUser={currentUser as any}
                      onSubmitResultForVerification={onSubmitResultForVerification}
                      onPublishMatchResults={onPublishMatchResults}
                      onClose={() => setActivePublishWinnersId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Host New Tournament / Edit Tournament Full-Screen Expanded View */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#0D0B0D] flex flex-col overflow-hidden animate-in fade-in duration-200">
          
          {/* Top Header Navigation Bar */}
          <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3.5 bg-[#141215] border-b border-[#29252A] flex items-center justify-between shrink-0 shadow-xl">
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTournament(null);
                }}
                className="p-2 sm:px-3.5 sm:py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] transition flex items-center gap-2 text-xs font-bold active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#C9A34E]" />
                <span className="hidden sm:inline">Back to Matches</span>
              </button>
              
              <div className="h-6 w-px bg-[#29252A] hidden sm:block" />

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#350A12] border border-[#FF3048]/30 flex items-center justify-center text-[#C9A34E] shadow-inner">
                  <Trophy className="w-4 h-4 text-[#C9A34E]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-white tracking-tight">
                      {editingTournament ? 'Edit Match' : 'Host New Tournament'}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#C9A34E]/15 text-[#C9A34E] border border-[#C9A34E]/30">
                      {editingTournament ? 'Editing Match' : 'Create Mode'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#B0ACB0] hidden md:block">
                    Configure match parameters, image banner, timing, entry fees, custom rules, and prize payouts.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTournament(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const form = document.getElementById('tournament-create-form') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
                className="px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black shadow-lg shadow-amber-950/40 transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{editingTournament ? 'Save Match Changes' : 'Publish Tournament'}</span>
              </button>
            </div>
          </header>

          {/* Expanded Form Content */}
          <form
            id="tournament-create-form"
            onSubmit={handleCreateSubmit}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8 space-y-6">
              <div className="max-w-7xl mx-auto space-y-6">
                
                {/* 2-Column Responsive Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* LEFT COLUMN: Match Core Identity, Banner, Map & Timing */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Card 1: Basic Information & Format */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-4 h-4" /> 1. Match Identity & Format
                        </h3>
                        <span className="text-[10px] text-[#777278] font-bold">Required Details</span>
                      </div>

                      {/* Public Match ID: Read-only on edit, auto-assigned on create */}
                      <div className="bg-[#0D0B0D] p-3 rounded-xl border border-[#29252A] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-[#777278]">
                              Public Match ID
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#1B181C] text-[#C9A34E] border border-[#29252A]">
                              {editingTournament ? 'Permanent • Uneditable' : 'Auto Generated'}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#B0ACB0]/70 block mt-0.5">
                            {editingTournament
                              ? 'Fixed human-readable Match ID in format WX7-DDMM-XXX.'
                              : 'Allocated atomically on publish in format WX7-DDMM-XXX based on match date.'}
                          </span>
                        </div>
                        {editingTournament ? (
                          (() => {
                            const editMatchId = normalizePublicMatchId(editingTournament.matchId || (editingTournament as any).match_id) || editingTournament.matchId || (editingTournament as any).match_id;
                            if (!editMatchId) return null;
                            const isCopied = copiedText === editMatchId;
                            return (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-xs font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg tracking-wider select-all">
                                  {editMatchId}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(editMatchId)}
                                  className={`p-1.5 rounded-lg border transition flex items-center gap-1 text-[10px] font-bold ${
                                    isCopied
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white border-[#29252A]'
                                  }`}
                                  title="Copy Match ID"
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
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-xs font-bold text-amber-400/80 bg-amber-500/5 border border-amber-500/20 px-2.5 py-1 rounded-lg tracking-wider">
                              WX7-DDMM-XXX
                            </span>
                          </div>
                        )}
                      </div>

                      {/* MATCH CATEGORY Selection: SURVIVOR, ARENA, LONE WOLF */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0]">
                            1. Match Category (App Tab) <span className="text-[#C9A34E]">*</span>
                          </label>
                          <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border bg-amber-400/10 text-amber-400 border-amber-400/30">
                            {formMatchCategory}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#777278]">
                          Controls which category tab this match appears under in the User App.
                        </p>

                        {/* Interactive Category Chips */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {categoryOptions.map((cat) => {
                            const isSelected = formMatchCategory.toUpperCase() === cat.name.toUpperCase();
                            return (
                              <button
                                key={cat.id || cat.name}
                                type="button"
                                onClick={() => handleSelectMatchCategory(cat.name)}
                                className={`px-3.5 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#C9A34E] text-black border-amber-300 shadow-md ring-2 ring-amber-400/40'
                                    : 'bg-[#171418] text-[#B0ACB0] border-[#29252A] hover:border-amber-400/40 hover:text-white'
                                }`}
                              >
                                <span>{cat.name}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* GAME Selection: FREE FIRE or BGMI */}
                      <div className="space-y-2 pt-2 border-t border-[#29252A]/60">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0]">
                            2. Game (Game Engine / Title) <span className="text-[#C9A34E]">*</span>
                          </label>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            isBgmiSelected
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#FF3048]/10 text-[#FF3048] border-[#FF3048]/30'
                          }`}>
                            {isBgmiSelected ? 'BGMI' : 'FREE FIRE'}
                          </span>
                        </div>

                        {/* Interactive 2-Choice Cards: FREE FIRE or BGMI */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Option 1: FREE FIRE */}
                          <button
                            type="button"
                            id="game-pick-freefire"
                            onClick={() => handleSelectGame('FREE FIRE')}
                            className={`relative p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 cursor-pointer group ${
                              isFreeFireSelected
                                ? 'bg-gradient-to-r from-[#350A12] via-[#240C12] to-[#171418] border-[#FF3048] shadow-lg shadow-[#FF3048]/20 ring-2 ring-[#FF3048]/60'
                                : 'bg-[#171418] border-[#29252A] hover:border-[#FF3048]/50 hover:bg-[#1B181C]'
                            }`}
                          >
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border transition ${
                              isFreeFireSelected
                                ? 'bg-[#FF3048] text-white border-amber-300 shadow-md'
                                : 'bg-[#1B181C] text-[#FF3048] border-[#29252A] group-hover:border-[#FF3048]/40'
                            }`}>
                              <Flame className="w-6 h-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                  FREE FIRE
                                </span>
                                {isFreeFireSelected && (
                                  <span className="w-2 h-2 rounded-full bg-[#FF3048] animate-pulse" />
                                )}
                              </div>
                              <p className="text-[10px] text-[#B0ACB0] truncate mt-0.5">
                                Free Fire & Free Fire MAX
                              </p>
                              <span className="inline-block mt-1 text-[9px] font-bold text-[#C9A34E] bg-black/40 px-1.5 py-0.5 rounded border border-[#29252A]">
                                Bermuda • 48 Slots
                              </span>
                            </div>
                            {isFreeFireSelected && (
                              <div className="absolute top-2.5 right-2.5">
                                <CheckCircle2 className="w-4 h-4 text-[#FF3048]" />
                              </div>
                            )}
                          </button>

                          {/* Option 2: BGMI */}
                          <button
                            type="button"
                            id="game-pick-bgmi"
                            onClick={() => handleSelectGame('BGMI')}
                            className={`relative p-3.5 rounded-2xl border transition-all text-left flex items-center gap-3 cursor-pointer group ${
                              isBgmiSelected
                                ? 'bg-gradient-to-r from-[#122617] via-[#101F14] to-[#171418] border-emerald-500 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/60'
                                : 'bg-[#171418] border-[#29252A] hover:border-emerald-500/50 hover:bg-[#1B181C]'
                            }`}
                          >
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border transition ${
                              isBgmiSelected
                                ? 'bg-emerald-500 text-black border-emerald-300 shadow-md'
                                : 'bg-[#1B181C] text-emerald-400 border-[#29252A] group-hover:border-emerald-500/40'
                            }`}>
                              <Shield className="w-6 h-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                  BGMI
                                </span>
                                {isBgmiSelected && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                )}
                              </div>
                              <p className="text-[10px] text-[#B0ACB0] truncate mt-0.5">
                                Battlegrounds Mobile India
                              </p>
                              <span className="inline-block mt-1 text-[9px] font-bold text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-[#29252A]">
                                Erangel • 100 Slots
                              </span>
                            </div>
                            {isBgmiSelected && (
                              <div className="absolute top-2.5 right-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              </div>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Tournament Title */}
                      <div>
                        <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                          Match Title <span className="text-[#C9A34E]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder={isBgmiSelected ? "e.g. #205 BGMI SQUAD ERANGEL SHOWDOWN" : "e.g. #103 DUO PURGATORY NIGHT HUNT"}
                          className="w-full bg-[#171418] text-white text-sm p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-bold placeholder-[#777278] shadow-inner"
                        />
                      </div>

                      {/* Match Mode & Game Identifier */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] uppercase font-bold text-[#B0ACB0]">
                              Match Mode <span className="text-[#C9A34E]">*</span>
                            </label>
                            <span className="text-[10px] text-[#C9A34E] font-extrabold">
                              {isBgmiSelected ? 'BGMI Modes' : 'Free Fire Modes'}
                            </span>
                          </div>
                          <select
                            required
                            value={
                              currentModeList.some(m => m.toLowerCase() === (formMatchType || '').toLowerCase())
                                ? currentModeList.find(m => m.toLowerCase() === (formMatchType || '').toLowerCase())
                                : 'CUSTOM'
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== 'CUSTOM') {
                                setFormMatchType(val as MatchType);
                              }
                            }}
                            className="w-full bg-[#171418] text-[#C9A34E] text-xs p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-extrabold cursor-pointer"
                          >
                            {currentModeList.map(m => (
                              <option key={m} value={m} className="bg-[#141215] text-white">
                                {m}
                              </option>
                            ))}
                            <option value="CUSTOM" className="bg-[#141215] text-[#C9A34E]">✨ Custom Mode Name...</option>
                          </select>

                          {(!currentModeList.some(m => m.toLowerCase() === (formMatchType || '').toLowerCase()) || formMatchType === 'CUSTOM') && (
                            <input
                              type="text"
                              required
                              value={formMatchType === 'CUSTOM' ? '' : formMatchType}
                              onChange={(e) => setFormMatchType(e.target.value as MatchType)}
                              placeholder={isBgmiSelected ? "Enter custom BGMI mode (e.g. 4v4 TDM)..." : "Enter custom Free Fire mode (e.g. Clash Squad)..."}
                              className="w-full mt-2 bg-[#171418] text-white text-xs p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-bold"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                            Category & Game Summary
                          </label>
                          <div className="w-full bg-[#171418] text-xs p-2.5 rounded-xl border border-[#29252A] font-extrabold flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-400/10 text-amber-400 border border-amber-400/20">
                              {formMatchCategory}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isBgmiSelected
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-[#FF3048]/15 text-[#FF3048] border border-[#FF3048]/30'
                            }`}>
                              {isBgmiSelected ? 'BGMI' : 'FREE FIRE'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Tournament Banner & Media */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" /> 2. Tournament Banner & Media
                        </h3>
                        {formBannerUrl && (
                          <span className="text-[10px] font-extrabold text-[#C9A34E] bg-[#350A12] px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Banner Selected
                          </span>
                        )}
                      </div>

                      {formBannerUrl ? (
                        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-[#171418] p-3.5 rounded-2xl border border-[#29252A]">
                          <div
                            className="w-full sm:w-44 aspect-[1.92/1] rounded-xl overflow-hidden bg-black/60 shrink-0 border border-[#29252A] shadow-inner relative group"
                            style={{ aspectRatio: '1.92 / 1' }}
                          >
                            <img
                              src={formBannerUrl}
                              alt="Selected Tournament Image"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImageFallback(e, formTitle || 'Tournament Banner')}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-white uppercase truncate">
                              {savedImages.find((img) => img.id === formSavedImageId || img.url === formBannerUrl)?.name || 'Tournament Custom Banner'}
                            </p>
                            <p className="text-[11px] text-[#B0ACB0]/70 truncate mt-0.5">
                              High-Resolution Match Artwork • Displayed on Player Feeds
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => setShowImagePickerModal(true)}
                                className="px-3 py-1.5 rounded-xl bg-[#C9A34E]/20 hover:bg-[#C9A34E]/30 text-[#C9A34E] border border-[#C9A34E]/40 text-[11px] font-black uppercase transition cursor-pointer"
                              >
                                Change from Library
                              </button>
                              <label className="px-3 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] text-[11px] font-black uppercase transition cursor-pointer flex items-center gap-1">
                                <Upload className="w-3 h-3" />
                                <span>Upload New</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleDirectTournamentImageUpload}
                                  className="hidden"
                                  disabled={isUploadingImage}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormBannerUrl('');
                                  setFormSavedImageId('');
                                }}
                                className="p-1.5 rounded-xl bg-[#1B181C] hover:bg-[#350A12] text-[#B0ACB0] hover:text-rose-300 border border-[#29252A] transition cursor-pointer"
                                title="Remove banner"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setShowImagePickerModal(true)}
                            className="py-4 px-4 rounded-2xl border-2 border-dashed border-[#29252A] hover:border-[#C9A34E] bg-[#171418]/60 hover:bg-[#171418] text-[#B0ACB0] hover:text-white transition flex flex-col items-center justify-center gap-2 group cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#C9A34E]/10 border border-[#C9A34E]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <ImageIcon className="w-5 h-5 text-[#C9A34E]" />
                            </div>
                            <span className="text-xs font-black text-white">+ Select from Saved Images</span>
                            <span className="text-[10px] text-[#777278]">Choose from previously uploaded presets</span>
                          </button>

                          <label
                            className={`py-4 px-4 rounded-2xl border-2 border-dashed border-[#29252A] hover:border-[#C9A34E] bg-[#171418]/60 hover:bg-[#171418] text-[#B0ACB0] hover:text-white transition flex flex-col items-center justify-center gap-2 group cursor-pointer ${
                              isUploadingImage ? 'opacity-50 cursor-wait' : ''
                            }`}
                          >
                            {isUploadingImage ? (
                              <>
                                <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center">
                                  <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                </div>
                                <span className="text-xs font-black text-amber-400">Uploading File...</span>
                                <span className="text-[10px] text-[#777278]">Saving to Storage</span>
                              </>
                            ) : (
                              <>
                                <div className="w-10 h-10 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <Upload className="w-5 h-5 text-[#C9A34E]" />
                                </div>
                                <span className="text-xs font-black text-white">Upload New Image</span>
                                <span className="text-[10px] text-[#777278]">PNG, JPG or WEBP banner file</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleDirectTournamentImageUpload}
                              className="hidden"
                              disabled={isUploadingImage}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Card 3: Map & Start Timing */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> 3. Map & Schedule
                        </h3>
                        <span className="text-[10px] text-[#777278] font-bold">Location & Time</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Map Selector */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] uppercase font-bold text-[#B0ACB0]">
                              Map Name <span className="text-[#C9A34E]">*</span>
                            </label>
                            <span className="text-[10px] text-[#C9A34E] font-extrabold">
                              {isBgmiSelected ? 'BGMI Maps' : 'Free Fire Maps'}
                            </span>
                          </div>
                          <select
                            value={
                              currentMapList.some(m => m.toLowerCase() === formMap.toLowerCase())
                                ? currentMapList.find(m => m.toLowerCase() === formMap.toLowerCase())
                                : 'CUSTOM'
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== 'CUSTOM') {
                                setFormMap(val as MapType);
                              }
                            }}
                            className="w-full bg-[#171418] text-[#C9A34E] text-xs p-3 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E] font-bold cursor-pointer mb-2"
                          >
                            {currentMapList.map((m) => (
                              <option key={m} value={m} className="bg-[#141215] text-white">
                                {m}
                              </option>
                            ))}
                            <option value="CUSTOM" className="bg-[#141215] text-[#C9A34E]">✨ Custom Map Name...</option>
                          </select>

                          {(!currentMapList.some(m => m.toLowerCase() === formMap.toLowerCase()) || formMap === 'CUSTOM') && (
                            <input
                              type="text"
                              required
                              value={formMap === 'CUSTOM' ? '' : formMap}
                              onChange={(e) => setFormMap(e.target.value as MapType)}
                              placeholder={isBgmiSelected ? "Enter custom BGMI map..." : "Enter custom Free Fire map..."}
                              className="w-full bg-[#171418] text-white text-xs p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-bold"
                            />
                          )}
                        </div>

                        {/* Start Time */}
                        <div>
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                            Start Date & Time <span className="text-[#C9A34E]">*</span>
                          </label>
                          <input
                            type="datetime-local"
                            required
                            value={formStartTime}
                            onChange={(e) => {
                              setIsTimeManual(true);
                              setFormStartTime(e.target.value);
                            }}
                            className="w-full bg-[#171418] text-white text-xs p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-bold"
                          />

                          {formStartTime && (
                            <div className="mt-2 text-xs text-[#00FFB2] font-black flex items-center gap-1.5 px-1">
                              <span className="shrink-0 text-[#8E8A90] font-normal uppercase text-[10px]">Formatted Preview:</span>
                              <span>{(() => {
                                try {
                                  const d = new Date(formStartTime);
                                  if (isNaN(d.getTime())) return formStartTime;
                                  const datePart = new Intl.DateTimeFormat('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  }).format(d);
                                  const timePart = new Intl.DateTimeFormat('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  }).format(d);
                                  return `${datePart} at ${timePart} (IST)`;
                                } catch (e) {
                                  return formStartTime;
                                }
                              })()}</span>
                            </div>
                          )}

                          {/* Quick Timing Presets */}
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsTimeManual(true);
                                const d = new Date();
                                d.setHours(d.getHours() + 1);
                                setFormStartTime(formatForDateTimeLocal(d.toISOString()));
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-[#C9A34E] text-[10px] font-bold border border-[#29252A] transition cursor-pointer"
                            >
                              +1 Hour
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsTimeManual(true);
                                const d = new Date();
                                d.setHours(d.getHours() + 2);
                                setFormStartTime(formatForDateTimeLocal(d.toISOString()));
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-[#C9A34E] text-[10px] font-bold border border-[#29252A] transition cursor-pointer"
                            >
                              +2 Hours
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsTimeManual(true);
                                const d = new Date();
                                d.setDate(d.getDate() + 1);
                                setFormStartTime(formatForDateTimeLocal(d.toISOString()));
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-[#C9A34E] text-[10px] font-bold border border-[#29252A] transition cursor-pointer"
                            >
                              Tomorrow
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: Access Code & Password Protection */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-3.5 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${formRequireAccessCode ? 'bg-amber-400/10 border-amber-400/30 text-[#C9A34E]' : 'bg-[#1B181C] border-[#29252A] text-[#777278]'}`}>
                            <Key className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <label htmlFor="toggle-require-access-code" className="text-xs font-black text-white cursor-pointer select-none">
                                Require Access Code
                              </label>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${formRequireAccessCode ? 'bg-[#C9A34E]/20 text-[#C9A34E] border border-[#C9A34E]/30' : 'bg-[#1B181C] text-[#777278]'}`}>
                                {formRequireAccessCode ? 'ON (Pass Protected)' : 'OFF (Public Entry)'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#B0ACB0]/70 mt-0.5">
                              {formRequireAccessCode 
                                ? 'Players must enter this unique secret key before registering or joining this match.' 
                                : 'Default: Any verified player can join directly without requiring an entry code.'}
                            </p>
                          </div>
                        </div>

                        {/* Toggle Switch */}
                        <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                          <input
                            id="toggle-require-access-code"
                            type="checkbox"
                            checked={formRequireAccessCode}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormRequireAccessCode(checked);
                              if (checked && (!formAccessCode || formAccessCode.trim() === '')) {
                                setFormAccessCode('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase());
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-[#0D0B0D] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#29252A] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C9A34E]"></div>
                        </label>
                      </div>

                      {formRequireAccessCode && (
                        <div className="pt-3 border-t border-[#29252A] animate-in fade-in duration-150">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] uppercase font-bold text-[#C9A34E]">
                              Secret Access Code (Unique Entry Key) <span className="text-[#C9A34E]">*</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => setFormAccessCode('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())}
                              className="text-[11px] text-[#C9A34E] hover:underline font-bold cursor-pointer flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Generate Random Key</span>
                            </button>
                          </div>
                          <input
                            type="text"
                            required={formRequireAccessCode}
                            value={formAccessCode}
                            onChange={(e) => setFormAccessCode(e.target.value)}
                            placeholder="e.g. WINX7-K9Q2"
                            className="w-full bg-[#171418] text-[#C9A34E] text-xs font-mono font-bold tracking-wider p-3 rounded-xl border border-amber-700/50 focus:border-[#C9A34E] focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                  </div>

                  {/* RIGHT COLUMN: Economics, Prize Distribution & Rules Preset */}
                  <div className="lg:col-span-5 space-y-6">
                    
                    {/* Card 5: Economics & Slots */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> 4. Economics & Slots
                        </h3>
                        <span className="text-[10px] text-[#777278] font-bold">Fees & Rewards</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                            Entry Fee (₹)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#C9A34E]">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={formEntryFee !== '' && !isNaN(Number(formEntryFee)) ? formEntryFee : ''}
                              onChange={(e) => setFormEntryFee(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                              className="w-full bg-[#171418] text-[#C9A34E] font-extrabold text-sm pl-7 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                            Prize Pool (₹)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#C9A34E]">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={formPrizePool !== '' && !isNaN(Number(formPrizePool)) ? formPrizePool : ''}
                              onChange={(e) => setFormPrizePool(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                              className="w-full bg-[#171418] text-[#C9A34E] font-extrabold text-sm pl-7 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                            Per Kill (₹)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={formPerKillReward !== '' && !isNaN(Number(formPerKillReward)) ? formPerKillReward : ''}
                              onChange={(e) => setFormPerKillReward(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                              className="w-full bg-[#171418] text-white font-bold text-sm pl-7 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] uppercase font-bold text-[#B0ACB0]">
                              Max Slots
                            </label>
                            <span className="text-[10px] text-[#777278] font-bold">
                              {isBgmiSelected ? 'Standard: 100' : 'Standard: 48'}
                            </span>
                          </div>
                          <div className="relative">
                            <Users className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777278]" />
                            <input
                              type="number"
                              min="2"
                              value={formMaxSlots !== '' && !isNaN(Number(formMaxSlots)) ? formMaxSlots : ''}
                              onChange={(e) => setFormMaxSlots(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                              className="w-full bg-[#171418] text-white font-bold text-sm pl-8 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                            />
                          </div>
                          {/* Quick Slot Preset Pills */}
                          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
                            {(isBgmiSelected ? [100, 64, 32, 8] : [48, 24, 12, 8, 2]).map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setFormMaxSlots(preset)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition cursor-pointer ${
                                  formMaxSlots === preset
                                    ? 'bg-[#C9A34E] text-black border-amber-300 shadow-sm'
                                    : 'bg-[#1B181C] text-[#B0ACB0] border-[#29252A] hover:border-[#C9A34E]'
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Revenue Summary Calculated Widget */}
                      <div className="p-3 bg-[#171418] rounded-xl border border-[#29252A] flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-[#777278] block">Max Revenue Potential</span>
                          <span className="font-extrabold text-white">
                            ₹{(Number(formEntryFee || 0) * Number(formMaxSlots || 0)).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-6 w-px bg-[#29252A]" />
                        <div className="space-y-0.5 text-right">
                          <span className="text-[10px] uppercase font-bold text-[#777278] block">Guaranteed Prize</span>
                          <span className="font-extrabold text-[#C9A34E]">
                            ₹{Number(formPrizePool || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 6: Prize Distribution */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <Award className="w-4 h-4" /> 5. Prize Distribution
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            const pool = Number(formPrizePool || 0);
                            if (pool <= 0) {
                              alert("Please enter a total prize pool amount first.");
                              return;
                            }
                            setFormPrizeDistribution([
                              { rankRange: '1st Place', prize: Math.round(pool * 0.5) },
                              { rankRange: '2nd Place', prize: Math.round(pool * 0.3) },
                              { rankRange: '3rd Place', prize: Math.round(pool * 0.2) }
                            ]);
                          }}
                          className="text-[11px] text-[#C9A34E] hover:underline font-extrabold cursor-pointer"
                        >
                          Auto 50/30/20%
                        </button>
                      </div>

                      {/* Rank Quick Add Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFormPrizeDistribution([...formPrizeDistribution, { rankRange: "1st Place", prize: 0 }])}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-950/40 text-amber-400 hover:bg-amber-900/40 border border-amber-800/40 transition active:scale-95 cursor-pointer"
                        >
                          🏆 1st
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPrizeDistribution([...formPrizeDistribution, { rankRange: "2nd Place", prize: 0 }])}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#1B181C] text-[#B0ACB0] hover:text-white border border-[#29252A] transition active:scale-95 cursor-pointer"
                        >
                          🏅 2nd
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPrizeDistribution([...formPrizeDistribution, { rankRange: "3rd Place", prize: 0 }])}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#1B181C] text-[#B0ACB0] hover:text-white border border-[#29252A] transition active:scale-95 cursor-pointer"
                        >
                          🥉 3rd
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPrizeDistribution([...formPrizeDistribution, { rankRange: "Top 10", prize: 0 }])}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#1B181C] text-[#B0ACB0] hover:text-white border border-[#29252A] transition active:scale-95 cursor-pointer"
                        >
                          🎖️ Top 10
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPrizeDistribution([...formPrizeDistribution, { rankRange: "Per Kill", prize: Number(formPerKillReward || 0) }])}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#350A12] text-rose-300 hover:bg-[#4A0D16] border border-[#350A12] transition active:scale-95 cursor-pointer"
                        >
                          🎯 Per Kill
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextRankNum = formPrizeDistribution.length + 1;
                            setFormPrizeDistribution([...formPrizeDistribution, { rankRange: `Rank ${nextRankNum}`, prize: 0 }]);
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-black bg-[#1B181C] text-[#C9A34E] hover:bg-[#C9A34E] hover:text-black border border-[#C9A34E]/30 transition active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Custom
                        </button>
                      </div>

                      {/* Rank rows list */}
                      {formPrizeDistribution.length === 0 ? (
                        <p className="text-xs text-[#777278] italic p-3 bg-[#171418] rounded-xl border border-dashed border-[#29252A] text-center">
                          No custom rank prizes added. Add rank tiers using the buttons above.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto p-2.5 bg-[#171418] rounded-xl border border-[#29252A] custom-scrollbar">
                          {formPrizeDistribution.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.rankRange}
                                onChange={(e) => {
                                  const updated = [...formPrizeDistribution];
                                  updated[idx] = { ...updated[idx], rankRange: e.target.value };
                                  setFormPrizeDistribution(updated);
                                }}
                                placeholder="e.g. 1st Place or Rank 4-10"
                                className="flex-1 bg-[#141215] text-white text-xs px-3 py-2 rounded-lg border border-[#29252A] focus:outline-none"
                              />
                              <div className="flex items-center bg-[#141215] rounded-lg border border-[#29252A] px-2.5 py-2 w-32">
                                <span className="text-xs text-[#C9A34E] mr-1 font-bold">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.prize !== undefined && item.prize !== null && !isNaN(Number(item.prize)) ? item.prize : ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' || isNaN(Number(e.target.value)) ? 0 : Number(e.target.value);
                                    const updated = [...formPrizeDistribution];
                                    updated[idx] = { ...updated[idx], prize: val };
                                    setFormPrizeDistribution(updated);
                                  }}
                                  placeholder="Prize"
                                  className="bg-transparent text-[#C9A34E] font-extrabold text-xs w-full focus:outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => setFormPrizeDistribution(formPrizeDistribution.filter((_, i) => i !== idx))}
                                className="p-2 text-rose-300 hover:text-white bg-rose-600/20 hover:bg-rose-600 rounded-lg border border-rose-500/30 transition cursor-pointer"
                                title="Remove rank"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          
                          <div className="flex items-center justify-between pt-2 border-t border-[#29252A] text-[10px] text-[#B0ACB0] font-bold">
                            <span>Allocated: ₹{formPrizeDistribution.reduce((acc, curr) => acc + (curr.prize || 0), 0)}</span>
                            <span className={Number(formPrizePool || 0) >= formPrizeDistribution.reduce((acc, curr) => acc + (curr.prize || 0), 0) ? 'text-[#C9A34E]' : 'text-[#FF3048]'}>
                              Pool: ₹{formPrizePool || 0}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card 7: Match Rules Preset */}
                    <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 space-y-4 shadow-lg">
                      <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
                        <h3 className="text-xs font-black text-[#C9A34E] uppercase tracking-wider flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4" /> 6. Match Rules & Presets
                        </h3>
                      </div>

                      <div className="space-y-2.5">
                        <select
                          value={selectedRuleTemplateId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedRuleTemplateId(val);
                            if (!val) return;
                            const allPresets = [
                              ...(matchRules || []),
                              ...BUILTIN_RULE_PRESETS
                            ];
                            const selected = allPresets.find((r) => r.id === val);
                            if (selected) {
                              setFormRules(selected.rules);
                            }
                          }}
                          className="w-full bg-[#171418] text-[#C9A34E] text-xs p-3 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E] font-extrabold cursor-pointer"
                        >
                          <option value="">-- Select Saved Rules Template --</option>
                          {matchRules && matchRules.length > 0 && (
                            <optgroup label="Saved Presets (By You)">
                              {matchRules.map((r) => (
                                <option key={r.id} value={r.id} className="bg-[#141215] text-white">
                                  {r.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Standard Default Templates">
                            {BUILTIN_RULE_PRESETS.map((r) => (
                              <option key={r.id} value={r.id} className="bg-[#141215] text-white">
                                {r.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>

                        <textarea
                          rows={6}
                          value={formRules}
                          onChange={(e) => {
                            setFormRules(e.target.value);
                            setSelectedRuleTemplateId('');
                          }}
                          placeholder="Enter or select match rules template above..."
                          className="w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border border-[#29252A] focus:outline-none focus:border-[#C9A34E] leading-relaxed font-mono shadow-inner"
                        />
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            </div>

            {/* Sticky Bottom Action Footer */}
            <footer className="sticky bottom-0 z-30 px-4 sm:px-8 py-3.5 bg-[#141215]/95 backdrop-blur-md border-t border-[#29252A] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-2xl">
              <div className="flex items-center gap-3 text-xs text-[#B0ACB0] w-full sm:w-auto justify-between sm:justify-start">
                <span className="font-extrabold text-white truncate max-w-[200px]">
                  {formTitle ? formTitle.toUpperCase() : 'Untitled Match'}
                </span>
                <span className="text-[#777278]">•</span>
                <span className="text-[#C9A34E] font-extrabold">₹{formEntryFee || 0} Entry</span>
                <span className="text-[#777278]">•</span>
                <span className="text-[#C9A34E] font-extrabold">₹{formPrizePool || 0} Prize</span>
                <span className="text-[#777278]">•</span>
                <span className="text-white font-bold">{formMaxSlots || 48} Slots</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTournament(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  Cancel & Discard
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black shadow-lg shadow-amber-950/40 transition active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Trophy className="w-4 h-4" />
                  <span>{editingTournament ? 'Save Match Changes' : 'Publish Tournament'}</span>
                </button>
              </div>
            </footer>

          </form>

        </div>
      )}

      {/* Manage Categories Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-[#0D0B0D] border border-[#29252A] rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
              <h3 className="text-base font-black text-[#C9A34E] flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#C9A34E]" /> Manage Tournament Categories
              </h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                  setCatNameInput('');
                  setCatDescInput('');
                }}
                className="p-1.5 rounded-xl bg-[#1B181C] text-[#B0ACB0] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create/Edit Category Form */}
            <form onSubmit={handleSaveCategorySubmit} className="p-3.5 rounded-2xl bg-[#141215] border border-[#29252A] space-y-3">
              <h4 className="text-xs font-black text-[#B0ACB0] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#C9A34E]" />
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    required
                    value={catNameInput}
                    onChange={(e) => setCatNameInput(e.target.value)}
                    placeholder="e.g. SQUAD BR, CS SQUAD, 1 VS 1"
                    className="w-full bg-[#0D0B0D] text-white text-xs p-2.5 rounded-xl border border-[#29252A]/60 focus:border-[#C9A34E] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={catDescInput}
                    onChange={(e) => setCatDescInput(e.target.value)}
                    placeholder="e.g. 4v4 Clash Squad Matches"
                    className="w-full bg-[#0D0B0D] text-white text-xs p-2.5 rounded-xl border border-[#29252A]/60 focus:border-[#C9A34E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#B0ACB0]">
                  <input
                    type="checkbox"
                    checked={catActiveInput}
                    onChange={(e) => setCatActiveInput(e.target.checked)}
                    className="rounded bg-[#0D0B0D] border-[#29252A] text-[#C9A34E] focus:ring-amber-400"
                  />
                  <span>Active in App Category Bar</span>
                </label>

                <div className="flex items-center gap-2">
                  {editingCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setCatNameInput('');
                        setCatDescInput('');
                      }}
                      className="px-2.5 py-1 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs shadow-md"
                  >
                    {editingCategory ? 'Update' : 'Add Category'}
                  </button>
                </div>
              </div>
            </form>

            {/* List of Existing Categories */}
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              <p className="text-[10px] uppercase font-bold text-[#777278]">All Active & System Categories</p>
              {categoryOptions.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#141215] border border-[#29252A] text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#C9A34E]">{cat.name}</span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          cat.isActive ? 'bg-[#350A12] text-[#C9A34E] border border-[#29252A]' : 'bg-gray-950 text-gray-400'
                        }`}
                      >
                        {cat.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    {cat.description && <p className="text-[10px] text-[#B0ACB0]/80">{cat.description}</p>}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEditCategory(cat)}
                      className="p-1.5 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white transition"
                      title="Edit Category"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteCategory && (
                      <button
                        onClick={() => onDeleteCategory(cat.id)}
                        className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
                        title="Delete Category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Registered Player Details Modal */}
      {detailsModalTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#0D0B0D] border border-[#29252A] rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between border-b border-[#29252A]/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-[#C9A34E]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-white">Registered Participants</h3>
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-[#1B181C] text-[#B0ACB0] border border-[#29252A]/40">
                      {detailsModalTournament.game || 'Match'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <p className="text-[10px] sm:text-xs text-[#B0ACB0]/80 truncate max-w-xs sm:max-w-md">{detailsModalTournament.title}</p>
                    {(() => {
                      const mId = normalizePublicMatchId(detailsModalTournament.matchId || (detailsModalTournament as any).match_id) || detailsModalTournament.matchId || (detailsModalTournament as any).match_id;
                      if (!mId) return null;
                      const isCopied = copiedText === mId;
                      return (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded tracking-wider select-all">
                            {mId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyValue(mId)}
                            className={`p-1 rounded transition flex items-center gap-1 text-[10px] font-semibold ${
                              isCopied
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-[#777278] hover:text-amber-300 hover:bg-white/5'
                            }`}
                            title="Copy Match ID"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px]">Copied</span>
                              </>
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRefreshModalParticipants(detailsModalTournament.id)}
                  disabled={isRefreshingParticipants}
                  className="px-2.5 py-1.5 rounded-xl bg-[#171418] hover:bg-[#1B181C] border border-[#29252A] text-[#B0ACB0] hover:text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                  title="Refresh participants live from Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingParticipants ? 'animate-spin text-[#C9A34E]' : 'text-[#B0ACB0]'}`} />
                  <span className="hidden sm:inline">{isRefreshingParticipants ? 'Syncing...' : 'Sync Live'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailsModalTournament(null);
                    setPlayerSearchQuery('');
                  }}
                  className="p-1.5 text-[#777278] hover:text-white hover:bg-[#141215]/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Match Metrics Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/30">
                <span className="text-[10px] font-bold text-[#777278] uppercase tracking-wider block">Participants</span>
                <span className="text-sm sm:text-base font-black text-[#C9A34E] font-mono">
                  {(detailsModalTournament.participants || []).length} / {detailsModalTournament.maxSlots || 48}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/30">
                <span className="text-[10px] font-bold text-[#777278] uppercase tracking-wider block">Slots Left</span>
                <span className="text-sm sm:text-base font-black text-[#C9A34E] font-mono">
                  {Math.max(0, (detailsModalTournament.maxSlots || 48) - (detailsModalTournament.participants || []).length)} Available
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/30">
                <span className="text-[10px] font-bold text-[#777278] uppercase tracking-wider block">Prize Pool</span>
                <span className="text-sm sm:text-base font-black text-[#FF3E6C] font-mono">
                  ₹{detailsModalTournament.prizePool}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A]/30">
                <span className="text-[10px] font-bold text-[#777278] uppercase tracking-wider block">Per Kill Reward</span>
                <span className="text-sm sm:text-base font-black text-[#00FFB2] font-mono">
                  ₹{detailsModalTournament.perKillReward || detailsModalTournament.perKillPrize || 0}
                </span>
              </div>
            </div>

            {/* Match Access Code Indicator if enabled */}
            {Boolean(
              detailsModalTournament.requiresAccessCode ||
              (detailsModalTournament as any).requires_access_code ||
              detailsModalTournament.requireAccessCode ||
              (detailsModalTournament as any).require_access_code ||
              ((detailsModalTournament.accessCode || (detailsModalTournament as any).access_code) && String(detailsModalTournament.accessCode || (detailsModalTournament as any).access_code).trim().length > 0)
            ) && (
              <div className="bg-amber-950/30 border border-amber-900/40 p-2.5 rounded-xl flex items-center justify-between text-xs text-[#C9A34E] font-bold px-3">
                <span className="flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-[#C9A34E]" />
                  <span className="uppercase text-[11px] tracking-wider">Required Match Access Code:</span>
                </span>
                <span className="font-mono text-xs text-amber-200 font-black tracking-widest bg-amber-900/50 px-2.5 py-1 rounded-lg border border-amber-700/60">
                  {detailsModalTournament.accessCode || (detailsModalTournament as any).access_code}
                </span>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#777278]" />
              <input
                type="text"
                placeholder="Search by Username, User ID, In-Game Name (IGN), or Email..."
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                className="w-full bg-[#171418] text-white text-xs pl-9 pr-4 py-2.5 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#29252A]/60"
              />
            </div>

            {/* Details Table */}
            <div className="overflow-x-auto border border-[#29252A]/30 rounded-xl bg-[#0D0B0D]">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#171418]/70 border-b border-[#29252A]/35 text-[#B0ACB0] font-extrabold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-14">Slot</th>
                    <th className="py-2.5 px-3">Player / App Username</th>
                    <th className="py-2.5 px-3">User ID</th>
                    <th className="py-2.5 px-3">In-Game Name (IGN)</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Joined Time</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20">
                  {participantError ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-red-400 text-xs px-4">
                        <XCircle className="w-8 h-8 mx-auto mb-2 text-rose-500/70" />
                        <span className="font-bold">Database Query Failure:</span> {participantError}
                        <p className="text-[10px] text-[#777278] mt-1">Please verify Supabase connection, schema definitions, or Row-Level Security (RLS) policies.</p>
                      </td>
                    </tr>
                  ) : isRefreshingParticipants && (!detailsModalTournament.participants || detailsModalTournament.participants.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[#C9A34E] text-xs">
                        <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-[#C9A34E]" />
                        Fetching authoritative registrations...
                      </td>
                    </tr>
                  ) : (!detailsModalTournament.participants || detailsModalTournament.participants.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[#777278] text-xs">
                        <Users className="w-8 h-8 mx-auto mb-2 text-[#E21B36]/40" />
                        No registered participants found for this match yet.
                      </td>
                    </tr>
                  ) : (() => {
                    const filtered = detailsModalTournament.participants.filter(p => {
                      const q = playerSearchQuery.toLowerCase().trim();
                      if (!q) return true;
                      const { email: userEmail, gameIgn, username } = resolveParticipantDetails(p, users, detailsModalTournament);
                      const pUserId = (p.userId || p.id || p.uid || '').toLowerCase();
                      const slotStr = String((p as any).slotNumber || (p as any).slot_number || '');
                      return (
                        username.toLowerCase().includes(q) ||
                        pUserId.includes(q) ||
                        gameIgn.toLowerCase().includes(q) ||
                        userEmail.toLowerCase().includes(q) ||
                        slotStr.includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[#777278] text-xs">
                            No players match your search query "{playerSearchQuery}".
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((p, idx) => {
                      const { email: userEmail, gameIgn, username, userAuthUid } = resolveParticipantDetails(p, users, detailsModalTournament);
                      const rawUserId = p.userId || p.id || p.uid || userAuthUid || 'N/A';
                      const isIgnCopied = copiedText === gameIgn && gameIgn !== 'N/A';
                      const isUserIdCopied = copiedText === rawUserId && rawUserId !== 'N/A';
                      const isEmailCopied = copiedText === userEmail && userEmail !== 'N/A';
                      const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);
                      const regTimeStr = (p as any).registeredAt || (p as any).registered_at || (p as any).createdAt;
                      const formattedRegTime = regTimeStr ? new Date(regTimeStr).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      }) : 'N/A';

                      return (
                        <tr key={rawUserId || idx} className="hover:bg-[#171418]/30 transition text-[#F5F5F5]">
                          <td className="py-3 px-3 font-mono font-black text-[#C9A34E] text-xs">#{slotNo}</td>
                          <td className="py-3 px-3 font-semibold">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#4A0D16] to-[#350A12] flex items-center justify-center font-black text-[11px] text-white shrink-0 border border-[#29252A]">
                                {username.slice(0, 1).toUpperCase()}
                              </div>
                              <span className="truncate max-w-[130px]">{username}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 max-w-[130px]">
                              <span className="font-mono text-[#B0ACB0] text-[11px] truncate" title={rawUserId}>
                                {rawUserId !== 'N/A' && rawUserId.length > 12 ? `${rawUserId.slice(0, 8)}...` : rawUserId}
                              </span>
                              {rawUserId !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(rawUserId)}
                                  className="p-1 rounded bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white transition active:scale-90"
                                  title="Copy User ID"
                                >
                                  {isUserIdCopied ? <Check className="w-3 h-3 text-[#C9A34E]" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-bold">
                            <div className="flex items-center gap-1.5 max-w-[140px]">
                              <span className="truncate text-white" title={gameIgn}>
                                {gameIgn}
                              </span>
                              {gameIgn !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(gameIgn)}
                                  className="p-1 rounded bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white transition active:scale-90"
                                  title="Copy IGN"
                                >
                                  {isIgnCopied ? <Check className="w-3 h-3 text-[#C9A34E]" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 max-w-[135px]">
                              <span className="text-[#B0ACB0] font-mono text-[11px] truncate" title={userEmail}>
                                {userEmail}
                              </span>
                              {userEmail !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(userEmail)}
                                  className="p-1 rounded bg-[#171418] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white transition active:scale-90"
                                  title="Copy Email"
                                >
                                  {isEmailCopied ? <Check className="w-3 h-3 text-[#C9A34E]" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[#B0ACB0] font-mono text-[10px] whitespace-nowrap">
                            {formattedRegTime}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#350A12] text-[#C9A34E] border border-[#29252A]">
                              {(p.status || 'Registered')}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-[#29252A]/20 text-xs text-[#777278]">
              <span className="font-semibold">
                Total Participants: <strong className="text-[#C9A34E]">{(detailsModalTournament.participants || []).length}</strong> / {detailsModalTournament.maxSlots || 48} ({Math.max(0, (detailsModalTournament.maxSlots || 48) - (detailsModalTournament.participants || []).length)} slots left)
              </span>
              <button
                type="button"
                onClick={() => {
                  setDetailsModalTournament(null);
                  setPlayerSearchQuery('');
                }}
                className="px-5 py-2 bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-white font-extrabold uppercase text-xs rounded-xl border border-[#29252A]/40 transition active:scale-95 shadow-lg"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Out List Modal */}
      {resultsListModalTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-[#0D0B0D] border border-emerald-900/40 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between border-b border-emerald-950 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5.5 h-5.5 text-[#C9A34E]" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-[#C9A34E] flex items-center gap-1.5 uppercase tracking-wide">
                      🏆 Match Results Out List
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-[#350A12] text-[#C9A34E] border border-emerald-500/40 uppercase">
                      COMPLETED
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-[#B0ACB0]/80 truncate max-w-md sm:max-w-xl">{resultsListModalTournament.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRefreshResultsList(resultsListModalTournament.id)}
                  disabled={isRefreshingResults}
                  className="p-1.5 text-[#C9A34E] hover:text-white bg-[#350A12] hover:bg-emerald-900/40 border border-[#29252A] rounded-lg transition text-xs flex items-center gap-1 font-bold"
                  title="Refresh Results"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingResults ? 'animate-spin text-[#C9A34E]' : ''}`} />
                  <span className="hidden sm:inline">{isRefreshingResults ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultsListModalTournament(null)}
                  className="p-1.5 text-[#777278] hover:text-white hover:bg-[#141215]/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Info Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#171418]/40 border border-emerald-900/30">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-[#C9A34E]">Total Prize Distributed</span>
                <span className="text-base sm:text-xl font-extrabold text-white mt-1 block">
                  ₹{(resultsListModalTournament.participants || []).reduce((acc, p) => acc + Number(p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount ?? 0), 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#171418]/40 border border-[#29252A]/30">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-[#777278]">Total Registered</span>
                <span className="text-base sm:text-xl font-extrabold text-white mt-1 block">
                  {(resultsListModalTournament.participants || []).length} Players
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/20 col-span-2 sm:col-span-1">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-[#C9A34E]">Winnings Status</span>
                <span className="text-xs font-bold text-amber-200 mt-1 block flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-[#C9A34E] inline" /> Disbursed to Wallets
                </span>
              </div>
            </div>

            {/* Top 3 Winner Highlights (Podium) */}
            {(() => {
              const dedupedList: any[] = [];
              const seen = new Set<string>();
              (resultsListModalTournament.participants || []).forEach((p, idx) => {
                if (!p) return;
                const pUserId = String(p.userId || (p as any).uid || (p as any).userUid || (p as any).id || '').trim();
                const gameUid = String((p as any).inGameId || (p as any).gameUid || pUserId).trim();
                const key = (gameUid && gameUid !== 'N/A') ? gameUid : ((pUserId && pUserId !== 'N/A') ? pUserId : `idx_${idx}`);
                if (!seen.has(key)) {
                  seen.add(key);
                  dedupedList.push(p);
                }
              });

              const sortedWinners = dedupedList.sort((a, b) => {
                const aRank = Number(a.rank ?? (a as any).playerRank ?? (a as any).player_rank ?? (a as any).position ?? 999);
                const bRank = Number(b.rank ?? (b as any).playerRank ?? (b as any).player_rank ?? (b as any).position ?? 999);
                return aRank - bRank;
              }).slice(0, 3);

              if (sortedWinners.length === 0) return null;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {sortedWinners.map((winner, idx) => {
                    const details = resolveParticipantDetails(winner, users, resultsListModalTournament);
                    const rank = Number(winner.rank || (idx + 1));
                    const kills = Number(winner.kills ?? (winner as any).kill ?? 0);
                    const prize = Number(winner.prizeWon ?? (winner as any).prize_won ?? (winner as any).prize ?? (winner as any).winnings ?? 0);

                    const rankColors = [
                      'from-amber-500/20 to-amber-950/40 border-[#C9A34E]/30 text-[#C9A34E]',
                      'from-[#141215]/20 to-[#0D0B0D]/40 border-[#29252A]/40 text-[#B0ACB0]',
                      'from-amber-800/20 to-amber-950/40 border-amber-700/40 text-[#C9A34E]'
                    ];

                    const medalBadges = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];

                    return (
                      <div
                        key={winner.userId || idx}
                        className={`p-3 rounded-xl bg-gradient-to-b border flex flex-col justify-between gap-2 shadow-md ${rankColors[idx] || rankColors[0]}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider">
                            {medalBadges[idx] || `#${rank} Place`}
                          </span>
                          <span className="font-mono text-xs font-black text-[#C9A34E]">
                            +₹{prize}
                          </span>
                        </div>
                        <div>
                          <p className="font-black text-white text-xs truncate">{details.gameIgn || details.username}</p>
                          <p className="text-[10px] text-[#B0ACB0] font-mono truncate">UID: {details.gameUid}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] border-t border-white/10 pt-1.5 text-[#B0ACB0] font-mono">
                          <span>{kills} Kills</span>
                          <span className="text-white font-bold">{details.username}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Filter & Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777278]" />
                <input
                  type="text"
                  placeholder="Search player, IGN, UID, email..."
                  value={resultsSearchQuery}
                  onChange={(e) => setResultsSearchQuery(e.target.value)}
                  className="w-full bg-[#171418] border border-[#29252A] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Copy Summary Button */}
              <button
                type="button"
                onClick={() => {
                  const dedupedList: any[] = [];
                  const seen = new Set<string>();
                  (resultsListModalTournament.participants || []).forEach((p, idx) => {
                    if (!p) return;
                    const pUserId = String(p.userId || (p as any).uid || (p as any).userUid || (p as any).id || '').trim();
                    const gameUid = String((p as any).inGameId || (p as any).gameUid || pUserId).trim();
                    const key = (gameUid && gameUid !== 'N/A') ? gameUid : ((pUserId && pUserId !== 'N/A') ? pUserId : `idx_${idx}`);
                    if (!seen.has(key)) {
                      seen.add(key);
                      dedupedList.push(p);
                    }
                  });

                  const sorted = dedupedList.sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
                  let summary = `🏆 *${resultsListModalTournament.title.toUpperCase()} - MATCH RESULTS* 🏆\n\n`;
                  summary += `🎮 Game: ${resultsListModalTournament.game} (${resultsListModalTournament.matchType})\n`;
                  summary += `💰 Total Prize: ₹${(resultsListModalTournament.participants || []).reduce((acc, p) => acc + Number(p.prizeWon || (p as any).prize_won || 0), 0)}\n\n`;
                  summary += `*LEADERBOARD:*\n`;

                  sorted.forEach((p, idx) => {
                    const details = resolveParticipantDetails(p, users, resultsListModalTournament);
                    const rank = p.rank || (idx + 1);
                    const prize = p.prizeWon || (p as any).prize_won || 0;
                    const kills = p.kills || (p as any).kill || 0;
                    summary += `#${rank} | ${details.gameIgn} (UID: ${details.gameUid}) | ${kills} Kills | ₹${prize}\n`;
                  });

                  summary += `\n✅ Winnings have been credited to WINX7 in-app wallets!`;
                  handleCopyValue(summary);
                }}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1B181C] hover:bg-[#1B181C] text-[#B0ACB0] border border-[#29252A] flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Copy className="w-3.5 h-3.5 text-[#C9A34E]" />
                <span>{copiedText ? 'Copied Summary!' : 'Copy Results Summary'}</span>
              </button>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto border border-[#29252A]/20 rounded-xl bg-[#0D0B0D]">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#171418]/25 border-b border-emerald-950 text-[#C9A34E] font-extrabold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Player / App Username</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Game UID</th>
                    <th className="py-2.5 px-3">In-Game Name (IGN)</th>
                    <th className="py-2.5 px-3 text-center">Kills</th>
                    <th className="py-2.5 px-3 text-right">Prize Disbursed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/10">
                  {(!resultsListModalTournament.participants || resultsListModalTournament.participants.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#777278]">
                        No participant results found.
                      </td>
                    </tr>
                  ) : (() => {
                    const dedupedModalMap = new Map<string, any>();
                    (resultsListModalTournament.participants || []).forEach((p, idx) => {
                      if (!p) return;
                      const pUserId = String(p.userId || (p as any).uid || (p as any).userUid || (p as any).id || '').trim();
                      const gameUid = String((p as any).inGameId || (p as any).gameUid || pUserId).trim();
                      const key = (gameUid && gameUid !== 'N/A') ? gameUid : ((pUserId && pUserId !== 'N/A') ? pUserId : `idx_${idx}`);

                      const kills = Number(p.kills ?? (p as any).kill ?? 0);
                      const prizeWon = Number(p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? 0);
                      const rank = Number(p.rank ?? (idx + 1));
                      const candidate = { ...p, kills, prizeWon, rank };

                      if (!dedupedModalMap.has(key)) {
                        dedupedModalMap.set(key, candidate);
                      } else {
                        const existing = dedupedModalMap.get(key);
                        if (kills > Number(existing.kills || 0) || prizeWon > Number(existing.prizeWon || 0)) {
                          dedupedModalMap.set(key, candidate);
                        }
                      }
                    });
                    const sorted = Array.from(dedupedModalMap.values()).sort((a, b) => {
                      const aRank = Number(a.rank ?? (a as any).playerRank ?? (a as any).player_rank ?? (a as any).position ?? (a as any).resultRank ?? (a as any).result_rank ?? 999);
                      const bRank = Number(b.rank ?? (b as any).playerRank ?? (b as any).player_rank ?? (b as any).position ?? (b as any).resultRank ?? (b as any).result_rank ?? 999);
                      return aRank - bRank;
                    });

                    const filtered = resultsSearchQuery.trim() === '' ? sorted : sorted.filter(p => {
                      const details = resolveParticipantDetails(p, users, resultsListModalTournament);
                      const q = resultsSearchQuery.toLowerCase();
                      return (
                        (details.username && details.username.toLowerCase().includes(q)) ||
                        (details.email && details.email.toLowerCase().includes(q)) ||
                        (details.gameUid && details.gameUid.toLowerCase().includes(q)) ||
                        (details.gameIgn && details.gameIgn.toLowerCase().includes(q)) ||
                        String(p.rank).includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-[#777278]/80">
                            No players matched your search query "{resultsSearchQuery}".
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((p, idx) => {
                      const { email: userEmail, gameUid, gameIgn, username } = resolveParticipantDetails(p, users, resultsListModalTournament);

                      const pRank = Number(p.rank ?? (p as any).playerRank ?? (p as any).player_rank ?? (p as any).position ?? (p as any).resultRank ?? (p as any).result_rank ?? (idx + 1));
                      const pKills = Number(p.kills ?? (p as any).kill ?? (p as any).killCount ?? (p as any).kill_count ?? (p as any).playerKills ?? (p as any).player_kills ?? (p as any).totalKills ?? (p as any).total_kills ?? 0);
                      const pPrize = Number(p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount ?? 0);

                      // Format Rank with Beautiful emoji badges
                      let rankBadge = `${pRank}`;
                      if (pRank === 1) rankBadge = '1ST 🏆';
                      else if (pRank === 2) rankBadge = '2ND 🏅';
                      else if (pRank === 3) rankBadge = '3RD 🏅';
                      else rankBadge = `${pRank}th`;

                      return (
                        <tr key={p.userId || idx} className="hover:bg-[#141215]/10 transition text-[#F5F5F5]">
                          <td className="py-3 px-3 font-extrabold text-[#C9A34E] font-mono">{rankBadge}</td>
                          <td className="py-3 px-3 font-semibold text-white">{username}</td>
                          <td className="py-3 px-3 text-[11px] font-mono text-[#B0ACB0] truncate max-w-[140px]" title={userEmail}>
                            {userEmail}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#B0ACB0]">{gameUid}</td>
                          <td className="py-3 px-3 font-bold text-white">{gameIgn}</td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-[#F5F5F5]">{pKills}</td>
                          <td className="py-3 px-3 text-right font-mono font-black text-[#C9A34E] text-sm">
                            ₹{pPrize}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setResultsListModalTournament(null)}
                className="px-5 py-2 bg-[#C9A34E] hover:bg-emerald-400 text-black font-extrabold uppercase rounded-lg transition"
              >
                Close Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVED IMAGE PICKER MODAL */}
      {showImagePickerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl bg-[#0D0B0D] border border-[#29252A] rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#29252A] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#C9A34E]/20 border border-[#C9A34E]/30 text-[#C9A34E] flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Select Saved Image
                  </h3>
                  <p className="text-[10px] text-[#B0ACB0]/70">
                    Tap any saved image from your library to attach to this match
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowImagePickerModal(false)}
                className="p-1.5 rounded-xl bg-[#1B181C] text-[#B0ACB0] hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search & Game Category filter tabs */}
            <div className="p-3 sm:px-5 bg-[#141215] border-b border-[#29252A] shrink-0 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#777278] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search saved images..."
                  value={imagePickerSearch}
                  onChange={(e) => setImagePickerSearch(e.target.value)}
                  className="w-full bg-[#141215] border border-[#29252A] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
                />
              </div>

              {/* Game category quick filter tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[10px] text-[#777278] uppercase font-bold mr-1">Filter:</span>
                {(['ALL', 'FREE FIRE', 'BGMI'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setImagePickerGameFilter(cat)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition border cursor-pointer ${
                      imagePickerGameFilter === cat
                        ? cat === 'FREE FIRE'
                          ? 'bg-[#FF3048] text-white border-amber-300 shadow-sm'
                          : cat === 'BGMI'
                          ? 'bg-emerald-500 text-black border-emerald-300 shadow-sm'
                          : 'bg-[#C9A34E] text-black border-amber-300 shadow-sm'
                        : 'bg-[#171418] text-[#B0ACB0] border-[#29252A] hover:border-[#777278]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Images Grid */}
            <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1">
              {savedImages.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#141215]/30 border border-[#29252A] text-[#B0ACB0] flex items-center justify-center mx-auto mb-3">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-extrabold text-white uppercase">No Saved Images in Library</h4>
                  <p className="text-xs text-[#B0ACB0]/70 max-w-sm mx-auto mt-1 mb-4">
                    Upload reusable match-card images in the Saved Images section first.
                  </p>
                  {onNavigateToSavedImages && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowImagePickerModal(false);
                        setShowCreateModal(false);
                        onNavigateToSavedImages();
                      }}
                      className="px-4 py-2 rounded-xl bg-[#C9A34E] hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow-lg"
                    >
                      Open Saved Images Section
                    </button>
                  )}
                </div>
              ) : (
                (() => {
                  const filtered = savedImages.filter((img) => {
                    const matchesQuery = img.name.toLowerCase().includes(imagePickerSearch.toLowerCase().trim());
                    if (!matchesQuery) return false;

                    if (imagePickerGameFilter === 'ALL') return true;

                    const imgGame = ((img as any).game || (img as any).category || '').toUpperCase();
                    const imgName = img.name.toUpperCase();

                    if (imagePickerGameFilter === 'FREE FIRE') {
                      return imgGame.includes('FREE') || imgName.includes('FREE') || imgName.includes('FIRE') || imgName.includes('FF');
                    }
                    if (imagePickerGameFilter === 'BGMI') {
                      return imgGame.includes('BGMI') || imgGame.includes('BATTLEGROUND') || imgName.includes('BGMI') || imgName.includes('PUBG');
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-[#B0ACB0]/70">
                        No saved images match "{imagePickerSearch}".
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filtered.map((img) => {
                        const isSelected = formSavedImageId === img.id || formBannerUrl === img.url;

                        return (
                          <div
                            key={img.id}
                            onClick={() => {
                              setFormSavedImageId(img.id);
                              setFormBannerUrl(img.url);
                              setShowImagePickerModal(false);
                            }}
                            className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all flex flex-col bg-[#171418] ${
                              isSelected
                                ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/20'
                                : 'border-[#29252A]/50 hover:border-[#29252A] hover:shadow-md'
                            }`}
                          >
                            <div
                              className="relative w-full aspect-[1.92/1] bg-black/60 overflow-hidden"
                              style={{ aspectRatio: '1.92 / 1' }}
                            >
                              <img
                                src={img.url}
                                alt={img.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                referrerPolicy="no-referrer"
                                onError={(e) => handleImageFallback(e, img.name)}
                              />
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 bg-amber-400 text-black p-1 rounded-full shadow">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}
                            </div>
                            <div className="p-2.5 bg-[#171418]">
                              <p className="text-xs font-black text-white uppercase truncate text-center">
                                {img.name}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:px-5 border-t border-[#29252A] bg-[#141215] flex items-center justify-between shrink-0">
              <span className="text-[10px] text-[#B0ACB0]/60 font-bold">
                {savedImages.length} images available
              </span>
              <button
                type="button"
                onClick={() => setShowImagePickerModal(false)}
                className="px-4 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#FF3048] text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE DUPLICATE MATCH MODAL */}
      {duplicatingTournament && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#141215] border border-[#C9A34E]/40 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#29252A] bg-[#1B181C] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#1B181C] border border-[#C9A34E]/30 text-[#C9A34E] flex items-center justify-center shadow-inner">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Create Duplicate Match
                  </h3>
                  <p className="text-[11px] text-[#B0ACB0]/70">
                    Clones all settings, rules, banner, and fees into a fresh new match
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatingTournament(null)}
                className="p-1.5 text-[#777278] hover:text-white rounded-xl bg-[#1B181C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {/* Target Match Info */}
              <div className="p-3.5 rounded-2xl bg-[#171418] border border-[#29252A]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-[#C9A34E] tracking-wider">Original Match Source</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1B181C] text-[#B0ACB0] font-bold">
                    {duplicatingTournament.game || duplicatingTournament.category}
                  </span>
                </div>
                <h4 className="text-sm font-black text-white">{duplicatingTournament.title}</h4>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 rounded-xl bg-[#171418] border border-[#29252A]">
                    <span className="text-[10px] text-[#777278] block">Entry Fee</span>
                    <span className="font-extrabold text-[#C9A34E]">₹{duplicatingTournament.entryFee}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#171418] border border-[#29252A]">
                    <span className="text-[10px] text-[#777278] block">Prize Pool</span>
                    <span className="font-extrabold text-[#C9A34E]">₹{duplicatingTournament.prizePool}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#171418] border border-[#29252A]">
                    <span className="text-[10px] text-[#777278] block">Max Slots</span>
                    <span className="font-extrabold text-[#C9A34E]">{duplicatingTournament.maxSlots || 48}</span>
                  </div>
                </div>
              </div>

              {/* Date & Time Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#C9A34E]" />
                  <span>Select New Match Schedule (Date & Time)</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={duplicateStartTime}
                  onChange={(e) => setDuplicateStartTime(e.target.value)}
                  className="w-full bg-[#171418] border border-[#29252A] rounded-2xl px-4 py-3 text-sm text-white font-bold focus:outline-none focus:border-[#C9A34E] focus:ring-2 focus:ring-[#C9A34E]/20 shadow-inner"
                />

                {duplicateStartTime && (
                  <div className="mt-1.5 text-xs text-[#00FFB2] font-black flex items-center gap-1.5 px-1">
                    <span className="shrink-0 text-[#777278] font-normal uppercase text-[10px]">Selected Schedule:</span>
                    <span>{(() => {
                      try {
                        const d = new Date(duplicateStartTime);
                        if (isNaN(d.getTime())) return duplicateStartTime;
                        const datePart = new Intl.DateTimeFormat('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }).format(d);
                        const timePart = new Intl.DateTimeFormat('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }).format(d);
                        return `${datePart} at ${timePart} (IST)`;
                      } catch (e) {
                        return duplicateStartTime;
                      }
                    })()}</span>
                  </div>
                )}

                {/* Quick Shift buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-[#777278]">Quick set:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black text-[10px] font-bold border border-[#C9A34E]/30 transition cursor-pointer"
                  >
                    +1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 2 * 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black text-[10px] font-bold border border-[#C9A34E]/30 transition cursor-pointer"
                  >
                    +2 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black text-[10px] font-bold border border-[#C9A34E]/30 transition cursor-pointer"
                  >
                    Tomorrow Same Time
                  </button>
                </div>
              </div>

              {/* Duplicate Safety Guarantees Notice */}
              <div className="p-3.5 rounded-2xl bg-[#171418] border border-[#29252A] space-y-1.5 text-xs text-[#B0ACB0]">
                <p className="font-bold text-[#C9A34E] flex items-center gap-1.5 text-[11px] uppercase">
                  <ShieldCheck className="w-4 h-4 text-[#C9A34E] shrink-0" /> Clean Duplicate Guarantees:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-[#B0ACB0]/80">
                  <li>Creates a brand new match ID in Supabase.</li>
                  <li>Participants, transactions, room IDs, and results are <strong>NOT</strong> copied.</li>
                  {Boolean(
                    duplicatingTournament.requiresAccessCode ||
                    (duplicatingTournament as any).requires_access_code ||
                    duplicatingTournament.requireAccessCode ||
                    (duplicatingTournament as any).require_access_code ||
                    ((duplicatingTournament.accessCode || (duplicatingTournament as any).access_code) && String(duplicatingTournament.accessCode || (duplicatingTournament as any).access_code).trim().length > 0)
                  ) ? (
                    <li className="text-[#C9A34E] font-bold">
                      Access Code is ON: A <strong>BRAND NEW unique Access Code</strong> will be generated automatically. Original code is never reused.
                    </li>
                  ) : (
                    <li>Access Code is OFF: Remains open for public joins.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 sm:p-5 border-t border-[#29252A] bg-[#1B181C] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDuplicatingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-[#1B181C] hover:bg-[#141215]/70 text-[#B0ACB0] text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicateMatch}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Create Duplicate Match</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MATCH CONFIRMATION MODAL */}
      {cancellingTournament && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#141215] border border-[#E21B36]/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#350A12] bg-[#1B181C] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#350A12] border border-orange-500/30 text-[#FF3048] flex items-center justify-center">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Cancel Match?
                  </h3>
                  <p className="text-[11px] text-[#FF3048]/80">
                    Entry fees will be refunded to all joined players
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancellingTournament(null)}
                className="p-1.5 text-[#FF3048] hover:text-white rounded-xl bg-orange-950/40 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#171418] border border-[#350A12] space-y-1.5">
                <span className="text-[10px] uppercase font-black text-[#FF3048] tracking-wider">Target Match</span>
                <h4 className="text-sm font-black text-white">{cancellingTournament.title}</h4>
                <p className="text-xs text-[#B0ACB0]">
                  {cancellingTournament.game} • {formatStartTime(cancellingTournament.startTime)}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-[#29252A] text-xs">
                  <span className="text-[#B0ACB0]">Joined Players:</span>
                  <span className="font-extrabold text-[#C9A34E]">{cancellingTournament.filledSlots || (cancellingTournament.participants || []).length}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-orange-950/40 border border-orange-800/40 text-xs text-orange-200 space-y-1">
                <p className="font-extrabold text-[#FF3048] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#FF3048] shrink-0" /> Warning
                </p>
                <p className="text-[11px] text-orange-200/90 leading-relaxed">
                  Cancelling this match will update its status to CANCELLED and automatically refund the full entry fee (₹{cancellingTournament.entryFee}) back to each participant's wallet balance.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-[#350A12] bg-[#1B181C] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancellingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-[#1B181C] hover:bg-[#141215]/70 text-[#B0ACB0] text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={isCancellingMatch === cancellingTournament.id}
                onClick={async () => {
                  if (!onCancelMatchAndRefund) return;
                  const matchId = cancellingTournament.id;
                  setIsCancellingMatch(matchId);
                  try {
                    await onCancelMatchAndRefund(matchId);
                    setCancellingTournament(null);
                  } catch (err: any) {
                    alert(err.message || 'Failed to cancel match.');
                  } finally {
                    setIsCancellingMatch(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-lg shadow-orange-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <XCircle className={`w-4 h-4 ${isCancellingMatch === cancellingTournament.id ? 'animate-spin' : ''}`} />
                <span>{isCancellingMatch === cancellingTournament.id ? 'Refunding...' : 'Yes, Cancel & Refund'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MATCH CONFIRMATION MODAL */}
      {deletingTournament && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#141215] border border-[#E21B36]/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#350A12] bg-[#1B181C] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Delete Match?
                  </h3>
                  <p className="text-[11px] text-rose-300/80">
                    This action cannot be undone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTournament(null)}
                className="p-1.5 text-rose-400 hover:text-white rounded-xl bg-rose-950/40 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#171418] border border-[#350A12] space-y-1.5">
                <span className="text-[10px] uppercase font-black text-rose-400 tracking-wider">Target Match</span>
                <h4 className="text-sm font-black text-white">{deletingTournament.title}</h4>
                <p className="text-xs text-[#B0ACB0]">
                  {deletingTournament.game} • {formatStartTime(deletingTournament.startTime)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-rose-950/40 border border-[#350A12] text-xs text-rose-200 space-y-1">
                <p className="font-extrabold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" /> Permanent Deletion
                </p>
                <p className="text-[11px] text-rose-200/90 leading-relaxed">
                  Are you sure you want to permanently delete this match? It will be removed from all lists and records. If players have joined, consider Cancelling and Refunding first instead.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-[#350A12] bg-[#1B181C] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-[#1B181C] hover:bg-[#141215]/70 text-[#B0ACB0] text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTournament(deletingTournament.id);
                  setDeletingTournament(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Permanently Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
