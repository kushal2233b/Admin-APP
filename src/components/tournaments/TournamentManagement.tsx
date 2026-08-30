import React, { useState, useEffect } from 'react';
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
import { Upload, Eye, Copy, Search, RefreshCw, Clock, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMatchParticipantsFromSupabase, getMatchDateTimeStrings } from '../../services/supabaseService';
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
  Zap
} from 'lucide-react';

interface TournamentManagementProps {
  tournaments: Tournament[];
  categories?: MatchCategory[];
  banners?: Banner[];
  matchRules?: MatchRulesPreset[];
  users?: AppUser[];
  onAddBanner?: (banner: Omit<Banner, 'id' | 'createdAt'>) => void;
  onDeleteBanner?: (id: string) => void;
  onCreateTournament: (tournament: Omit<Tournament, 'id' | 'createdAt' | 'filledSlots' | 'participants'>) => void;
  onUpdateTournament: (tournament: Tournament) => void;
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

export function resolveParticipantDetails(p: any, users: AppUser[] = []) {
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

  // Handle case where parsedP is a primitive string or number (e.g. "uid_xyz" or "123456")
  if (typeof parsedP === 'string' || typeof parsedP === 'number') {
    const pStr = String(parsedP).trim();
    const pLower = pStr.toLowerCase();

    const matchedUser = users.find(u => {
      if (!u) return false;
      const uId = (u.id || '').toLowerCase().trim();
      const uUid = (u.uid || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uInGameId = (u.inGameId || '').toLowerCase().trim();
      const uInGameName = (u.inGameName || '').toLowerCase().trim();
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
      return {
        matchedUser,
        email: matchedUser.email || 'N/A',
        gameUid: matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : (matchedUser.uid || matchedUser.id || 'N/A'),
        gameIgn: matchedUser.inGameName !== 'N/A' ? matchedUser.inGameName : (matchedUser.username || 'N/A'),
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

  // Extract all possible variations of fields from object parsedP
  const pUserId = (parsedP.userId || parsedP.user_id || parsedP.userUid || parsedP.user_uid || parsedP.uid || parsedP.id || parsedP.playerId || parsedP.player_id || parsedP.account_id || parsedP.accountId || '').toString().trim();
  const pEmail = (parsedP.email || parsedP.userEmail || parsedP.user_email || parsedP.mail || '').toString().trim();
  const pPhone = (parsedP.phone || parsedP.userPhone || parsedP.user_phone || parsedP.mobile || '').toString().trim();
  const pUsername = (parsedP.username || parsedP.user_name || parsedP.displayName || parsedP.display_name || parsedP.name || '').toString().trim();

  const pInGameId = (
    parsedP.inGameId ||
    parsedP.inGameIdValue ||
    parsedP.inGameUID ||
    parsedP.gameUid ||
    parsedP.game_uid ||
    parsedP.gameId ||
    parsedP.game_id ||
    parsedP.freeFireId ||
    parsedP.ff_uid ||
    parsedP.ffUid ||
    parsedP.ff_id ||
    parsedP.ffId ||
    parsedP.ignId ||
    parsedP.ign_id ||
    parsedP.pubgId ||
    parsedP.bgmiId ||
    parsedP.playerUid ||
    parsedP.playerId ||
    ''
  ).toString().trim();

  const pInGameName = (
    parsedP.inGameName ||
    parsedP.inGameNameValue ||
    parsedP.ign ||
    parsedP.gameName ||
    parsedP.game_name ||
    parsedP.freeFireName ||
    parsedP.ffName ||
    parsedP.ff_name ||
    parsedP.playerName ||
    parsedP.player_name ||
    parsedP.gamerName ||
    parsedP.name ||
    parsedP.displayName ||
    parsedP.display_name ||
    ''
  ).toString().trim();

  // Find matching user in users collection
  const matchedUser = users.find(u => {
    if (!u) return false;

    const uUid = (u.uid || u.id || '').toString().toLowerCase().trim();
    if (pUserId && uUid && pUserId.toLowerCase() === uUid) return true;

    const uEmail = (u.email || '').toString().toLowerCase().trim();
    if (pEmail && uEmail && pEmail.toLowerCase() === uEmail) return true;

    const uPhone = (u.phone || '').toString().trim();
    if (pPhone && uPhone && pPhone === uPhone) return true;

    const uInGameId = (u.inGameId || (u as any).ffUid || (u as any).ignId || '').toString().toLowerCase().trim();
    if (pInGameId && uInGameId && pInGameId.toLowerCase() === uInGameId) return true;

    const uUsername = (u.username || (u as any).displayName || '').toString().toLowerCase().trim();
    if (pUsername && uUsername && pUsername.toLowerCase() === uUsername) return true;

    const uInGameName = (u.inGameName || (u as any).ign || '').toString().toLowerCase().trim();
    if (pInGameName && uInGameName && pInGameName.toLowerCase() === uInGameName) return true;

    return false;
  });

  // Extract final Email
  const email = pEmail || matchedUser?.email || 'N/A';

  // Extract final In-Game UID (Free Fire UID / Game ID)
  let gameUid = matchedUser?.inGameId && matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId :
                (matchedUser as any)?.ffUid ? (matchedUser as any).ffUid :
                (matchedUser as any)?.ignId ? (matchedUser as any).ignId :
                (matchedUser as any)?.gameId ? (matchedUser as any).gameId :
                pInGameId;

  if (!gameUid || gameUid === 'N/A') {
    if (parsedP.uid && parsedP.uid !== pUserId && parsedP.uid !== 'N/A') {
      gameUid = parsedP.uid;
    } else if (matchedUser?.uid && matchedUser.uid !== 'N/A') {
      gameUid = matchedUser.uid;
    } else {
      gameUid = pUserId !== '' ? pUserId : 'N/A';
    }
  }

  // Extract final In-Game Name (IGN)
  let gameIgn = matchedUser?.inGameName && matchedUser.inGameName !== 'N/A' ? matchedUser.inGameName :
                (matchedUser as any)?.ign ? (matchedUser as any).ign :
                (matchedUser as any)?.gameName ? (matchedUser as any).gameName :
                (matchedUser as any)?.freeFireName ? (matchedUser as any).freeFireName :
                (pInGameName && !pInGameName.toLowerCase().startsWith('player ')) ? pInGameName :
                '';

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
    (pUsername && !pUsername.toLowerCase().startsWith('player ')) ? pUsername :
    (email !== 'N/A' ? email.split('@')[0] : (pUsername || 'Player'));

  // Extract User Auth UID - prefer valid UUID from match or user
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
  onNavigateToSavedImages
}) => {
  const { currentUser } = useAuth();
  const [filterGame, setFilterGame] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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
      version: '1.0'
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
5. In-Game Name & Game UID must match registered account details exactly.`
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

  // Maps
  const freeFireMaps: MapType[] = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra', 'Solitary', 'Bermuda Remastered', 'CS Arena', 'Iron Cage', 'Craftland'];

  const categoryOptions = categories || [];

  // New Match Form State
  const [formTitle, setFormTitle] = useState('');
  const [formGame, setFormGame] = useState<GameCategory | ''>('');
  const [formSavedImageId, setFormSavedImageId] = useState<string>('');
  const [formBannerUrl, setFormBannerUrl] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState<boolean>(false);
  const [imagePickerSearch, setImagePickerSearch] = useState<string>('');

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

  // Automatically synchronize formGame with active categoryOptions if empty or invalid
  useEffect(() => {
    if (categoryOptions && categoryOptions.length > 0) {
      const exists = categoryOptions.some(c => c.name === formGame || c.id === formGame);
      if (!formGame || !exists) {
        setFormGame(categoryOptions[0].name as GameCategory);
      }
    }
  }, [categories, categoryOptions, formGame]);

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
    const game = t.game || '';
    const matchesGame = filterGame === 'all' || game === filterGame || (filterGame === 'ALL BR' && game.includes('BR'));
    
    const tStatus = (t.status || '').toLowerCase();
    const isCompleted = tStatus === 'finished' || tStatus === 'completed' || (t as any).results_published === true || Boolean((t as any).completedAt || (t as any).completed_at);
    const isCancelled = tStatus === 'cancelled';

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

    return matchesGame && matchesStatus;
  }).sort((a, b) => {
    if (filterStatus === 'finished') {
      const timeA = new Date(a.completedAt || (a as any).completed_at || (a as any).finishedAt || a.updatedAt || a.createdAt || a.startTime || 0).getTime();
      const timeB = new Date(b.completedAt || (b as any).completed_at || (b as any).finishedAt || b.updatedAt || b.createdAt || b.startTime || 0).getTime();
      return timeB - timeA; // Newest completedAt first
    }
    const timeA = new Date(a.startTime || a.createdAt || 0).getTime();
    const timeB = new Date(b.startTime || b.createdAt || 0).getTime();
    return timeA - timeB;
  });



  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const activeCategories = (categories && categories.length > 0) ? categories : categoryOptions;
    let selectedCatObj = activeCategories.find(c => c.name === formGame || c.id === formGame);
    if (!selectedCatObj && formGame) {
      selectedCatObj = activeCategories.find(c => c.name.toLowerCase() === String(formGame).toLowerCase());
    }
    if (!selectedCatObj) {
      selectedCatObj = activeCategories[0];
    }

    const catName = selectedCatObj ? selectedCatObj.name : (formGame || 'FREE FIRE');
    const catId = selectedCatObj ? selectedCatObj.id : (catName as string);
    const finalFormat = formMatchType || 'Solo';
    const selectedMap = (formMap && formMap.trim()) ? formMap.trim() : 'Bermuda';

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

    const defaultCategoryBanner = getCategoryBannerImage(catName, categories);
    const finalBannerUrl = (formBannerUrl && formBannerUrl.trim()) ? formBannerUrl.trim() : defaultCategoryBanner;
    const finalSavedImageId = formSavedImageId || undefined;

    const finalRequireAccessCode = Boolean(formRequireAccessCode);
    const finalAccessCode = finalRequireAccessCode
      ? ((formAccessCode && formAccessCode.trim()) ? formAccessCode.trim() : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase()))
      : '';

    const selectedStartTime = formStartTime || getCurrentLocalDateTimeString();
    const dtInfo = getMatchDateTimeStrings(selectedStartTime);

    if (editingTournament) {
      onUpdateTournament({
        ...editingTournament,
        title: (formTitle || 'UNTITLED MATCH').toUpperCase(),
        game: catName as GameCategory,
        category: catName as GameCategory,
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
        maxSlots: Number(formMaxSlots || 48),
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
    } else {
      onCreateTournament({
        title: (formTitle || 'NEW MATCH').toUpperCase(),
        game: catName as GameCategory,
        category: catName as GameCategory,
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
        maxSlots: Number(formMaxSlots || 48),
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
    }
    setShowCreateModal(false);
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
    setFormGame(match.game || (categoryOptions[0]?.name as GameCategory || 'FREE FIRE'));
    setFormSavedImageId(match.savedImageId || '');
    const currentImg = match.bannerUrl || (match as any).imageUrl || (match as any).card_image || (match as any).thumbnailUrl || (match as any).banner || '';
    setFormBannerUrl(currentImg);
    setFormMatchType(match.matchType || 'Solo');
    setFormMap(match.map || 'Bermuda');
    setFormEntryFee(match.entryFee);
    setFormPrizePool(match.prizePool);
    setFormPerKillReward(match.perKillReward);
    setFormStartTime(formatForDateTimeLocal(match.startTime));
    setFormMaxSlots(match.maxSlots);
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
    
    // Format actual date/time: e.g. "03 Aug, 09:00 PM"
    let dateStr = '';
    try {
      dateStr = start.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
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
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-[#0F0D24] border border-purple-900/30 shadow-xl">
        {/* Top-Left Logo / Brand info */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-600 via-[#1C1540] to-[#FFA41C] p-[1.5px] shadow-lg flex items-center justify-center">
            <div className="w-full h-full bg-[#0F0D1A] rounded-full flex items-center justify-center font-black text-amber-400 text-lg">
              X
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 font-sans uppercase">
                WIN X7
              </span>
            </div>
            <p className="text-[10px] text-amber-500/90 font-black tracking-widest uppercase -mt-0.5">
              Admin Portal
            </p>
          </div>
        </div>

        {/* Top-Right Action: Create Match */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-800/40 font-bold text-xs transition active:scale-95"
          >
            <Tag className="w-4 h-4 text-amber-400" />
            <span>Categories ({(categories || []).length})</span>
          </button>

          <button
            onClick={() => {
              setEditingTournament(null);
              setFormTitle('');
              setFormGame(categoryOptions[0]?.name as GameCategory || '');
              setFormMatchType('Solo');
              setFormMap('Bermuda');
              setFormEntryFee(0);
              setFormPrizePool(0);
              setFormPerKillReward(0);
              setFormStartTime(getCurrentLocalDateTimeString());
              setFormMaxSlots(48);
              setFormRequireAccessCode(false);
              setFormAccessCode('');
              if (matchRules && matchRules.length > 0) {
                setSelectedRuleTemplateId(matchRules[0].id);
                setFormRules(matchRules[0].rules);
              } else {
                setSelectedRuleTemplateId(BUILTIN_RULE_PRESETS[0].id);
                setFormRules(BUILTIN_RULE_PRESETS[0].rules);
              }
              setFormPrizeDistribution([]);
              setFormSavedImageId('');
              setFormBannerUrl('');
              setIsTimeManual(false); // Reset to false to start live syncing!
              setShowCreateModal(true);
            }}
            className="flex items-center justify-center gap-1 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[#FFA41C] hover:bg-amber-400 text-black font-black text-xs sm:text-xs transition shadow-lg shadow-amber-500/10 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Match</span>
          </button>
        </div>
      </div>

      {/* Main Status Navigation Tabs (Slick Bottom-Line Active State) */}
      <div className="flex items-center gap-6 border-b border-purple-950/40 pb-2 overflow-x-auto custom-scrollbar">
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
                  ? 'text-[#FFA41C] border-[#FFA41C]'
                  : 'text-purple-300/60 border-transparent hover:text-purple-100'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Secondary Category Filter Bar (Small Pill row) - Only visible if not on Rules Presets tab */}
      {filterStatus !== 'rules' && (
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 pt-0.5">
          <button
            onClick={() => setFilterGame('all')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
              filterGame === 'all'
                ? 'bg-amber-400 text-black shadow-md font-black'
                : 'text-purple-300 hover:text-white bg-[#120E2E]/60 border border-purple-900/30'
            }`}
          >
            ALL CATEGORIES
          </button>
          {(categories || [])
            .filter(c => c && c.isActive && c.name?.toLowerCase() !== 'all matches' && c.name?.toLowerCase() !== 'all')
            .map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterGame(cat.name)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition ${
                filterGame === cat.name
                  ? 'bg-purple-900/80 text-amber-300 border border-amber-400/30 shadow-md font-extrabold'
                  : 'text-purple-300 hover:text-white bg-[#120E2E]/60 border border-purple-900/30'
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase text-amber-300 bg-purple-950 hover:bg-purple-900 border border-purple-800/60 transition flex-shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Edit Categories</span>
          </button>
        </div>
      )}

      {filterStatus === 'rules' ? (
        <div className="space-y-6">
          <div className="bg-[#120E2E]/60 border border-purple-900/30 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-white text-sm tracking-wide uppercase">
                  {editingRulePreset ? '✏️ Edit Rules Preset' : '✨ Create New Rules Preset'}
                </h3>
                <p className="text-[10px] sm:text-xs text-purple-300 leading-relaxed mt-0.5">
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
                  className="px-3 py-1 bg-purple-900 hover:bg-purple-800 text-purple-200 text-[10px] font-bold rounded-lg transition"
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
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Preset Name / Category
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Clash Squad 4v4 Official, Classic Solo Survival"
                  value={rulePresetName}
                  onChange={(e) => setRulePresetName(e.target.value)}
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Rules Content
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Official Match Rules:&#10;1. Emulator not allowed.&#10;2. PC or tablet not allowed.&#10;3. No teaming/hacking allowed. Violators will be banned."
                  value={rulePresetText}
                  onChange={(e) => setRulePresetText(e.target.value)}
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FFA41C] hover:bg-amber-400 text-black font-black text-xs transition shadow-lg shadow-amber-500/10 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingRulePreset ? 'Update Preset' : 'Save Preset'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Saved Rules List */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs text-purple-300 uppercase tracking-widest px-1">
              Saved Rules Templates ({matchRules.length})
            </h4>

            {matchRules.length === 0 ? (
              <div className="p-8 text-center bg-[#100D28]/40 border border-dashed border-purple-900/30 rounded-2xl text-purple-400 text-xs">
                No rules presets saved yet. Create your first preset above to use it during match hosting.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchRules.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-[#120E2E]/80 border border-purple-900/30 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-purple-800/40 animate-in fade-in duration-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-purple-950/40 pb-1.5 mb-2">
                        <span className="font-extrabold text-amber-300 text-xs truncate max-w-[70%] uppercase">
                          {preset.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingRulePreset(preset);
                              setRulePresetName(preset.name);
                              setRulePresetText(preset.rules);
                            }}
                            className="p-1 rounded bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white transition"
                            title="Edit Preset"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          {onDeleteMatchRule && (
                            <button
                              onClick={() => onDeleteMatchRule(preset.id)}
                              className="p-1 rounded bg-red-950/40 hover:bg-red-900 text-red-400 hover:text-red-200 transition"
                              title="Delete Preset"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-purple-200 whitespace-pre-wrap leading-relaxed">
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
        /* Tournaments Match List (Replicating user image layout exactly) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tournaments.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-[#100D28] rounded-2xl border border-purple-900/30 text-purple-400 text-xs">
            No tournaments available. Create your first tournament.
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-[#100D28] rounded-2xl border border-purple-900/30 text-purple-400 text-xs">
            No tournament matches found in the selected category.
          </div>
        ) : (
          filteredTournaments.map((match) => (
            <div
              key={match.id}
              className="bg-[#120E2E] border border-purple-900/30 rounded-2xl p-4 transition-all shadow-md flex flex-col gap-3 hover:border-purple-800/40"
            >
              
              {/* Card Top: Title and status badge */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-extrabold text-white text-xs tracking-wide truncate max-w-[70%] uppercase">
                  {match.title}
                </h3>
                <span
                  className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border ${
                    match.status === 'live'
                      ? 'bg-rose-950/80 text-rose-400 border-rose-800/40 animate-pulse'
                      : match.status === 'upcoming'
                      ? 'bg-[#1D173C]/60 text-[#B590FF] border-[#B590FF]/30'
                      : ((match.status || '').toLowerCase() === 'finished' || (match.status || '').toLowerCase() === 'completed' || (match as any).results_published)
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : match.status === 'cancelled'
                      ? 'bg-red-950/80 text-red-300 border-red-800/40'
                      : 'bg-gray-950 text-gray-400 border-gray-800'
                  }`}
                >
                  {((match.status || '').toLowerCase() === 'finished' || (match.status || '').toLowerCase() === 'completed' || (match as any).results_published) ? 'COMPLETED' : (match.status || 'UPCOMING').toUpperCase()}
                </span>
              </div>

              {/* Match Card Image / Banner */}
              {(() => {
                const imgUrl = getMatchBannerImage(match, banners, categories);
                if (!imgUrl || imgUrl === 'N/A') return null;
                return (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden bg-black/60 border border-purple-900/40">
                    <img
                      key={`${match.id}_${imgUrl}`}
                      src={imgUrl}
                      alt={match.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleImageFallback(e, match.game || match.title)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#120E2E] via-transparent to-transparent" />
                  </div>
                );
              })()}

              {/* Match Category / Type Badges Bar */}
              <div className="flex flex-wrap items-center gap-1.5 my-1 bg-[#0D0A22] p-2 rounded-xl border border-purple-800/20">
                <div className="bg-amber-950/60 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>{match.game}</span>
                </div>
                <div className="ml-auto bg-indigo-950/80 text-indigo-200 border border-indigo-700/40 px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wider shadow-sm">
                  {match.matchType} • {match.map}
                </div>
              </div>

              {/* Card Stats Grid: Prize, Start remaining/Fee, Players fraction */}
              <div className="grid grid-cols-12 items-center gap-1">
                {/* Left Side: Prize & Start info */}
                <div className="col-span-6 flex flex-col gap-1">
                  <div>
                    <span className="text-[#FFA41C] font-extrabold text-[11px] sm:text-xs uppercase tracking-wide">
                      Prize Pool
                    </span>
                    <span className="text-[#FF3E6C] font-black text-sm ml-2">
                      ₹{match.prizePool}
                    </span>
                  </div>
                  <div className="text-[#00FFB2] font-bold text-[11px] sm:text-xs flex items-center gap-1.5 flex-wrap">
                    <span>{formatStartTime(match.startTime)}</span>
                    <span className="text-purple-800/80 font-normal">•</span>
                    <span>Fee: ₹{match.entryFee}</span>
                  </div>
                </div>

                {/* Middle: Players label */}
                <div className="col-span-3 text-center">
                  <span className="text-purple-300/40 font-extrabold text-[10px] sm:text-[11px] tracking-widest uppercase">
                    Players
                  </span>
                </div>

                {/* Right: Slots Fraction */}
                <div className="col-span-3 text-right">
                  <span className="text-white font-black text-sm tracking-wide h-full">
                    {match.filledSlots}/{match.maxSlots}
                  </span>
                </div>
              </div>

              {/* Spots Slider Progress Bar */}
              <div className="w-full h-1 bg-purple-950/40 rounded-full overflow-hidden border border-purple-900/10">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${isNaN(Number((match.filledSlots / (match.maxSlots || 1)) * 100)) ? 0 : Math.min(100, Math.max(0, (match.filledSlots / (match.maxSlots || 1)) * 100))}%` }}
                />
              </div>

              {/* Collapsible Registered Players List */}
              {match.participants && match.participants.length > 0 ? (
                <div className="mt-2 p-3 rounded-xl bg-[#17123A] border border-purple-900/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-black tracking-wider text-[#FFA41C] flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>Registered Players ({match.participants.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDetailsModalTournament(match)}
                      className="px-2.5 py-1 text-[9px] uppercase font-black tracking-widest bg-amber-400 hover:bg-amber-300 text-black rounded-lg transition duration-200 flex items-center gap-1 active:scale-95"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Details</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                    {match.participants.map((p, pIdx) => {
                      const { gameIgn, gameUid, username } = resolveParticipantDetails(p, users);
                      const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (pIdx + 1);
                      return (
                        <div
                          key={(p as any).userId || (p as any).uid || pIdx}
                          className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-[#0F0D24]/60 border border-purple-800/20 text-[10px]"
                        >
                          <div className="truncate pr-1">
                            <span className="text-amber-400 font-extrabold mr-1 font-mono">#{slotNo}</span>
                            <span className="text-purple-100 font-bold truncate">{username}</span>
                          </div>
                          <span className="text-purple-300/80 font-mono text-[9px] truncate max-w-[45%]" title={`IGN: ${gameIgn} | UID: ${gameUid}`}>
                            {gameIgn !== 'N/A' ? gameIgn : (gameUid !== 'N/A' ? gameUid : 'N/A')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-2 p-2.5 rounded-xl bg-[#17123A]/40 border border-dashed border-purple-900/30 text-center text-purple-400/80 text-[10px]">
                  No players registered in slots yet. (0 / {match.maxSlots} filled)
                </div>
              )}

              {/* Prize Distribution collapsible or inline display */}
              {((match.prizeDistribution && match.prizeDistribution.length > 0) || (match.perKillReward !== undefined && match.perKillReward > 0)) && (
                <div className="mt-2 p-3 rounded-xl bg-[#130F2D] border border-purple-900/35">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>Prize Distribution</span>
                    </span>
                    <span className="text-[9px] text-purple-400 font-bold">Custom Ranks</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                    {/* Display per kill reward badge if set and not explicitly in prizeDistribution array */}
                    {match.perKillReward && match.perKillReward > 0 && !(match.prizeDistribution || []).some((p: any) => {
                      const label = String(p.rankRange || p.rank_range || p.rankName || p.title || '').toLowerCase();
                      return label.includes('kill');
                    }) && (
                      <div className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[10px]">
                        <span className="text-rose-300 font-extrabold truncate mr-1">Per Kill</span>
                        <span className="text-emerald-400 font-black font-mono">₹{match.perKillReward}</span>
                      </div>
                    )}

                    {(match.prizeDistribution || []).map((p: any, pIdx: number) => {
                      const rankLabel = p.rankRange || p.rank_range || p.rankRangeLabel || p.rankName || p.rank_name || p.title || p.label || p.position || p.name || (p.rank ? `Rank ${p.rank}` : `Rank ${pIdx + 1}`);
                      const prizeVal = p.prize ?? p.amount ?? p.winning ?? p.reward ?? 0;
                      return (
                        <div
                          key={pIdx}
                          className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-[#0C0820]/80 border border-purple-800/15 text-[10px]"
                        >
                          <span className="text-purple-200 font-extrabold truncate mr-1">{rankLabel}</span>
                          <span className="text-emerald-400 font-black font-mono">₹{prizeVal}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Match Access Code Badge - Displayed and manageable ONLY when Access Code is ON */}
              {Boolean(
                match.requiresAccessCode ||
                (match as any).requires_access_code ||
                match.requireAccessCode ||
                (match as any).require_access_code ||
                ((match.accessCode || (match as any).access_code) && String(match.accessCode || (match as any).access_code).trim().length > 0)
              ) && (
                <div className="bg-amber-950/30 border border-amber-900/40 p-2 rounded-xl flex items-center justify-between text-xs text-amber-300 font-bold px-3">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>MATCH ACCESS CODE</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-amber-200 font-black tracking-wider bg-amber-900/40 px-2 py-0.5 rounded border border-amber-700/50">
                      {match.accessCode || (match as any).access_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newCode = 'WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase();
                        onUpdateTournament({
                          ...match,
                          requireAccessCode: true,
                          requiresAccessCode: true,
                          requires_access_code: true,
                          accessCode: newCode,
                          access_code: newCode
                        });
                      }}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[10px] font-bold border border-amber-500/40 transition cursor-pointer"
                      title="Regenerate Access Code"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Room Credentials Info banner if active */}
              {match.isRoomReleased && (
                <div className="bg-emerald-950/30 border border-emerald-900/40 p-2 rounded-xl flex items-center justify-between text-xs text-emerald-400 font-bold px-3">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-400" />
                    <span>ROOM ID & PASS DISPATCHED</span>
                  </span>
                  <span className="font-mono text-[11px] text-purple-200">
                    ID: {match.roomId} | PASS: {match.roomPassword}
                  </span>
                </div>
              )}

              {/* Admin Action Bar (Primary actions: Status, Release Room, Winners, Edit, Duplicate, Danger Zone toggle) */}
              <div className="border-t border-purple-950/50 pt-3 flex flex-wrap items-center justify-between gap-2.5 mt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Quick Change Status Dropdown */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400/80 hidden sm:inline">Status:</span>
                    <select
                      value={((match.status || '').toLowerCase() === 'finished' || (match.status || '').toLowerCase() === 'completed' || (match as any).results_published) ? 'completed' : match.status}
                      onChange={(e) =>
                        onUpdateTournament({
                          ...match,
                          status: e.target.value as MatchStatus
                        })
                      }
                      className="bg-[#19143D] hover:bg-[#201A4F] text-purple-200 text-[10.5px] font-extrabold px-2.5 py-1.5 rounded-xl border border-purple-800/40 focus:outline-none transition cursor-pointer"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed" disabled>Completed</option>
                      <option value="cancelled" disabled>Cancelled</option>
                    </select>
                  </div>

                  {/* Release Room credentials trigger */}
                  {((match.status || 'upcoming').toLowerCase() !== 'finished' && (match.status || 'upcoming').toLowerCase() !== 'completed' && !(match as any).results_published && (match.status || 'upcoming').toLowerCase() !== 'cancelled') && (
                    <button
                      onClick={() => {
                        if (activeReleaseRoomId === match.id) {
                          setActiveReleaseRoomId(null);
                        } else {
                          setActiveReleaseRoomId(match.id);
                          setInputRoomId(match.roomId || '');
                          setInputRoomPass(match.roomPassword || '');
                          setActivePublishWinnersId(null);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition active:scale-95 flex items-center gap-1 shadow-md cursor-pointer ${
                        match.isRoomReleased
                          ? 'bg-[#19143D] text-emerald-400 border border-emerald-800/40'
                          : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-500 text-black shadow-amber-500/10'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>{match.isRoomReleased ? 'Dispatched' : 'Release Room'}</span>
                    </button>
                  )}

                  {/* Publish winners / Result Out List trigger */}
                  {((match.status || '').toLowerCase() === 'finished' || (match.status || '').toLowerCase() === 'completed' || (match as any).results_published) ? (
                    <button
                      type="button"
                      onClick={() => setResultsListModalTournament(match)}
                      className="px-3 py-1.5 rounded-xl text-[10.5px] font-black transition active:scale-95 flex items-center gap-1.5 border bg-gradient-to-r from-[#0d2a27] to-[#123834] text-emerald-300 border-emerald-500/50 hover:border-emerald-400 hover:text-emerald-200 shadow-lg shadow-emerald-950/40 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Result Out List</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (activePublishWinnersId === match.id) {
                          setActivePublishWinnersId(null);
                        } else {
                          setActivePublishWinnersId(match.id);
                          const initMap = new Map<string, any>();
                          (match.participants || []).forEach((p, idx) => {
                            const details = resolveParticipantDetails(p, users);
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
                      className="px-2.5 py-1 rounded-xl text-[10px] font-black transition active:scale-95 flex items-center gap-1 border bg-purple-900 hover:bg-purple-800 text-amber-300 border-purple-700/50 shadow-md shadow-purple-950/25 cursor-pointer"
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>Publish Winners</span>
                    </button>
                  )}
                </div>

                {/* Primary Actions: Edit Match & Create Duplicate Match */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(match)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#19143D] hover:bg-[#231C54] text-purple-200 hover:text-white border border-purple-800/50 transition active:scale-95 flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                    title="Edit Match Details"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenDuplicateModal(match)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#19143D] hover:bg-[#231C54] text-purple-200 hover:text-white border border-purple-800/50 transition active:scale-95 flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"
                    title="Create Duplicate Match"
                  >
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Duplicate Match</span>
                  </button>

                  {/* Danger Zone Dropdown Toggle */}
                  <button
                    type="button"
                    onClick={() => setExpandedDangerZoneId(expandedDangerZoneId === match.id ? null : match.id)}
                    className={`px-2 py-1.5 rounded-xl border transition active:scale-95 flex items-center gap-1 text-[10px] font-bold cursor-pointer ${
                      expandedDangerZoneId === match.id
                        ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                        : 'bg-[#140F2E] hover:bg-rose-950/40 text-purple-400 hover:text-rose-300 border-purple-900/50 hover:border-rose-800/40'
                    }`}
                    title="Destructive actions (Cancel, Delete)"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Danger Zone</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${expandedDangerZoneId === match.id ? 'rotate-180 text-rose-300' : 'text-purple-400'}`} />
                  </button>
                </div>
              </div>

              {/* DANGER ZONE / DESTRUCTIVE ACTIONS PANEL (Clearly separated) */}
              {expandedDangerZoneId === match.id && (
                <div className="mt-3 p-3 rounded-2xl bg-[#120B1C] border border-rose-900/50 space-y-2.5 animate-in slide-in-from-top-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-wider text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Danger Zone / Destructive Actions
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedDangerZoneId(null)}
                      className="p-1 text-purple-400 hover:text-white rounded-lg transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Cancel & Refund Action */}
                    {onCancelMatchAndRefund && (match.status !== 'completed' && match.status !== 'finished' && match.status !== 'cancelled') && (
                      <button
                        type="button"
                        onClick={() => setCancellingTournament(match)}
                        className="px-3 py-1.5 rounded-xl bg-orange-950/80 hover:bg-orange-900 text-orange-300 border border-orange-700/50 text-[11px] font-extrabold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                        title="Cancel Match & Refund"
                      >
                        <XCircle className="w-3.5 h-3.5 text-orange-400" />
                        <span>Cancel Match & Refund Players</span>
                      </button>
                    )}

                    {/* Delete Match Action */}
                    <button
                      type="button"
                      onClick={() => setDeletingTournament(match)}
                      className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/50 text-[11px] font-extrabold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                      title="Permanently Delete Match"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Permanently Delete Match</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Release Room Credentials Form Panel */}
              {activeReleaseRoomId === match.id && (
                <div className="mt-3 p-4 rounded-xl bg-[#181338] border border-purple-850 space-y-3.5 animate-in slide-in-from-top-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" /> Enter Game Room ID & Pass
                    </h4>
                    <button
                      onClick={() => setActiveReleaseRoomId(null)}
                      className="text-purple-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-purple-300 mb-1">Room ID</label>
                      <input
                        type="text"
                        required
                        value={inputRoomId}
                        onChange={(e) => setInputRoomId(e.target.value)}
                        placeholder="e.g. 894021"
                        className="w-full bg-[#110D26] text-white text-xs font-mono p-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-purple-300 mb-1">Room Password</label>
                      <input
                        type="text"
                        required
                        value={inputRoomPass}
                        onChange={(e) => setInputRoomPass(e.target.value)}
                        placeholder="e.g. WINX7"
                        className="w-full bg-[#110D26] text-white text-xs font-mono p-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      onClick={() => setActiveReleaseRoomId(null)}
                      className="text-xs text-purple-300 hover:text-white font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (inputRoomId && inputRoomPass) {
                          onReleaseRoomCredentials(match.id, inputRoomId, inputRoomPass);
                          setActiveReleaseRoomId(null);
                        }
                      }}
                      disabled={!inputRoomId || !inputRoomPass}
                      className="px-4 py-1.5 rounded-xl bg-[#FFA41C] text-black font-extrabold text-[11px] hover:bg-amber-400 disabled:opacity-50"
                    >
                      Release Credentials
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Publish Winners Form Panel */}
              {activePublishWinnersId === match.id && (
                <div className="mt-3 p-4 rounded-xl bg-[#181338] border border-purple-850 space-y-3.5 max-h-80 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" /> Enter Rank & Kills For Players
                    </h4>
                    <button
                      onClick={() => setActivePublishWinnersId(null)}
                      className="text-purple-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {(!participantResults || participantResults.length === 0) ? (
                    <div className="p-4 text-center rounded-xl bg-[#110D26] text-purple-400 text-xs">
                      No registered participants inside this match yet.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div className="space-y-3">
                        {participantResults.map((p, idx) => {
                          const { email: userEmail, gameUid, gameIgn, username } = resolveParticipantDetails(p, users);
                          const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);

                          return (
                            <div key={(p as any).userId || (p as any).uid || idx} className="p-3 rounded-xl bg-[#110D26] border border-purple-900/30 space-y-2.5 text-xs animate-in fade-in-30">
                              <div className="flex items-center justify-between font-bold text-purple-200">
                                <span className="text-amber-400">Slot #{slotNo} - {username}</span>
                              </div>

                              {/* Directly display player registration details */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#080517] p-2 rounded-lg border border-purple-950/40 text-[10px] text-purple-300">
                                <div className="truncate"><span className="text-purple-400 font-bold mr-1">Email:</span><span className="text-white font-medium">{userEmail}</span></div>
                                <div className="truncate"><span className="text-purple-400 font-bold mr-1">Game UID:</span><span className="text-amber-300 font-mono font-bold">{gameUid}</span></div>
                                <div className="truncate"><span className="text-purple-400 font-bold mr-1">IGN:</span><span className="text-white font-extrabold">{gameIgn}</span></div>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5">
                                <div>
                                  <label className="block text-[8px] uppercase font-bold text-purple-400 mb-0.5">Rank</label>
                                  <input
                                    type="number"
                                    min="1"
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
                                    className="w-full bg-[#181338] text-white text-xs p-1.5 rounded-lg border border-purple-800/50 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] uppercase font-bold text-purple-400 mb-0.5">Kills</label>
                                  <input
                                    type="number"
                                    min="0"
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
                                    className="w-full bg-[#181338] text-white text-xs p-1.5 rounded-lg border border-purple-800/50 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] uppercase font-bold text-purple-400 mb-0.5">Prize Won (₹)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={p.prizeWon !== undefined && !isNaN(Number(p.prizeWon)) ? p.prizeWon : 0}
                                    onChange={(e) => {
                                      const updated = [...participantResults];
                                      updated[idx] = { ...updated[idx], prizeWon: isNaN(Number(e.target.value)) ? 0 : Number(e.target.value) };
                                      setParticipantResults(updated);
                                    }}
                                    className="w-full bg-[#181338] text-emerald-400 font-bold text-xs p-1.5 rounded-lg border border-purple-800/50 focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-purple-900/40">
                        <div className="text-[10px] text-purple-400">
                          {currentUser?.role === 'staff' ? (
                            <span className="text-amber-300 font-semibold flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-amber-400" /> Staff Mode: Submitting will create a pending Result Request for Admin verification.
                            </span>
                          ) : (
                            <span>Admin Mode: You can publish directly or submit for verification.</span>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActivePublishWinnersId(null)}
                            className="px-3 py-1.5 text-xs text-purple-300 hover:text-white font-medium"
                          >
                            Cancel
                          </button>

                          {/* Staff / Admin Submit for Verification Button */}
                          {onSubmitResultForVerification && (
                            <button
                              type="button"
                              disabled={isSubmittingResults === match.id || ['finished', 'completed'].includes((match.status || '').toLowerCase())}
                              onClick={async () => {
                                if (isSubmittingResults) return;
                                const hasResults = participantResults.some(p => (p.rank || 0) > 0 || (p.kills || 0) > 0 || (p.prizeWon || 0) > 0);
                                if (!hasResults && !confirm('No ranks/kills entered. Submit empty result request?')) {
                                  return;
                                }

                                setIsSubmittingResults(match.id);
                                const enriched = participantResults.map((p, idx) => {
                                  const details = resolveParticipantDetails(p, users);
                                  const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);
                                  const curRank = Number(p.rank || idx + 1);
                                  const curKills = Number(p.kills || 0);
                                  const rawExistingPrize = p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount;
                                  const existingPrizeNum = rawExistingPrize !== undefined && rawExistingPrize !== null ? Number(rawExistingPrize) : 0;
                                  const rankPrize = getPrizeForRank(curRank, match.prizeDistribution || []);
                                  const effectiveRankPrize = rankPrize > 0 ? rankPrize : (curRank === 1 && match.prizePool ? Number(match.prizePool) : 0);
                                  const perKillReward = match.perKillReward && !isNaN(Number(match.perKillReward)) ? Number(match.perKillReward) : 0;
                                  const calculatedTotal = effectiveRankPrize + (curKills * perKillReward);
                                  const finalPrizeWon = existingPrizeNum > 0 ? existingPrizeNum : calculatedTotal;

                                  return {
                                    ...p,
                                    slotNumber: slotNo,
                                    userId: details.userAuthUid !== 'N/A' ? details.userAuthUid : ((p as any).userId || (p as any).uid || (p as any).id || ''),
                                    email: details.email !== 'N/A' ? details.email : ((p as any).email || (p as any).userEmail || ''),
                                    inGameId: details.gameUid !== 'N/A' ? details.gameUid : ((p as any).inGameId || (p as any).gameUid || ''),
                                    inGameName: details.gameIgn !== 'N/A' ? details.gameIgn : ((p as any).inGameName || (p as any).gameIgn || (p as any).ign || ''),
                                    username: details.username || 'Player',
                                    rank: curRank,
                                    kills: curKills,
                                    prizeWon: finalPrizeWon
                                  };
                                });

                                try {
                                  await onSubmitResultForVerification(match.id, enriched);
                                  setActivePublishWinnersId(null);
                                  alert('Match result submitted successfully! Pending Admin verification.');
                                } catch (e: any) {
                                  console.error('Submit for verification failed', e);
                                  alert(`Submission failed: ${e?.message || 'Unknown error'}`);
                                } finally {
                                  setIsSubmittingResults(null);
                                }
                              }}
                              className="px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-950 flex items-center gap-1"
                            >
                              <span>Submit for Admin Verification</span>
                            </button>
                          )}

                          {/* Admin Direct Publish Button */}
                          {currentUser?.role !== 'staff' && (
                            <button
                              type="button"
                              disabled={isSubmittingResults === match.id || ['finished', 'completed'].includes((match.status || '').toLowerCase())}
                              onClick={async () => {
                                if (isSubmittingResults) return;
                                
                                const hasResults = participantResults.some(p => (p.rank || 0) > 0 || (p.kills || 0) > 0 || (p.prizeWon || 0) > 0);
                                if (!hasResults && !confirm('No ranks/kills entered. Are you sure you want to publish empty results?')) {
                                  return;
                                }

                                setIsSubmittingResults(match.id);
                                
                                const enriched = participantResults.map((p, idx) => {
                                  const details = resolveParticipantDetails(p, users);
                                  const slotNo = (p as any).slotNumber || (p as any).slot_number || (p as any).slot || (idx + 1);
                                  const curRank = Number(p.rank || idx + 1);
                                  const curKills = Number(p.kills || 0);

                                  const rawExistingPrize = p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount;
                                  const existingPrizeNum = rawExistingPrize !== undefined && rawExistingPrize !== null ? Number(rawExistingPrize) : 0;

                                  const rankPrize = getPrizeForRank(curRank, match.prizeDistribution || []);
                                  const effectiveRankPrize = rankPrize > 0 ? rankPrize : (curRank === 1 && match.prizePool ? Number(match.prizePool) : 0);
                                  const perKillReward = match.perKillReward && !isNaN(Number(match.perKillReward)) ? Number(match.perKillReward) : 0;
                                  const calculatedTotal = effectiveRankPrize + (curKills * perKillReward);

                                  const finalPrizeWon = existingPrizeNum > 0 ? existingPrizeNum : calculatedTotal;

                                  return {
                                    ...p,
                                    slotNumber: slotNo,
                                    userId: details.userAuthUid !== 'N/A' ? details.userAuthUid : ((p as any).userId || (p as any).uid || (p as any).id || ''),
                                    email: details.email !== 'N/A' ? details.email : ((p as any).email || (p as any).userEmail || ''),
                                    inGameId: details.gameUid !== 'N/A' ? details.gameUid : ((p as any).inGameId || (p as any).gameUid || ''),
                                    inGameName: details.gameIgn !== 'N/A' ? details.gameIgn : ((p as any).inGameName || (p as any).gameIgn || (p as any).ign || ''),
                                    username: details.username || 'Player',
                                    rank: curRank,
                                    kills: curKills,
                                    prizeWon: finalPrizeWon
                                  };
                                });

                                try {
                                  await onPublishMatchResults(match.id, enriched);
                                  setActivePublishWinnersId(null);
                                  setResultsListModalTournament({
                                    ...match,
                                    status: 'completed',
                                    results_published: true,
                                    participants: enriched
                                  });
                                } catch (e: any) {
                                  console.error('Publish failed', e);
                                  alert(`Publish failed: ${e?.message || 'Unknown error'}`);
                                } finally {
                                  setIsSubmittingResults(null);
                                }
                              }}
                              className={`px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] ${
                                isSubmittingResults === match.id || ['finished', 'completed'].includes((match.status || '').toLowerCase())
                                  ? 'bg-gray-500 text-gray-200 cursor-not-allowed'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                              }`}
                            >
                              {isSubmittingResults === match.id ? 'Publishing...' : (['finished', 'completed'].includes((match.status || '').toLowerCase()) ? 'Published' : 'Publish Directly')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          ))
        )}
      </div>
      )}

      {/* Host New Tournament / Edit Tournament Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-[#130F29] border border-purple-850 rounded-3xl shadow-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95">
            
            <div className="flex items-center justify-between p-5 pb-3 border-b border-purple-800/50 shrink-0">
              <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" /> 
                {editingTournament ? 'Edit Tournament Match' : 'Host New Tournament'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTournament(null);
                }}
                className="p-1.5 rounded-xl bg-purple-900/40 text-purple-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-3.5 overflow-y-auto custom-scrollbar">
              
              {/* Game Category & Match Format */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Tournament Category <span className="text-amber-400">*</span>
                  </label>
                  <select
                    required
                    value={formGame || ''}
                    onChange={(e) => setFormGame(e.target.value as GameCategory)}
                    className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none font-bold"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Match Format <span className="text-amber-400">*</span>
                  </label>
                  <select
                    required
                    value={formMatchType || 'Solo'}
                    onChange={(e) => setFormMatchType(e.target.value as MatchType)}
                    className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none font-bold"
                  >
                    <option value="Solo">Solo</option>
                    <option value="Duo">Duo</option>
                    <option value="Squad">Squad</option>
                    <option value="1 VS 1">1 VS 1</option>
                    <option value="2 VS 2">2 VS 2</option>
                    <option value="4 VS 4">4 VS 4 CS</option>
                  </select>
                </div>
              </div>

              {/* SAVED IMAGE / UPLOAD PICKER */}
              <div className="space-y-1.5 bg-[#0F0D24] p-3 rounded-2xl border border-purple-800/40">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] uppercase font-black text-amber-400 tracking-wider">
                    TOURNAMENT IMAGE / BANNER
                  </label>
                  {formBannerUrl && (
                    <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Selected
                    </span>
                  )}
                </div>

                {formBannerUrl ? (
                  <div className="relative flex items-center gap-3 bg-[#1A1538] p-2.5 rounded-xl border border-purple-700/50">
                    <div className="w-20 h-14 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-purple-600/40">
                      <img
                        src={formBannerUrl}
                        alt="Selected Tournament Image"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => handleImageFallback(e, formTitle || 'Tournament Banner')}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white uppercase truncate">
                        {savedImages.find((img) => img.id === formSavedImageId || img.url === formBannerUrl)?.name || 'Tournament Banner'}
                      </p>
                      <p className="text-[10px] text-purple-300/70 truncate">
                        Supabase Storage • Public URL
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowImagePickerModal(true)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase transition"
                      >
                        Library
                      </button>
                      <label className="px-2.5 py-1.5 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 text-[10px] font-black uppercase transition cursor-pointer">
                        <Upload className="w-3 h-3 inline mr-1" />
                        Upload
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
                        className="p-1.5 rounded-lg bg-purple-900/40 hover:bg-rose-900/60 text-purple-300 hover:text-rose-300 border border-purple-800/40 transition"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImagePickerModal(true)}
                      className="py-3 px-3 rounded-xl border-2 border-dashed border-purple-700/60 hover:border-amber-400 bg-[#1A1538]/50 hover:bg-[#1A1538] text-purple-200 hover:text-white transition flex items-center justify-center gap-2 group text-xs font-bold"
                    >
                      <Plus className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      <span>+ Select Saved Image</span>
                    </button>
                    <label
                      className={`py-3 px-3 rounded-xl border-2 border-dashed border-purple-700/60 hover:border-amber-400 bg-[#1A1538]/50 hover:bg-[#1A1538] text-purple-200 hover:text-white transition flex items-center justify-center gap-2 group text-xs font-bold cursor-pointer ${
                        isUploadingImage ? 'opacity-50 cursor-wait' : ''
                      }`}
                    >
                      {isUploadingImage ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                          <span>Upload New Image</span>
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

              {/* Tournament Title */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Match Title <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. #103 DUO PURGATORY NIGHT HUNT"
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none font-bold"
                />
              </div>

              {/* Require Access Code (Optional Per Match) */}
              <div className="bg-[#151030] border border-purple-800/40 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg border ${formRequireAccessCode ? 'bg-amber-400/10 border-amber-400/30 text-amber-400' : 'bg-purple-900/30 border-purple-800/30 text-purple-400'}`}>
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <label htmlFor="toggle-require-access-code" className="text-xs font-black text-white cursor-pointer select-none">
                          Require Access Code
                        </label>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${formRequireAccessCode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-900/40 text-purple-400'}`}>
                          {formRequireAccessCode ? 'ON (Pass Protected)' : 'OFF (Normal Match)'}
                        </span>
                      </div>
                      <p className="text-[10px] text-purple-300/70">
                        {formRequireAccessCode 
                          ? 'Players must enter this unique secret code before joining this match.' 
                          : 'Default: Anyone can join directly without entering an access code.'}
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
                    <div className="w-11 h-6 bg-purple-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-purple-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Expanded Input only when Require Access Code is ON */}
                {formRequireAccessCode && (
                  <div className="pt-2 border-t border-purple-800/30 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-bold text-amber-300">
                        Secret Access Code (Unique Entry Key) <span className="text-amber-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormAccessCode('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Generate Random</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      required={formRequireAccessCode}
                      value={formAccessCode}
                      onChange={(e) => setFormAccessCode(e.target.value)}
                      placeholder="e.g. WINX7-K9Q2"
                      className="w-full bg-[#1A1538] text-amber-300 text-xs font-mono font-bold tracking-wider p-2.5 rounded-xl border border-amber-700/50 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Map & Start Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Map Name <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={
                      freeFireMaps.some(m => m.toLowerCase() === formMap.toLowerCase())
                        ? freeFireMaps.find(m => m.toLowerCase() === formMap.toLowerCase())
                        : 'CUSTOM'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== 'CUSTOM') {
                        setFormMap(val as MapType);
                      }
                    }}
                    className="w-full bg-[#1A1538] text-amber-300 text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400 font-bold cursor-pointer mb-1.5"
                  >
                    {freeFireMaps.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="CUSTOM">✨ Custom Map Name...</option>
                  </select>

                  {(!freeFireMaps.some(m => m.toLowerCase() === formMap.toLowerCase()) || formMap === 'CUSTOM') && (
                    <input
                      type="text"
                      required
                      value={formMap === 'CUSTOM' ? '' : formMap}
                      onChange={(e) => setFormMap(e.target.value as MapType)}
                      placeholder="Enter custom map name..."
                      className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none font-bold"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Start Date & Time <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formStartTime}
                    onChange={(e) => {
                      setIsTimeManual(true);
                      setFormStartTime(e.target.value);
                    }}
                    className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* Entry Fee, Prize Pool, Kill Reward & Slots */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Entry (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formEntryFee !== '' && !isNaN(Number(formEntryFee)) ? formEntryFee : ''}
                    onChange={(e) => setFormEntryFee(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                    className="w-full bg-[#1A1538] text-amber-300 font-bold text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Prize (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPrizePool !== '' && !isNaN(Number(formPrizePool)) ? formPrizePool : ''}
                    onChange={(e) => setFormPrizePool(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                    className="w-full bg-[#1A1538] text-emerald-400 font-bold text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Per Kill (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPerKillReward !== '' && !isNaN(Number(formPerKillReward)) ? formPerKillReward : ''}
                    onChange={(e) => setFormPerKillReward(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                    className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Max Slots
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={formMaxSlots !== '' && !isNaN(Number(formMaxSlots)) ? formMaxSlots : ''}
                    onChange={(e) => setFormMaxSlots(e.target.value === '' || isNaN(Number(e.target.value)) ? '' : Number(e.target.value))}
                    className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Match Rules Selection & Edit */}
              <div className="space-y-2 pt-1 border-t border-purple-800/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <label className="block text-[10px] uppercase font-bold text-purple-300">
                    Match Rules
                  </label>
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
                    className="bg-[#1A1538] text-amber-300 text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400 font-bold cursor-pointer w-full sm:w-auto"
                  >
                    <option value="">-- Select Saved Rules Template --</option>
                    {matchRules && matchRules.length > 0 && (
                      <optgroup label="Saved Presets (By You)">
                        {matchRules.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Standard Default Templates">
                      {BUILTIN_RULE_PRESETS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <textarea
                  rows={5}
                  value={formRules}
                  onChange={(e) => {
                    setFormRules(e.target.value);
                    setSelectedRuleTemplateId('');
                  }}
                  placeholder="Enter or select match rules template above..."
                  className="w-full bg-[#1A1538] text-purple-100 text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400 leading-relaxed font-mono"
                />
              </div>

              {/* Prize Distribution (Ranks and Prize allocation) */}
              <div className="space-y-2 pt-3 border-t border-purple-800/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-[10px] uppercase font-bold text-purple-300">
                    Prize Distribution (by Rank)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "1st Place", prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-yellow-950/40 text-yellow-400 hover:bg-yellow-900/40 border border-yellow-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>🏆 1st Place</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "2nd Place", prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-slate-900/40 text-slate-300 hover:bg-slate-800/40 border border-slate-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>🏅 2nd Place</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "3rd Place", prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-amber-950/40 text-amber-500 hover:bg-[#3d1a08] border border-amber-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>🏅 3rd Place</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "Top 10", prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-purple-950/40 text-purple-300 hover:bg-purple-900/40 border border-purple-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>🎖️ Top 10</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "Winner", prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>👑 Winner</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: "Per Kill", prize: Number(formPerKillReward || 0) }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-rose-950/40 text-rose-300 hover:bg-rose-900/40 border border-rose-800/40 px-2.5 py-1 rounded font-black transition active:scale-95"
                    >
                      <span>🎯 Per Kill</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextRankNum = formPrizeDistribution.length + 1;
                        let suggestedRange = `Rank ${nextRankNum}`;
                        if (nextRankNum === 1) suggestedRange = "1st Place";
                        else if (nextRankNum === 2) suggestedRange = "2nd Place";
                        else if (nextRankNum === 3) suggestedRange = "3rd Place";
                        
                        setFormPrizeDistribution([
                          ...formPrizeDistribution,
                          { rankRange: suggestedRange, prize: 0 }
                        ]);
                      }}
                      className="flex items-center gap-1 text-[10px] bg-purple-900/40 text-amber-400 hover:bg-purple-800/40 border border-purple-800/40 px-2 py-1 rounded font-black transition active:scale-95"
                    >
                      <Plus className="w-3 h-3 text-amber-400" />
                      <span>Custom</span>
                    </button>
                  </div>
                </div>

                {formPrizeDistribution.length === 0 ? (
                  <p className="text-[10px] text-purple-400 italic">
                    No custom prize distribution set. (Default: Prizes are calculated based on Kill rewards, or manual results entry).
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto p-2 bg-[#0B081B] rounded-xl border border-purple-900/60 custom-scrollbar">
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
                          className="flex-1 bg-[#151130] text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-purple-850 focus:outline-none"
                        />
                        <div className="flex items-center bg-[#151130] rounded-lg border border-purple-850 px-2.5 py-1.5 w-28">
                          <span className="text-[10px] text-emerald-400 mr-1">₹</span>
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
                            className="bg-transparent text-emerald-400 font-bold text-[11px] w-full focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormPrizeDistribution(formPrizeDistribution.filter((_, i) => i !== idx));
                          }}
                          className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    
                    {/* Auto calculation checks / quick presets */}
                    <div className="flex items-center justify-between pt-1 border-t border-purple-900/40 text-[9px] text-purple-400">
                      <span>Total custom rank prizes: ₹{formPrizeDistribution.reduce((acc, curr) => acc + (curr.prize || 0), 0)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const pool = Number(formPrizePool || 0);
                          if (pool <= 0) {
                            alert("Please enter a total prize pool amount first.");
                            return;
                          }
                          // Quick distribution of prize pool: 1st gets 50%, 2nd gets 30%, 3rd gets 20%
                          setFormPrizeDistribution([
                            { rankRange: '1st Place', prize: Math.round(pool * 0.5) },
                            { rankRange: '2nd Place', prize: Math.round(pool * 0.3) },
                            { rankRange: '3rd Place', prize: Math.round(pool * 0.2) }
                          ]);
                        }}
                        className="text-amber-400 hover:underline font-bold"
                      >
                        Auto 50%/30%/20% Preset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              </div>

              <div className="p-5 pt-3 border-t border-purple-800/50 flex justify-end gap-2 shrink-0 bg-[#130F29] rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTournament(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black shadow-lg shadow-amber-400/20"
                >
                  {editingTournament ? 'Save Match Changes' : 'Publish Match'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-[#130F29] border border-purple-850 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-purple-800/50">
              <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" /> Manage Tournament Categories
              </h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                  setCatNameInput('');
                  setCatDescInput('');
                }}
                className="p-1.5 rounded-xl bg-purple-900/40 text-purple-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create/Edit Category Form */}
            <form onSubmit={handleSaveCategorySubmit} className="p-3.5 rounded-2xl bg-[#1A1538] border border-purple-800/40 space-y-3">
              <h4 className="text-xs font-black text-purple-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-400" />
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    required
                    value={catNameInput}
                    onChange={(e) => setCatNameInput(e.target.value)}
                    placeholder="e.g. SQUAD BR, CS SQUAD, 1 VS 1"
                    className="w-full bg-[#130F29] text-white text-xs p-2.5 rounded-xl border border-purple-700/60 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={catDescInput}
                    onChange={(e) => setCatDescInput(e.target.value)}
                    placeholder="e.g. 4v4 Clash Squad Matches"
                    className="w-full bg-[#130F29] text-white text-xs p-2.5 rounded-xl border border-purple-700/60 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-purple-200">
                  <input
                    type="checkbox"
                    checked={catActiveInput}
                    onChange={(e) => setCatActiveInput(e.target.checked)}
                    className="rounded bg-[#130F29] border-purple-700 text-amber-400 focus:ring-amber-400"
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
                      className="px-2.5 py-1 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
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
              <p className="text-[10px] uppercase font-bold text-purple-400">All Active & System Categories</p>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A1538] border border-purple-800/30 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-amber-300">{cat.name}</span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          cat.isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-gray-950 text-gray-400'
                        }`}
                      >
                        {cat.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    {cat.description && <p className="text-[10px] text-purple-300/80">{cat.description}</p>}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEditCategory(cat)}
                      className="p-1.5 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-purple-200"
                      title="Edit Category"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteCategory && (
                      <button
                        onClick={() => onDeleteCategory(cat.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400"
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
          <div className="relative w-full max-w-4xl bg-[#0D0B22] border border-purple-900/40 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between border-b border-purple-900/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black text-white">Registered Participants</h3>
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-purple-900/60 text-purple-200 border border-purple-700/40">
                      {detailsModalTournament.game || 'Match'}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-purple-300/80 truncate max-w-md sm:max-w-xl">{detailsModalTournament.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRefreshModalParticipants(detailsModalTournament.id)}
                  disabled={isRefreshingParticipants}
                  className="px-2.5 py-1.5 rounded-xl bg-[#17123A] hover:bg-purple-900/40 border border-purple-800/40 text-purple-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                  title="Refresh participants live from Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingParticipants ? 'animate-spin text-amber-400' : 'text-purple-300'}`} />
                  <span className="hidden sm:inline">{isRefreshingParticipants ? 'Syncing...' : 'Sync Live'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailsModalTournament(null);
                    setPlayerSearchQuery('');
                  }}
                  className="p-1.5 text-purple-400 hover:text-white hover:bg-purple-900/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Match Metrics Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#130F2D] border border-purple-900/30">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Participants</span>
                <span className="text-sm sm:text-base font-black text-amber-400 font-mono">
                  {(detailsModalTournament.participants || []).length} / {detailsModalTournament.maxSlots || 48}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#130F2D] border border-purple-900/30">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Slots Left</span>
                <span className="text-sm sm:text-base font-black text-emerald-400 font-mono">
                  {Math.max(0, (detailsModalTournament.maxSlots || 48) - (detailsModalTournament.participants || []).length)} Available
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#130F2D] border border-purple-900/30">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Prize Pool</span>
                <span className="text-sm sm:text-base font-black text-[#FF3E6C] font-mono">
                  ₹{detailsModalTournament.prizePool}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#130F2D] border border-purple-900/30">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Per Kill Reward</span>
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
              <div className="bg-amber-950/30 border border-amber-900/40 p-2.5 rounded-xl flex items-center justify-between text-xs text-amber-300 font-bold px-3">
                <span className="flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span className="uppercase text-[11px] tracking-wider">Required Match Access Code:</span>
                </span>
                <span className="font-mono text-xs text-amber-200 font-black tracking-widest bg-amber-900/50 px-2.5 py-1 rounded-lg border border-amber-700/60">
                  {detailsModalTournament.accessCode || (detailsModalTournament as any).access_code}
                </span>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-purple-400" />
              <input
                type="text"
                placeholder="Search by Username, User ID, In-Game Name (IGN), Game UID, or Email..."
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                className="w-full bg-[#131032] text-white text-xs pl-9 pr-4 py-2.5 rounded-xl border border-purple-800/40 placeholder-purple-400/50 focus:outline-none focus:border-purple-600/60"
              />
            </div>

            {/* Details Table */}
            <div className="overflow-x-auto border border-purple-900/30 rounded-xl bg-[#080517]">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#131032]/70 border-b border-purple-900/35 text-purple-300 font-extrabold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-14">Slot</th>
                    <th className="py-2.5 px-3">Player / App Username</th>
                    <th className="py-2.5 px-3">User ID</th>
                    <th className="py-2.5 px-3">In-Game Name (IGN)</th>
                    <th className="py-2.5 px-3">Game UID</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Joined Time</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/20">
                  {participantError ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-red-400 text-xs px-4">
                        <XCircle className="w-8 h-8 mx-auto mb-2 text-rose-500/70" />
                        <span className="font-bold">Database Query Failure:</span> {participantError}
                        <p className="text-[10px] text-purple-400 mt-1">Please verify Supabase connection, schema definitions, or Row-Level Security (RLS) policies.</p>
                      </td>
                    </tr>
                  ) : isRefreshingParticipants && (!detailsModalTournament.participants || detailsModalTournament.participants.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-amber-300 text-xs">
                        <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-amber-500" />
                        Fetching authoritative registrations...
                      </td>
                    </tr>
                  ) : (!detailsModalTournament.participants || detailsModalTournament.participants.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-purple-400 text-xs">
                        <Users className="w-8 h-8 mx-auto mb-2 text-purple-500/40" />
                        No registered participants found for this match yet.
                      </td>
                    </tr>
                  ) : (() => {
                    const filtered = detailsModalTournament.participants.filter(p => {
                      const q = playerSearchQuery.toLowerCase().trim();
                      if (!q) return true;
                      const { email: userEmail, gameUid, gameIgn, username } = resolveParticipantDetails(p, users);
                      const pUserId = (p.userId || p.id || p.uid || '').toLowerCase();
                      const slotStr = String((p as any).slotNumber || (p as any).slot_number || '');
                      return (
                        username.toLowerCase().includes(q) ||
                        pUserId.includes(q) ||
                        gameUid.toLowerCase().includes(q) ||
                        gameIgn.toLowerCase().includes(q) ||
                        userEmail.toLowerCase().includes(q) ||
                        slotStr.includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-purple-400 text-xs">
                            No players match your search query "{playerSearchQuery}".
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((p, idx) => {
                      const { email: userEmail, gameUid, gameIgn, username, userAuthUid } = resolveParticipantDetails(p, users);
                      const rawUserId = p.userId || p.id || p.uid || userAuthUid || 'N/A';
                      const isUidCopied = copiedText === gameUid && gameUid !== 'N/A';
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
                        <tr key={rawUserId || idx} className="hover:bg-[#131032]/30 transition text-purple-100">
                          <td className="py-3 px-3 font-mono font-black text-amber-400 text-xs">#{slotNo}</td>
                          <td className="py-3 px-3 font-semibold">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center font-black text-[11px] text-white shrink-0 border border-purple-500/30">
                                {username.slice(0, 1).toUpperCase()}
                              </div>
                              <span className="truncate max-w-[130px]">{username}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 max-w-[130px]">
                              <span className="font-mono text-purple-300 text-[11px] truncate" title={rawUserId}>
                                {rawUserId !== 'N/A' && rawUserId.length > 12 ? `${rawUserId.slice(0, 8)}...` : rawUserId}
                              </span>
                              {rawUserId !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(rawUserId)}
                                  className="p-1 rounded bg-[#131032] hover:bg-purple-900/40 text-purple-300 hover:text-white transition active:scale-90"
                                  title="Copy User ID"
                                >
                                  {isUserIdCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
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
                                  className="p-1 rounded bg-[#131032] hover:bg-purple-900/40 text-purple-300 hover:text-white transition active:scale-90"
                                  title="Copy IGN"
                                >
                                  {isIgnCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 max-w-[135px]">
                              <span className="font-mono font-extrabold text-amber-300 truncate" title={gameUid}>
                                {gameUid}
                              </span>
                              {gameUid !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(gameUid)}
                                  className="p-1 rounded bg-[#131032] hover:bg-purple-900/40 text-purple-300 hover:text-white transition active:scale-90"
                                  title="Copy UID"
                                >
                                  {isUidCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 max-w-[135px]">
                              <span className="text-purple-200 font-mono text-[11px] truncate" title={userEmail}>
                                {userEmail}
                              </span>
                              {userEmail !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyValue(userEmail)}
                                  className="p-1 rounded bg-[#131032] hover:bg-purple-900/40 text-purple-300 hover:text-white transition active:scale-90"
                                  title="Copy Email"
                                >
                                  {isEmailCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-purple-300 font-mono text-[10px] whitespace-nowrap">
                            {formattedRegTime}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
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

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-purple-900/20 text-xs text-purple-400">
              <span className="font-semibold">
                Total Participants: <strong className="text-amber-400">{(detailsModalTournament.participants || []).length}</strong> / {detailsModalTournament.maxSlots || 48} ({Math.max(0, (detailsModalTournament.maxSlots || 48) - (detailsModalTournament.participants || []).length)} slots left)
              </span>
              <button
                type="button"
                onClick={() => {
                  setDetailsModalTournament(null);
                  setPlayerSearchQuery('');
                }}
                className="px-5 py-2 bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-white font-extrabold uppercase text-xs rounded-xl border border-purple-700/40 transition active:scale-95 shadow-lg"
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
          <div className="relative w-full max-w-4xl bg-[#08061B] border border-emerald-900/40 rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between border-b border-emerald-950 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5.5 h-5.5 text-amber-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                      🏆 Match Results Out List
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40 uppercase">
                      COMPLETED
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-purple-300/80 truncate max-w-md sm:max-w-xl">{resultsListModalTournament.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRefreshResultsList(resultsListModalTournament.id)}
                  disabled={isRefreshingResults}
                  className="p-1.5 text-emerald-400 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/40 border border-emerald-800/40 rounded-lg transition text-xs flex items-center gap-1 font-bold"
                  title="Refresh Results"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingResults ? 'animate-spin text-amber-400' : ''}`} />
                  <span className="hidden sm:inline">{isRefreshingResults ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResultsListModalTournament(null)}
                  className="p-1.5 text-purple-400 hover:text-white hover:bg-purple-900/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Info Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-[#112423]/40 border border-emerald-900/30">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-emerald-400">Total Prize Distributed</span>
                <span className="text-base sm:text-xl font-extrabold text-white mt-1 block">
                  ₹{(resultsListModalTournament.participants || []).reduce((acc, p) => acc + Number(p.prizeWon ?? (p as any).prize_won ?? (p as any).prize ?? (p as any).winning ?? (p as any).winnings ?? (p as any).winningAmount ?? (p as any).winning_amount ?? (p as any).prizeAmount ?? (p as any).prize_amount ?? 0), 0)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#19143D]/40 border border-purple-900/30">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-purple-400">Total Registered</span>
                <span className="text-base sm:text-xl font-extrabold text-white mt-1 block">
                  {(resultsListModalTournament.participants || []).length} Players
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/20 col-span-2 sm:col-span-1">
                <span className="block text-[8px] sm:text-[10px] uppercase font-black tracking-wider text-amber-400">Winnings Status</span>
                <span className="text-xs font-bold text-amber-200 mt-1 block flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-amber-400 inline" /> Disbursed to Wallets
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
                    const details = resolveParticipantDetails(winner, users);
                    const rank = Number(winner.rank || (idx + 1));
                    const kills = Number(winner.kills ?? (winner as any).kill ?? 0);
                    const prize = Number(winner.prizeWon ?? (winner as any).prize_won ?? (winner as any).prize ?? (winner as any).winnings ?? 0);

                    const rankColors = [
                      'from-amber-500/20 to-amber-950/40 border-amber-500/40 text-amber-300',
                      'from-slate-400/20 to-slate-900/40 border-slate-400/40 text-slate-200',
                      'from-amber-800/20 to-amber-950/40 border-amber-700/40 text-amber-400'
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
                          <span className="font-mono text-xs font-black text-emerald-400">
                            +₹{prize}
                          </span>
                        </div>
                        <div>
                          <p className="font-black text-white text-xs truncate">{details.gameIgn || details.username}</p>
                          <p className="text-[10px] text-purple-300 font-mono truncate">UID: {details.gameUid}</p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] border-t border-white/10 pt-1.5 text-purple-200 font-mono">
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
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
                <input
                  type="text"
                  placeholder="Search player, IGN, UID, email..."
                  value={resultsSearchQuery}
                  onChange={(e) => setResultsSearchQuery(e.target.value)}
                  className="w-full bg-[#100D28] border border-purple-900/40 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-500/50"
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
                    const details = resolveParticipantDetails(p, users);
                    const rank = p.rank || (idx + 1);
                    const prize = p.prizeWon || (p as any).prize_won || 0;
                    const kills = p.kills || (p as any).kill || 0;
                    summary += `#${rank} | ${details.gameIgn} (UID: ${details.gameUid}) | ${kills} Kills | ₹${prize}\n`;
                  });

                  summary += `\n✅ Winnings have been credited to WINX7 in-app wallets!`;
                  handleCopyValue(summary);
                }}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-[#141030] hover:bg-[#1f1947] text-purple-200 border border-purple-800/40 flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>{copiedText ? 'Copied Summary!' : 'Copy Results Summary'}</span>
              </button>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto border border-purple-900/20 rounded-xl bg-[#050410]">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[#112423]/25 border-b border-emerald-950 text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">
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
                      <td colSpan={7} className="py-8 text-center text-purple-400">
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
                      const details = resolveParticipantDetails(p, users);
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
                          <td colSpan={7} className="py-6 text-center text-purple-400/80">
                            No players matched your search query "{resultsSearchQuery}".
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((p, idx) => {
                      const { email: userEmail, gameUid, gameIgn, username } = resolveParticipantDetails(p, users);

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
                        <tr key={p.userId || idx} className="hover:bg-purple-900/10 transition text-purple-100">
                          <td className="py-3 px-3 font-extrabold text-amber-300 font-mono">{rankBadge}</td>
                          <td className="py-3 px-3 font-semibold text-white">{username}</td>
                          <td className="py-3 px-3 text-[11px] font-mono text-purple-300 truncate max-w-[140px]" title={userEmail}>
                            {userEmail}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-200">{gameUid}</td>
                          <td className="py-3 px-3 font-bold text-white">{gameIgn}</td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-purple-100">{pKills}</td>
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-400 text-sm">
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
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase rounded-lg transition"
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
          <div className="w-full max-w-xl bg-[#130F29] border border-purple-800 rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-purple-800/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Select Saved Image
                  </h3>
                  <p className="text-[10px] text-purple-300/70">
                    Tap any saved image from your library to attach to this match
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowImagePickerModal(false)}
                className="p-1.5 rounded-xl bg-purple-900/40 text-purple-300 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-3 sm:px-5 bg-[#0F0D24] border-b border-purple-900/40 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search saved images..."
                  value={imagePickerSearch}
                  onChange={(e) => setImagePickerSearch(e.target.value)}
                  className="w-full bg-[#1A1538] border border-purple-800/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Images Grid */}
            <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1">
              {savedImages.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-900/30 border border-purple-800/40 text-purple-300 flex items-center justify-center mx-auto mb-3">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-extrabold text-white uppercase">No Saved Images in Library</h4>
                  <p className="text-xs text-purple-300/70 max-w-sm mx-auto mt-1 mb-4">
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
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition shadow-lg"
                    >
                      Open Saved Images Section
                    </button>
                  )}
                </div>
              ) : (
                (() => {
                  const filtered = savedImages.filter((img) =>
                    img.name.toLowerCase().includes(imagePickerSearch.toLowerCase().trim())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-purple-300/70">
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
                            className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all flex flex-col bg-[#161233] ${
                              isSelected
                                ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/20'
                                : 'border-purple-900/50 hover:border-purple-600 hover:shadow-md'
                            }`}
                          >
                            <div className="relative w-full h-28 bg-black/60 overflow-hidden">
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
                            <div className="p-2.5 bg-[#161233]">
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
            <div className="p-3 sm:px-5 border-t border-purple-800/40 bg-[#0F0D24] flex items-center justify-between shrink-0">
              <span className="text-[10px] text-purple-300/60 font-bold">
                {savedImages.length} images available
              </span>
              <button
                type="button"
                onClick={() => setShowImagePickerModal(false)}
                className="px-4 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-white text-xs font-bold"
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
          <div className="w-full max-w-lg bg-[#140F2E] border border-cyan-800/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-purple-800/50 bg-[#1A143D] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-inner">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Create Duplicate Match
                  </h3>
                  <p className="text-[11px] text-purple-300/70">
                    Clones all settings, rules, banner, and fees into a fresh new match
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatingTournament(null)}
                className="p-1.5 text-purple-400 hover:text-white rounded-xl bg-purple-900/40 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {/* Target Match Info */}
              <div className="p-3.5 rounded-2xl bg-[#0E0A22] border border-purple-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-cyan-400 tracking-wider">Original Match Source</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 font-bold">
                    {duplicatingTournament.game || duplicatingTournament.category}
                  </span>
                </div>
                <h4 className="text-sm font-black text-white">{duplicatingTournament.title}</h4>
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2 rounded-xl bg-[#171138] border border-purple-900/40">
                    <span className="text-[10px] text-purple-400 block">Entry Fee</span>
                    <span className="font-extrabold text-amber-400">₹{duplicatingTournament.entryFee}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#171138] border border-purple-900/40">
                    <span className="text-[10px] text-purple-400 block">Prize Pool</span>
                    <span className="font-extrabold text-emerald-400">₹{duplicatingTournament.prizePool}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#171138] border border-purple-900/40">
                    <span className="text-[10px] text-purple-400 block">Max Slots</span>
                    <span className="font-extrabold text-cyan-400">{duplicatingTournament.maxSlots || 48}</span>
                  </div>
                </div>
              </div>

              {/* Date & Time Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span>Select New Match Schedule (Date & Time)</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={duplicateStartTime}
                  onChange={(e) => setDuplicateStartTime(e.target.value)}
                  className="w-full bg-[#18123C] border border-cyan-700/60 rounded-2xl px-4 py-3 text-sm text-white font-bold focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 shadow-inner"
                />

                {/* Quick Shift buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-purple-400">Quick set:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1E1748] hover:bg-cyan-900/40 text-cyan-300 text-[10px] font-bold border border-cyan-800/40 transition cursor-pointer"
                  >
                    +1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 2 * 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1E1748] hover:bg-cyan-900/40 text-cyan-300 text-[10px] font-bold border border-cyan-800/40 transition cursor-pointer"
                  >
                    +2 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
                      setDuplicateStartTime(formatForDateTimeLocal(now.toISOString()));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1E1748] hover:bg-cyan-900/40 text-cyan-300 text-[10px] font-bold border border-cyan-800/40 transition cursor-pointer"
                  >
                    Tomorrow Same Time
                  </button>
                </div>
              </div>

              {/* Duplicate Safety Guarantees Notice */}
              <div className="p-3.5 rounded-2xl bg-[#0F0B24] border border-cyan-900/40 space-y-1.5 text-xs text-purple-200">
                <p className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px] uppercase">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" /> Clean Duplicate Guarantees:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-purple-300/80">
                  <li>Creates a brand new match ID in Supabase.</li>
                  <li>Participants, transactions, room IDs, and results are <strong>NOT</strong> copied.</li>
                  {Boolean(
                    duplicatingTournament.requiresAccessCode ||
                    (duplicatingTournament as any).requires_access_code ||
                    duplicatingTournament.requireAccessCode ||
                    (duplicatingTournament as any).require_access_code ||
                    ((duplicatingTournament.accessCode || (duplicatingTournament as any).access_code) && String(duplicatingTournament.accessCode || (duplicatingTournament as any).access_code).trim().length > 0)
                  ) ? (
                    <li className="text-amber-300 font-bold">
                      Access Code is ON: A <strong>BRAND NEW unique Access Code</strong> will be generated automatically. Original code is never reused.
                    </li>
                  ) : (
                    <li>Access Code is OFF: Remains open for public joins.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 sm:p-5 border-t border-purple-800/40 bg-[#120D2A] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDuplicatingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
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
          <div className="w-full max-w-md bg-[#160E1E] border border-orange-700/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-orange-800/50 bg-[#20111A] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Cancel Match?
                  </h3>
                  <p className="text-[11px] text-orange-300/80">
                    Entry fees will be refunded to all joined players
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancellingTournament(null)}
                className="p-1.5 text-orange-400 hover:text-white rounded-xl bg-orange-950/40 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#0F0712] border border-orange-900/40 space-y-1.5">
                <span className="text-[10px] uppercase font-black text-orange-400 tracking-wider">Target Match</span>
                <h4 className="text-sm font-black text-white">{cancellingTournament.title}</h4>
                <p className="text-xs text-purple-300">
                  {cancellingTournament.game} • {formatStartTime(cancellingTournament.startTime)}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-purple-950 text-xs">
                  <span className="text-purple-300">Joined Players:</span>
                  <span className="font-extrabold text-amber-400">{cancellingTournament.filledSlots || (cancellingTournament.participants || []).length}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-orange-950/40 border border-orange-800/40 text-xs text-orange-200 space-y-1">
                <p className="font-extrabold text-orange-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" /> Warning
                </p>
                <p className="text-[11px] text-orange-200/90 leading-relaxed">
                  Cancelling this match will update its status to CANCELLED and automatically refund the full entry fee (₹{cancellingTournament.entryFee}) back to each participant's wallet balance.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-orange-900/40 bg-[#120815] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancellingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
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
          <div className="w-full max-w-md bg-[#180C14] border border-rose-700/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-rose-800/50 bg-[#240F1D] flex items-center justify-between">
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
              <div className="p-3.5 rounded-2xl bg-[#0E050B] border border-rose-900/40 space-y-1.5">
                <span className="text-[10px] uppercase font-black text-rose-400 tracking-wider">Target Match</span>
                <h4 className="text-sm font-black text-white">{deletingTournament.title}</h4>
                <p className="text-xs text-purple-300">
                  {deletingTournament.game} • {formatStartTime(deletingTournament.startTime)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-200 space-y-1">
                <p className="font-extrabold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" /> Permanent Deletion
                </p>
                <p className="text-[11px] text-rose-200/90 leading-relaxed">
                  Are you sure you want to permanently delete this match? It will be removed from all lists and records. If players have joined, consider Cancelling and Refunding first instead.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-rose-900/40 bg-[#12050D] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingTournament(null)}
                className="px-4 py-2.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 text-xs font-extrabold uppercase tracking-wider transition cursor-pointer"
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
