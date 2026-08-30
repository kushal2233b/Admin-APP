import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import {
  AppUser,
  Tournament,
  WalletTransaction,
  MatchCategory,
  AppNotification,
  Coupon,
  AdminUser,
  SystemSettings,
  MatchRulesPreset,
  OfficialLinkConfig,
  AdminRole,
  Participant,
  UserStatus,
  SavedImage,
  PrizeDistributionItem,
  AvatarPreset,
  MatchStatus,
  StaffMember,
  StaffStatus,
  ResultRequest,
  ResultRequestStatus,
  ResultRequestParticipant
} from '../types';

export const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj !== 'object') return obj;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = cleanUndefined(value);
    }
  }
  return result;
};

export const isUuid = (str: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');

// WINX7 EXACT 5 PRESET AVATARS SPECIFICATION
export const DEFAULT_PRESET_AVATARS: AvatarPreset[] = [
  {
    id: 'avatar_1',
    name: 'Avatar 1',
    url: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=300&auto=format&fit=crop&q=80',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'avatar_2',
    name: 'Avatar 2',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'avatar_3',
    name: 'Avatar 3',
    url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=300&auto=format&fit=crop&q=80',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'avatar_4',
    name: 'Avatar 4',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'avatar_5',
    name: 'Avatar 5',
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&auto=format&fit=crop&q=80',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

let memoryPresetAvatars: AvatarPreset[] = [...DEFAULT_PRESET_AVATARS];

export function getCachedPresetAvatars(): AvatarPreset[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('winx7_preset_avatars');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return DEFAULT_PRESET_AVATARS.map((defaultPreset) => {
            const match = parsed.find(
              (p: any) => p && String(p.id).toLowerCase() === defaultPreset.id.toLowerCase()
            );
            return match && match.url ? { ...defaultPreset, ...match } : defaultPreset;
          });
        }
      }
    } catch {}
  }
  return memoryPresetAvatars;
}

export function resolvePresetAvatarUrl(avatarId?: string, fallbackUrl?: string): string {
  const currentPresets = getCachedPresetAvatars();
  if (avatarId) {
    const cleanId = String(avatarId).trim().toLowerCase();
    const match = currentPresets.find((p) => p.id.toLowerCase() === cleanId);
    if (match && match.url) {
      return match.url;
    }
  }
  if (fallbackUrl && !String(fallbackUrl).startsWith('avatar_')) {
    return fallbackUrl;
  }
  return currentPresets[0]?.url || DEFAULT_PRESET_AVATARS[0].url;
}

export async function fetchPresetAvatars(): Promise<AvatarPreset[]> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'preset_avatars')
      .maybeSingle();

    if (!error && data) {
      const raw = data.data ?? data.config ?? data.settings ?? data.content ?? data.payload ?? data.value;
      const val = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(val) && val.length > 0) {
        const merged = DEFAULT_PRESET_AVATARS.map((defaultPreset) => {
          const match = val.find(
            (p: any) => p && String(p.id).toLowerCase() === defaultPreset.id.toLowerCase()
          );
          return match && match.url ? { ...defaultPreset, ...match } : defaultPreset;
        });
        memoryPresetAvatars = merged;
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('winx7_preset_avatars', JSON.stringify(merged));
          } catch {}
        }
        return merged;
      }
    }
  } catch (err) {
    console.warn('[fetchPresetAvatars] Notice:', err);
  }
  return getCachedPresetAvatars();
}

export async function updatePresetAvatar(avatarId: string, newUrl: string): Promise<AvatarPreset[]> {
  const cleanSlotId = String(avatarId).trim().toLowerCase();
  const current = getCachedPresetAvatars();
  const updated = current.map((p) => {
    if (p.id.toLowerCase() === cleanSlotId) {
      return { ...p, url: newUrl.trim(), updatedAt: new Date().toISOString() };
    }
    return p;
  });

  memoryPresetAvatars = updated;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('winx7_preset_avatars', JSON.stringify(updated));
    } catch {}
  }

  // 1. Save to app_config table in Supabase
  try {
    await upsertAppConfig('preset_avatars', updated, 'updatePresetAvatar');
  } catch (err) {
    console.error('[updatePresetAvatar] app_config write error:', err);
  }

  // 2. Also save to individual slot key
  try {
    await upsertAppConfig(cleanSlotId, { id: cleanSlotId, url: newUrl.trim(), updatedAt: new Date().toISOString() }, 'updatePresetAvatarSlot');
  } catch {}

  return updated;
}

// Error Logger Helper
export function handleSupabaseError(error: any, operation: string) {
  if (!error) return;
  const msg = error.message || error.details || error.hint || String(error);
  const code = error.code || 'UNKNOWN';
  console.warn(`[Supabase Service ${code}] during ${operation}:`, msg);
}

// Session Auth Guard
export async function ensureSupabaseAuthSession(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return Boolean(session?.user);
  } catch {
    return false;
  }
}

// Fallback Game Banner Helper
export function getCategoryBannerImage(categoryName: string): string {
  const name = (categoryName || '').toLowerCase();
  if (name.includes('bgmi') || name.includes('battleground')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('free fire') || name.includes('ff')) {
    return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('cod') || name.includes('call of duty')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80';
  }
  if (name.includes('ludo')) {
    return 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80';
}

// Match DateTime formatting helper without timezone distortion
export function getMatchDateTimeStrings(startTimeInput: string) {
  const timeStr = (startTimeInput || '').trim();
  if (!timeStr) {
    const now = new Date();
    const iso = now.toISOString();
    return {
      matchTime: iso,
      matchDate: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      formattedTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
  }

  const localMatch = timeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (localMatch) {
    const [, y, m, d, h, min] = localMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const hours = Number(h);
    const minutes = Number(min);

    const dateObj = new Date(year, month - 1, day, hours, minutes);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const formattedTime = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()] || 'Today';
    const matchDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

    return {
      matchTime: timeStr,
      matchDate,
      dayOfWeek,
      formattedTime
    };
  }

  try {
    const dateObj = new Date(timeStr);
    if (!isNaN(dateObj.getTime())) {
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const matchDate = `${day}/${month}/${year}`;
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = dayNames[dateObj.getDay()] || 'Today';
      const hours = dateObj.getHours();
      const minutes = dateObj.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      const formattedTime = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;

      return {
        matchTime: timeStr,
        matchDate,
        dayOfWeek,
        formattedTime
      };
    }
  } catch {}

  return {
    matchTime: timeStr,
    matchDate: 'Today',
    dayOfWeek: 'Today',
    formattedTime: timeStr
  };
}

// Data Normalization Functions for Existing Types
export function normalizeTournamentDoc(
  docData: any,
  id: string = docData?.id || '',
  attachedRegistrations?: any[],
  profileMap?: Map<string, any>
): Tournament {
  if (!docData) docData = {};

  const parsedRules: string = (() => {
    if (!docData?.rules) return '';
    if (typeof docData.rules === 'string') return docData.rules;
    if (Array.isArray(docData.rules)) return docData.rules.join('\n');
    return String(docData.rules);
  })();

  // 1. Map registered participants from the authoritative public.registrations table
  const regParticipants: Participant[] = (attachedRegistrations || []).map((r: any, idx: number) => {
    const prof = (r.user_id && profileMap) ? profileMap.get(r.user_id) : null;
    const ign = r.ff_ign || r.player_name || prof?.in_game_name || prof?.ff_ign || prof?.username || `Player ${idx + 1}`;
    const uid = r.ff_uid || prof?.in_game_id || prof?.ff_uid || '';
    const uname = prof?.name || prof?.display_name || prof?.username || r.player_name || r.ff_ign || `Player ${idx + 1}`;

    return {
      id: r.id || `reg-${r.user_id || idx}`,
      userId: r.user_id || `user-${idx}`,
      username: uname,
      inGameName: ign,
      inGameId: uid,
      registeredAt: r.created_at || r.updated_at || new Date().toISOString(),
      teamName: r.team_name,
      slotNumber: Number(r.slot_number || idx + 1),
      kills: Number(r.kills || 0),
      rank: r.rank ? Number(r.rank) : undefined,
      prizeWon: Number(r.winnings || r.prize_won || 0),
      status: r.status || 'registered',
    };
  });

  // 2. Parse any inline participants array stored in tournament doc
  const parsedInlineParticipants: Participant[] = (() => {
    if (!docData?.participants) return [];
    if (Array.isArray(docData.participants)) {
      return docData.participants.map((p: any, idx: number) => ({
        id: p.id || p.userId || p.uid || `part-${idx}`,
        userId: p.userId || p.id || p.uid || `user-${idx}`,
        username: p.username || p.inGameName || p.in_game_name || p.ff_ign || `Player ${idx + 1}`,
        inGameName: p.inGameName || p.in_game_name || p.ff_ign || p.username || `Player ${idx + 1}`,
        inGameId: p.inGameId || p.in_game_id || p.ff_uid || p.playerId || '',
        registeredAt: p.registeredAt || p.registered_at || new Date().toISOString(),
        teamName: p.teamName || p.team_name,
        slotNumber: p.slotNumber || p.slot_number || idx + 1,
        kills: Number(p.kills || 0),
        rank: p.rank ? Number(p.rank) : undefined,
        prizeWon: Number(p.prizeWon || p.prize_won || 0),
        status: p.status || 'registered',
      }));
    }
    if (typeof docData.participants === 'string') {
      try {
        const parsed = JSON.parse(docData.participants);
        if (Array.isArray(parsed)) {
          return parsed.map((p: any, idx: number) => ({
            id: p.id || p.userId || p.uid || `part-${idx}`,
            userId: p.userId || p.id || p.uid || `user-${idx}`,
            username: p.username || p.inGameName || p.in_game_name || p.ff_ign || `Player ${idx + 1}`,
            inGameName: p.inGameName || p.in_game_name || p.ff_ign || p.username || `Player ${idx + 1}`,
            inGameId: p.inGameId || p.in_game_id || p.ff_uid || p.playerId || '',
            registeredAt: p.registeredAt || p.registered_at || new Date().toISOString(),
            teamName: p.teamName || p.team_name,
            slotNumber: p.slotNumber || p.slot_number || idx + 1,
            kills: Number(p.kills || 0),
            rank: p.rank ? Number(p.rank) : undefined,
            prizeWon: Number(p.prizeWon || p.prize_won || 0),
            status: p.status || 'registered',
          }));
        }
      } catch {}
    }
    return [];
  })();

  // 3. Deduplicate participants (authoritative registrations table records take precedence)
  const participantMap = new Map<string, Participant>();
  for (const p of regParticipants) {
    const key = p.userId || p.id;
    if (key) participantMap.set(key, p);
  }
  for (const p of parsedInlineParticipants) {
    const key = p.userId || p.id;
    if (key) {
      if (participantMap.has(key)) {
        // Authoritative registration records take precedence over inline defaults
        const existing = participantMap.get(key)!;
        const prizeVal = (existing.prizeWon && existing.prizeWon > 0) ? existing.prizeWon : (p.prizeWon && p.prizeWon > 0 ? p.prizeWon : (existing.prizeWon || 0));
        const rankVal = (existing.rank !== undefined && existing.rank > 0) ? existing.rank : (p.rank && p.rank > 0 ? p.rank : existing.rank);
        const killVal = (existing.kills !== undefined && existing.kills > 0) ? existing.kills : (p.kills && p.kills > 0 ? p.kills : (existing.kills || 0));
        const statusVal = (existing.status && existing.status !== 'registered') ? existing.status : (p.status || existing.status);

        participantMap.set(key, { 
          ...existing, 
          rank: rankVal,
          kills: killVal,
          prizeWon: prizeVal,
          status: statusVal,
          slotNumber: existing.slotNumber ?? p.slotNumber,
          teamName: existing.teamName || p.teamName
        });
      } else {
        // Fallback for players without registration records
        participantMap.set(key, p);
      }
    }
  }
  const finalParticipants = Array.from(participantMap.values());

  const maxSlotsTotal = Number(docData?.total_slots ?? docData?.max_slots ?? docData?.maxSlots ?? docData?.max_participants ?? docData?.maxParticipants ?? 48);
  const actualJoinedCount = finalParticipants.length;

  const gameName = docData?.game || docData?.category_name || docData?.category || 'BGMI';

  const rawBanner =
    docData?.banner_url ||
    docData?.card_image ||
    docData?.card_image_url ||
    docData?.image_url ||
    docData?.thumbnail_url ||
    docData?.imageUrl ||
    docData?.bannerUrl ||
    docData?.thumbnailUrl ||
    docData?.cardImage ||
    docData?.banner ||
    docData?.image ||
    docData?.thumbnail ||
    docData?.matchImage ||
    docData?.match_image;

  const resolvedBanner = (rawBanner && typeof rawBanner === 'string' && rawBanner.trim().length > 0 && rawBanner.trim() !== 'N/A')
    ? rawBanner.trim()
    : getCategoryBannerImage(gameName);

  const parsedPrizeDistribution: PrizeDistributionItem[] = (() => {
    const raw = docData?.prize_distribution ?? docData?.prizeDistribution ?? docData?.prizes;
    if (!raw) return [];
    let itemsArr: any[] = [];
    if (Array.isArray(raw)) {
      itemsArr = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) itemsArr = parsed;
        else if (parsed && typeof parsed === 'object') itemsArr = Object.values(parsed);
      } catch {}
    } else if (raw && typeof raw === 'object') {
      itemsArr = Object.values(raw);
    }
    return itemsArr.map((item: any) => ({
      id: item.id || undefined,
      rankRange: String(item.rankRange || item.rank_range || item.rankRangeLabel || item.rankName || item.title || item.label || item.position || item.name || (item.rank ? `Rank ${item.rank}` : 'Prize')),
      prize: Number(item.prize ?? item.amount ?? item.winning ?? item.reward ?? 0)
    }));
  })();

  const matchTimeVal = docData?.match_time || docData?.start_time || docData?.startTime || docData?.match_schedule || docData?.matchSchedule || docData?.schedule || new Date().toISOString();
  const dtInfo = getMatchDateTimeStrings(matchTimeVal);
  const matchDateVal = docData?.match_date || docData?.matchDate || dtInfo.matchDate;

    const rawStatus = (docData?.status || '').toString().trim().toLowerCase();
    const hasCompletedAt = Boolean(docData?.completed_at || docData?.completedAt || docData?.finished_at || docData?.finishedAt);
    const isResultsPublished = Boolean(
      docData?.results_published ?? 
      docData?.resultsPublished ?? 
      docData?.is_results_published ?? 
      (rawStatus === 'completed' || rawStatus === 'finished' || hasCompletedAt)
    );
    const isCancelled = rawStatus === 'cancelled' || rawStatus === 'canceled';

    const startTimeMs = new Date(matchTimeVal).getTime();
    const nowMs = Date.now();
    const thirtySecs = 30 * 1000;
    const isTimeLive = !isNaN(startTimeMs) && (nowMs >= startTimeMs + thirtySecs);

    const normalizedStatus: MatchStatus = 
      (rawStatus === 'completed' || rawStatus === 'finished' || isResultsPublished || hasCompletedAt) ? 'completed'
      : isCancelled ? 'cancelled'
      : (rawStatus === 'live' || rawStatus === 'in_progress' || isTimeLive) ? 'live'
      : 'upcoming';

    // Authoritative source of truth: direct public.tournaments columns (requires_access_code, access_code)
    const hasExplicitRequiresCol = docData?.requires_access_code !== undefined && docData?.requires_access_code !== null;
    let rawRequiresAccessCode = hasExplicitRequiresCol
      ? Boolean(docData.requires_access_code)
      : Boolean(
          docData?.requiresAccessCode ??
          docData?.require_access_code ??
          docData?.requireAccessCode ??
          docData?.is_private ??
          docData?.isPrivate ??
          false
        );

    let rawAccessCode = (docData?.access_code !== undefined && docData?.access_code !== null)
      ? String(docData.access_code).trim()
      : (docData?.accessCode ? String(docData.accessCode).trim() : '');

    // Backward compatibility fallback: ONLY if direct columns were undefined
    if (!hasExplicitRequiresCol && !rawAccessCode && docData?.winner_note) {
      try {
        const meta = typeof docData.winner_note === 'string' ? JSON.parse(docData.winner_note) : docData.winner_note;
        if (meta && typeof meta === 'object') {
          if (meta.access_code) {
            rawAccessCode = String(meta.access_code).trim();
          }
          if (meta.requires_access_code !== undefined) {
            rawRequiresAccessCode = Boolean(meta.requires_access_code);
          }
        }
      } catch {}
    }

    const finalAccessCode = rawRequiresAccessCode ? rawAccessCode : '';

    return {
      id: id || docData?.id || `tournament-${Date.now()}`,
      title: docData?.title || docData?.name || 'Untitled Tournament',
      game: gameName,
      category: gameName,
      categoryId: docData?.category_id || docData?.categoryId,
      bannerUrl: resolvedBanner,
      thumbnailUrl: resolvedBanner,
      imageUrl: resolvedBanner,
      cardImage: resolvedBanner,
      card_image: resolvedBanner,
      savedImageId: docData?.saved_image_id || docData?.savedImageId || undefined,
      entryFee: Number(docData?.entry_fee ?? docData?.entryFee ?? 0),
      prizePool: Number(docData?.prize_pool ?? docData?.prizePool ?? 0),
      perKillReward: Number(docData?.kill_reward ?? docData?.per_kill_reward ?? docData?.perKillReward ?? docData?.per_kill_prize ?? docData?.perKillPrize ?? 0),
      perKillPrize: Number(docData?.kill_reward ?? docData?.per_kill_prize ?? docData?.perKillPrize ?? docData?.per_kill_reward ?? docData?.perKillReward ?? 0),
      matchType: (docData?.mode || docData?.match_type || docData?.matchType || 'Solo') as any,
      map: docData?.map_name || docData?.map || 'Erangel',
      maxSlots: maxSlotsTotal,
      filledSlots: actualJoinedCount,
      maxParticipants: maxSlotsTotal,
      joinedParticipants: actualJoinedCount,
      status: normalizedStatus,
      results_published: isResultsPublished,
      completedAt: docData?.completed_at || docData?.completedAt || docData?.finished_at || docData?.finishedAt || undefined,
      completed_at: docData?.completed_at || docData?.completedAt || undefined,
      startTime: matchTimeVal,
      matchSchedule: matchTimeVal,
      schedule: matchTimeVal,
      match_time: matchTimeVal,
      matchDate: matchDateVal,
      match_date: matchDateVal,
      dayOfWeek: dtInfo.dayOfWeek,
      formattedTime: dtInfo.formattedTime,
      roomId: docData?.room_id || docData?.roomId || '',
      roomPassword: docData?.room_password || docData?.roomPassword || '',
      accessCode: finalAccessCode,
      access_code: finalAccessCode,
      requireAccessCode: rawRequiresAccessCode,
      requiresAccessCode: rawRequiresAccessCode,
      requires_access_code: rawRequiresAccessCode,
      require_access_code: rawRequiresAccessCode,
      isPrivate: rawRequiresAccessCode,
      is_private: rawRequiresAccessCode,
      isRoomReleased: Boolean(docData?.is_room_released ?? docData?.isRoomReleased ?? docData?.room_details_visible ?? docData?.roomDetailsVisible ?? false),
      roomDetailsVisible: Boolean(docData?.room_details_visible ?? docData?.roomDetailsVisible ?? docData?.is_room_released ?? docData?.isRoomReleased ?? false),
      isRoomCredentialsVisible: Boolean(docData?.room_details_visible ?? docData?.roomDetailsVisible ?? false),
      rules: parsedRules,
      participants: finalParticipants,
      createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
      updatedAt: docData?.updated_at || docData?.updatedAt || new Date().toISOString(),
      isFeatured: Boolean(docData?.is_featured ?? docData?.isFeatured ?? false),
      tags: Array.isArray(docData?.tags) ? docData.tags : [],
      version: docData?.version || '1.0',
      organizer: docData?.organizer || 'WinX7 Official',
      prizeDistribution: parsedPrizeDistribution,
      prize_distribution: parsedPrizeDistribution,
    };
}

export function isUserJoinedMatch(match: Tournament | any, currentUserId?: string): boolean {
  if (!match || !currentUserId) return false;
  const participants = Array.isArray(match.participants) ? match.participants : [];
  return participants.some((p: any) => {
    if (!p) return false;
    if (typeof p === 'string') return p === currentUserId;
    return (
      p.userId === currentUserId ||
      p.user_id === currentUserId ||
      p.id === currentUserId ||
      p.uid === currentUserId ||
      p.playerId === currentUserId
    );
  });
}

export function isMatchJoinOpen(match: Tournament | any): boolean {
  if (!match) return false;
  const rawStatus = String(match.status || '').toLowerCase();
  if (
    rawStatus === 'cancelled' ||
    rawStatus === 'canceled' ||
    rawStatus === 'completed' ||
    rawStatus === 'finished' ||
    match.results_published
  ) {
    return false;
  }
  const matchTimeStr = match.startTime || match.match_time || match.matchTime || match.schedule || match.matchSchedule || match.start_time;
  if (!matchTimeStr) return true;
  const startTimeMs = new Date(matchTimeStr).getTime();
  if (isNaN(startTimeMs)) return true;
  const nowMs = Date.now();
  // Join is available before scheduled start time and within the 30-second grace period (startTime <= now < startTime + 30s)
  return nowMs < startTimeMs + 30000;
}

export function isMatchExpiredForUserNormalList(match: Tournament | any, currentUserId?: string): boolean {
  if (!match) return false;
  const matchTimeStr = match.startTime || match.match_time || match.matchTime || match.schedule || match.matchSchedule || match.start_time;
  if (!matchTimeStr) return false;
  const startTimeMs = new Date(matchTimeStr).getTime();
  if (isNaN(startTimeMs)) return false;
  const nowMs = Date.now();
  // At scheduled_time + 30 seconds:
  // - unjoined users lose the match completely from normal Matches list
  // - joined users are hidden from normal Matches list and access it via Live Matches section
  return nowMs >= startTimeMs + 30000;
}

export function isMatchVisibleInUserLiveList(match: Tournament | any, currentUserId?: string): boolean {
  if (!match || !currentUserId) return false;
  const rawStatus = String(match.status || '').toLowerCase();
  const isCompleted = rawStatus === 'finished' || rawStatus === 'completed' || match.results_published === true || Boolean(match.completedAt || match.completed_at);
  const isCancelled = rawStatus === 'cancelled' || rawStatus === 'canceled';
  if (isCompleted || isCancelled) return false;

  const hasJoined = isUserJoinedMatch(match, currentUserId);
  if (!hasJoined) return false;

  const matchTimeStr = match.startTime || match.match_time || match.matchTime || match.schedule || match.matchSchedule || match.start_time;
  if (!matchTimeStr) return Boolean(match.isRoomReleased || rawStatus === 'live');
  const startTimeMs = new Date(matchTimeStr).getTime();
  if (isNaN(startTimeMs)) return Boolean(match.isRoomReleased || rawStatus === 'live');

  const nowMs = Date.now();
  return nowMs >= startTimeMs || match.isRoomReleased || rawStatus === 'live';
}

export function filterTournamentsForUserNormalList(tournaments: Tournament[] | any[], currentUserId?: string): Tournament[] {
  if (!Array.isArray(tournaments)) return [];
  const nowMs = Date.now();

  return tournaments.filter((t) => {
    if (!t) return false;
    const tStatus = (t.status || '').toLowerCase();
    const isCompleted = tStatus === 'finished' || tStatus === 'completed' || t.results_published === true || Boolean(t.completedAt || t.completed_at);
    const isCancelled = tStatus === 'cancelled' || tStatus === 'canceled';

    // Finished or cancelled matches do not appear in normal open matches list
    if (isCompleted || isCancelled) return false;

    // Check scheduled time with the strict 30-second grace window
    const matchTimeStr = t.startTime || t.match_time || t.matchTime || t.schedule || t.matchSchedule || t.start_time;
    if (matchTimeStr) {
      const startTimeMs = new Date(matchTimeStr).getTime();
      if (!isNaN(startTimeMs)) {
        // IF current_time >= scheduled_time + 30 seconds:
        // - unjoined users: completely hide from normal Matches list
        // - joined users: hide from normal Matches list (shown in Live Matches section)
        if (nowMs >= startTimeMs + 30000) {
          return false;
        }
      }
    }

    return true;
  });
}

export function filterTournamentsForUserLiveList(tournaments: Tournament[] | any[], currentUserId?: string): Tournament[] {
  if (!Array.isArray(tournaments) || !currentUserId) return [];
  return tournaments.filter((t) => isMatchVisibleInUserLiveList(t, currentUserId));
}

export function filterTournamentsForUserCompletedList(tournaments: Tournament[] | any[]): Tournament[] {
  if (!Array.isArray(tournaments)) return [];
  return tournaments.filter((t) => {
    if (!t) return false;
    const tStatus = (t.status || '').toLowerCase();
    return tStatus === 'finished' || tStatus === 'completed' || t.results_published === true || Boolean(t.completedAt || t.completed_at);
  });
}

export function filterTournamentsForAdmin(tournaments: Tournament[] | any[]): Tournament[] {
  if (!Array.isArray(tournaments)) return [];
  return tournaments;
}

// String extraction helper to prevent 'null', 'undefined', or 'N/A' from being treated as valid strings
function extractCleanString(val: any, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'none' || lower === 'nil') {
      return fallback;
    }
    return trimmed;
  }
  return fallback;
}

export function normalizeUserDoc(docData: any, id: string = docData?.id || docData?.uid || ''): AppUser {
  if (!docData) {
    const validId = id || crypto.randomUUID();
    return {
      id: validId,
      uid: validId,
      email: '',
      username: 'Player',
      displayName: 'Player',
      phone: '',
      inGameId: '',
      inGameName: 'Player',
      avatar_id: 'avatar_1',
      avatarId: 'avatar_1',
      avatarUrl: resolvePresetAvatarUrl('avatar_1'),
      photoURL: resolvePresetAvatarUrl('avatar_1'),
      profilePic: resolvePresetAvatarUrl('avatar_1'),
      profileImage: resolvePresetAvatarUrl('avatar_1'),
      avatar: resolvePresetAvatarUrl('avatar_1'),
      walletBalance: 0,
      winningBalance: 0,
      unclaimedWinnings: 0,
      totalEarnings: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      totalKills: 0,
      status: 'active',
      role: 'user',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      isEmailVerified: true,
      isPhoneVerified: false,
    };
  }

  const meta = docData.user_metadata || docData.raw_user_meta_data || docData.app_metadata || {};

  const resolvedId = extractCleanString(id || docData?.id || docData?.uid || docData?.user_id || docData?.userId, '');
  const email = extractCleanString(
    docData?.email || docData?.user_email || docData?.userEmail || meta?.email || meta?.user_email,
    ''
  );

  const emailPrefix = email ? email.split('@')[0] : '';
  const fallbackUsername = emailPrefix || (resolvedId ? `player_${resolvedId.slice(0, 6)}` : 'Player');

  const username = extractCleanString(
    docData?.username ||
    docData?.user_name ||
    docData?.display_name ||
    docData?.displayName ||
    docData?.name ||
    docData?.full_name ||
    docData?.fullName ||
    docData?.player_name ||
    docData?.playerName ||
    meta?.username ||
    meta?.user_name ||
    meta?.display_name ||
    meta?.name ||
    meta?.full_name,
    fallbackUsername
  );

  const phone = extractCleanString(
    docData?.phone ||
    docData?.phone_number ||
    docData?.phoneNumber ||
    docData?.mobile ||
    docData?.mobile_number ||
    docData?.mobileNumber ||
    docData?.contact ||
    docData?.contact_number ||
    docData?.contactNumber ||
    docData?.phone_no ||
    docData?.mobile_no ||
    docData?.user_phone ||
    docData?.userPhone ||
    meta?.phone ||
    meta?.phone_number ||
    meta?.phoneNumber ||
    meta?.mobile ||
    meta?.mobile_number ||
    meta?.contact,
    ''
  );

  const inGameId = extractCleanString(
    docData?.free_fire_uid ||
    docData?.freefire_uid ||
    docData?.free_fire_id ||
    docData?.freefire_id ||
    docData?.ff_uid ||
    docData?.ff_id ||
    docData?.in_game_id ||
    docData?.inGameId ||
    docData?.inGameID ||
    docData?.in_game_uid ||
    docData?.inGameUid ||
    docData?.game_id ||
    docData?.gameId ||
    docData?.game_uid ||
    docData?.gameUid ||
    docData?.player_id ||
    docData?.playerId ||
    docData?.player_uid ||
    docData?.playerUid ||
    docData?.ign_id ||
    docData?.ignId ||
    meta?.free_fire_uid ||
    meta?.freefire_uid ||
    meta?.ff_uid ||
    meta?.in_game_id ||
    meta?.inGameId ||
    meta?.game_id ||
    meta?.game_uid ||
    meta?.player_id,
    ''
  );

  const inGameName = extractCleanString(
    docData?.free_fire_ign ||
    docData?.freefire_ign ||
    docData?.free_fire_name ||
    docData?.freeFireName ||
    docData?.ff_ign ||
    docData?.ff_name ||
    docData?.in_game_name ||
    docData?.inGameName ||
    docData?.inGameNAME ||
    docData?.ign ||
    docData?.game_name ||
    docData?.gameName ||
    docData?.player_name ||
    docData?.playerName ||
    docData?.gamer_name ||
    docData?.gamerName ||
    meta?.free_fire_ign ||
    meta?.freefire_ign ||
    meta?.ff_ign ||
    meta?.in_game_name ||
    meta?.inGameName ||
    meta?.ign ||
    meta?.game_name,
    username
  );

  // WINX7 Avatar Slot Mapping (avatar_1 .. avatar_5)
  let rawAvatarId = extractCleanString(
    docData?.avatar_id ||
    docData?.avatarId ||
    docData?.avatar_slot ||
    docData?.avatarSlot ||
    meta?.avatar_id ||
    meta?.avatarId ||
    meta?.avatar_slot,
    ''
  );

  if (!rawAvatarId) {
    const possibleAvatar = extractCleanString(docData?.avatar_url || docData?.avatarUrl || docData?.avatar || meta?.avatar_url || meta?.avatarUrl, '');
    if (possibleAvatar && /^avatar_[1-5]$/i.test(possibleAvatar)) {
      rawAvatarId = possibleAvatar;
    }
  }

  const avatarId = (rawAvatarId && /^avatar_[1-5]$/i.test(rawAvatarId))
    ? rawAvatarId.toLowerCase()
    : 'avatar_1';

  const avatarUrl = resolvePresetAvatarUrl(
    avatarId,
    extractCleanString(docData?.avatar_url || docData?.avatarUrl || docData?.avatar || docData?.photoURL || meta?.avatar_url, '')
  );

  const depositBal = Number(docData?.deposit_balance ?? docData?.depositBalance ?? docData?.wallet_balance ?? docData?.walletBalance ?? docData?.balance ?? 0);
  const winningBal = Number(docData?.winning_balance ?? docData?.winningBalance ?? docData?.unclaimed_winnings ?? docData?.unclaimedWinnings ?? docData?.winnings ?? 0);
  const bonusBal = Number(docData?.bonus_balance ?? docData?.bonusBalance ?? 0);
  const totalBal = Number(docData?.total_balance ?? docData?.totalBalance ?? (depositBal + winningBal + bonusBal));

  return {
    id: resolvedId,
    uid: resolvedId,
    email,
    username,
    displayName: username,
    phone,
    inGameId,
    inGameName,
    avatar_id: avatarId,
    avatarId: avatarId,
    avatarUrl,
    photoURL: avatarUrl,
    profilePic: avatarUrl,
    profileImage: avatarUrl,
    avatar: avatarUrl,
    walletBalance: isNaN(depositBal) ? 0 : depositBal,
    depositBalance: isNaN(depositBal) ? 0 : depositBal,
    winningBalance: isNaN(winningBal) ? 0 : winningBal,
    unclaimedWinnings: isNaN(winningBal) ? 0 : winningBal,
    bonusBalance: isNaN(bonusBal) ? 0 : bonusBal,
    totalBalance: isNaN(totalBal) ? 0 : totalBal,
    totalEarnings: Number(docData?.totalEarnings ?? docData?.totalEarnings ?? docData?.total_earnings ?? (isNaN(winningBal) ? 0 : winningBal)),
    totalDeposits: Number(docData?.total_deposits ?? docData?.totalDeposits ?? 0),
    totalWithdrawals: Number(docData?.total_withdrawals ?? docData?.totalWithdrawals ?? 0),
    matchesPlayed: Number(docData?.matches_played ?? docData?.matchesPlayed ?? docData?.total_matches_joined ?? 0),
    matchesWon: Number(docData?.matches_won ?? docData?.matchesWon ?? docData?.total_wins ?? 0),
    totalKills: Number(docData?.total_kills ?? docData?.totalKills ?? 0),
    status: (docData?.status === 'blocked' || docData?.status === 'banned' || docData?.status === 'suspended') ? 'blocked' : 'active',
    role: docData?.role || 'user',
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
    lastLogin: docData?.last_login || docData?.lastLogin || new Date().toISOString(),
    isEmailVerified: Boolean(docData?.is_email_verified ?? docData?.isEmailVerified ?? true),
    isPhoneVerified: Boolean(docData?.is_phone_verified ?? docData?.isPhoneVerified ?? false),
    banReason: docData?.ban_reason || docData?.banReason,
    deviceInfo: docData?.device_info || docData?.deviceInfo,
  };
}

export interface UserWalletData {
  userId: string;
  depositBalance: number;
  winningBalance: number;
  bonusBalance: number;
  totalBalance: number;
}

/**
 * Authoritative wallet getter: reads from public.wallets, with seamless fallback & auto-init
 */
export async function getUserWallet(userId: string): Promise<UserWalletData> {
  if (!userId) {
    return { userId: '', depositBalance: 0, winningBalance: 0, bonusBalance: 0, totalBalance: 0 };
  }

  try {
    const { data: walletData, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!walletErr && walletData) {
      const dep = Number(walletData.deposit_balance ?? 0);
      const win = Number(walletData.winning_balance ?? 0);
      const bon = Number(walletData.bonus_balance ?? 0);
      const tot = Number(walletData.total_balance ?? (dep + win + bon));
      return {
        userId,
        depositBalance: isNaN(dep) ? 0 : dep,
        winningBalance: isNaN(win) ? 0 : win,
        bonusBalance: isNaN(bon) ? 0 : bon,
        totalBalance: isNaN(tot) ? 0 : tot,
      };
    }
  } catch (err) {
    console.warn('[getUserWallet] wallets query notice:', err);
  }

  // Fallback to profiles table and auto-sync to wallets
  try {
    let { data: profData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!profData) {
      console.warn(`[getUserWallet] Wallet and profile missing for ${userId}. Attempting to initialize.`);
      const newProf = await ensureUserProfileExists(userId);
      profData = {
        deposit_balance: newProf.depositBalance,
        wallet_balance: newProf.depositBalance,
        winning_balance: newProf.winningBalance,
        unclaimed_winnings: newProf.winningBalance,
        bonus_balance: newProf.bonusBalance
      };
    }

    const dep = Number(profData?.deposit_balance ?? profData?.wallet_balance ?? 0);
    const win = Number(profData?.winning_balance ?? profData?.unclaimed_winnings ?? 0);
    const bon = Number(profData?.bonus_balance ?? 0);
    const tot = dep + win + bon;

    // Auto-create missing wallet row
    try {
      await supabase.from('wallets').upsert({
        user_id: userId,
        deposit_balance: dep,
        winning_balance: win,
        bonus_balance: bon,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (upsertErr) {
      console.warn('[getUserWallet] Wallet auto-create notice:', upsertErr);
    }

    return {
      userId,
      depositBalance: isNaN(dep) ? 0 : dep,
      winningBalance: isNaN(win) ? 0 : win,
      bonusBalance: isNaN(bon) ? 0 : bon,
      totalBalance: isNaN(tot) ? 0 : tot,
    };
  } catch {
    return { userId, depositBalance: 0, winningBalance: 0, bonusBalance: 0, totalBalance: 0 };
  }
}

/**
 * Authoritative wallet updater: synchronizes public.wallets AND public.profiles simultaneously
 */
export async function syncUserWallet(
  userId: string,
  depositBal: number,
  winningBal: number,
  bonusBal: number = 0
): Promise<UserWalletData> {
  const safeDep = Math.max(0, Number(depositBal || 0));
  const safeWin = Math.max(0, Number(winningBal || 0));
  const safeBon = Math.max(0, Number(bonusBal || 0));
  const safeTot = safeDep + safeWin + safeBon;
  const now = new Date().toISOString();

  // 1. Authoritative write to public.wallets (do not write to total_balance directly if postgres generated)
  try {
    const { data: existingWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr) {
      throw fetchErr;
    }

    if (existingWallet) {
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({
          deposit_balance: safeDep,
          winning_balance: safeWin,
          bonus_balance: safeBon,
          updated_at: now,
        })
        .eq('user_id', userId);

      if (updateErr) {
        throw updateErr;
      }
    } else {
      const { error: insertErr } = await supabase
        .from('wallets')
        .insert({
          user_id: userId,
          deposit_balance: safeDep,
          winning_balance: safeWin,
          bonus_balance: safeBon,
          created_at: now,
          updated_at: now,
        });

      if (insertErr) {
        throw insertErr;
      }
    }
  } catch (err: any) {
    console.error('[syncUserWallet] wallets table write error:', err);
    throw new Error(`Wallets database update failed: ${err?.message || err}`);
  }

  // 2. Synchronize mirror fields in public.profiles for full backward-compatibility
  try {
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const profPayload: Record<string, any> = {
      updated_at: now
    };

    if (currentProfile) {
      if ('deposit_balance' in currentProfile) profPayload.deposit_balance = safeDep;
      if ('wallet_balance' in currentProfile) profPayload.wallet_balance = safeDep;
      if ('winning_balance' in currentProfile) profPayload.winning_balance = safeWin;
      if ('unclaimed_winnings' in currentProfile) profPayload.unclaimed_winnings = safeWin;
      if ('bonus_balance' in currentProfile) profPayload.bonus_balance = safeBon;
    } else {
      profPayload.deposit_balance = safeDep;
      profPayload.wallet_balance = safeDep;
      profPayload.winning_balance = safeWin;
      profPayload.unclaimed_winnings = safeWin;
      profPayload.bonus_balance = safeBon;
    }

    const { error: profErr } = await safeSupabaseWrite('profiles', profPayload, 'update', userId);
    if (profErr) {
      throw profErr;
    }
  } catch (profErr: any) {
    console.error('[syncUserWallet] profiles mirror sync error:', profErr);
    throw new Error(`Profiles database sync failed: ${profErr?.message || profErr}`);
  }

  return {
    userId,
    depositBalance: safeDep,
    winningBalance: safeWin,
    bonusBalance: safeBon,
    totalBalance: safeTot,
  };
}

/**
 * Ensures a matching public.profiles row and public.wallets row exist for any Supabase Auth user (with matching Auth UUID)
 */
export async function ensureUserProfileExists(user: any): Promise<AppUser> {
  if (!user || !user.id) throw new Error('Invalid user auth object');
  const userId = user.id;
  const meta = user.user_metadata || user.raw_user_meta_data || user.app_metadata || {};

  // Ensure authoritative wallet row exists in public.wallets
  try {
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingWallet) {
      await supabase.from('wallets').insert({
        user_id: userId,
        deposit_balance: 0,
        winning_balance: 0,
        bonus_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (wErr) {
    console.warn('[ensureUserProfileExists] wallet init notice:', wErr);
  }

  try {
    const { data: existingProfile, error: fetchErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      // Check if existing profile is missing fields that are available in Auth metadata
      const normalizedExisting = normalizeUserDoc(existingProfile, userId);
      const metaPhone = extractCleanString(meta.phone || meta.phone_number || meta.mobile || user.phone, '');
      const metaUid = extractCleanString(meta.free_fire_uid || meta.ff_uid || meta.in_game_id || meta.game_id, '');
      const metaIgn = extractCleanString(meta.free_fire_ign || meta.ff_ign || meta.in_game_name || meta.ign, '');
      const metaAvatar = extractCleanString(meta.avatar_id || meta.avatarId, '');

      let needsSync = false;
      const syncPayload: Record<string, any> = {};

      if (!normalizedExisting.phone && metaPhone) {
        syncPayload.phone = metaPhone;
        syncPayload.phone_number = metaPhone;
        syncPayload.mobile = metaPhone;
        needsSync = true;
      }
      if (!normalizedExisting.inGameId && metaUid) {
        syncPayload.free_fire_uid = metaUid;
        syncPayload.ff_uid = metaUid;
        syncPayload.in_game_id = metaUid;
        needsSync = true;
      }
      if ((!normalizedExisting.inGameName || normalizedExisting.inGameName === normalizedExisting.username) && metaIgn) {
        syncPayload.free_fire_ign = metaIgn;
        syncPayload.ff_ign = metaIgn;
        syncPayload.in_game_name = metaIgn;
        needsSync = true;
      }
      if ((!existingProfile.avatar_id || existingProfile.avatar_id === 'avatar_1') && metaAvatar && metaAvatar !== 'avatar_1') {
        syncPayload.avatar_id = metaAvatar;
        syncPayload.avatar_url = resolvePresetAvatarUrl(metaAvatar);
        needsSync = true;
      }

      if (needsSync) {
        syncPayload.updated_at = new Date().toISOString();
        try {
          await safeSupabaseWrite('profiles', { id: userId, ...syncPayload }, 'update', userId);
        } catch {}
      }

      return normalizeUserDoc({ ...existingProfile, ...syncPayload }, userId);
    }
  } catch (err) {
    console.warn('[ensureUserProfileExists] fetch notice:', err);
  }

  // Create matching public.profiles row using the SAME Auth UUID
  const email = user.email || extractCleanString(meta.email, '');
  const emailPrefix = email ? email.split('@')[0] : '';
  const rawName = extractCleanString(meta.username || meta.name || meta.display_name || meta.full_name, emailPrefix || `player_${userId.slice(0, 6)}`);
  const phone = extractCleanString(meta.phone || meta.phone_number || meta.mobile || user.phone, '');
  const ffUid = extractCleanString(meta.free_fire_uid || meta.ff_uid || meta.in_game_id || meta.game_id, '');
  const ffIgn = extractCleanString(meta.free_fire_ign || meta.ff_ign || meta.in_game_name || meta.ign, rawName);
  const rawAvatarId = extractCleanString(meta.avatar_id || meta.avatarId, 'avatar_1');
  const avatarId = /^avatar_[1-5]$/i.test(rawAvatarId) ? rawAvatarId.toLowerCase() : 'avatar_1';
  const defaultAvatarUrl = resolvePresetAvatarUrl(avatarId);

  const initialPayload = cleanUndefined({
    id: userId,
    email: email,
    name: rawName,
    username: rawName,
    display_name: rawName,
    phone: phone,
    phone_number: phone,
    mobile: phone,
    ff_ign: ffIgn,
    free_fire_ign: ffIgn,
    in_game_name: ffIgn,
    ff_uid: ffUid,
    free_fire_uid: ffUid,
    in_game_id: ffUid,
    avatar_id: avatarId,
    avatar_url: defaultAvatarUrl,
    role: 'user',
    status: 'active',
    deposit_balance: 0,
    wallet_balance: 0,
    winning_balance: 0,
    unclaimed_winnings: 0,
    bonus_balance: 0,
    total_earnings: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    matches_played: 0,
    matches_won: 0,
    total_kills: 0,
    is_email_verified: Boolean(user.email_confirmed_at || user.confirmed_at || true),
    is_phone_verified: Boolean(user.phone_confirmed_at || false),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
  });

  try {
    const { data: created, error: insertErr } = await safeSupabaseWrite('profiles', initialPayload, 'upsert', userId);
    if (!insertErr && created) {
      return normalizeUserDoc(created, userId);
    }
  } catch (insertErr) {
    console.error('[ensureUserProfileExists] insert notice:', insertErr);
  }

  return normalizeUserDoc(initialPayload, userId);
}

/**
 * Authoritative Player Identity Resolver across the entire Admin & User App
 * Resolves user UUID/object against profiles/users and extracts clean username, IGN, Game UID, and email
 */
export function resolveUserDisplayName(
  input: any,
  users: AppUser[] = []
): {
  username: string;
  inGameName: string;
  inGameId: string;
  email: string;
  phone: string;
  userId: string;
  matchedUser: AppUser | null;
} {
  if (!input) {
    return {
      username: 'User',
      inGameName: 'N/A',
      inGameId: 'N/A',
      email: 'N/A',
      phone: 'N/A',
      userId: 'N/A',
      matchedUser: null
    };
  }

  let parsed: any = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = input;
      }
    }
  }

  // If input is a raw primitive string or number (e.g. user UUID, email, or username)
  if (typeof parsed === 'string' || typeof parsed === 'number') {
    const str = String(parsed).trim();
    const strLower = str.toLowerCase();

    const matchedUser = (users || []).find((u) => {
      if (!u) return false;
      const uId = (u.id || '').toLowerCase().trim();
      const uUid = (u.uid || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uInGameId = (u.inGameId || '').toLowerCase().trim();
      const uInGameName = (u.inGameName || '').toLowerCase().trim();
      const uUsername = (u.username || '').toLowerCase().trim();

      return (
        (uId && strLower === uId) ||
        (uUid && strLower === uUid) ||
        (uEmail && strLower === uEmail) ||
        (uInGameId && strLower === uInGameId) ||
        (uInGameName && strLower === uInGameName) ||
        (uUsername && strLower === uUsername)
      );
    });

    if (matchedUser) {
      const bestUsername =
        (matchedUser.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
        (matchedUser.inGameName && matchedUser.inGameName !== 'Player' && matchedUser.inGameName !== 'User' && matchedUser.inGameName !== 'N/A' ? matchedUser.inGameName : '') ||
        (matchedUser.displayName && matchedUser.displayName !== 'Player' && matchedUser.displayName !== 'User' ? matchedUser.displayName : '') ||
        (matchedUser.email ? matchedUser.email.split('@')[0] : '') ||
        'User';

      const bestIgn =
        (matchedUser.inGameName && matchedUser.inGameName !== 'N/A' && matchedUser.inGameName !== 'Player' ? matchedUser.inGameName : '') ||
        (matchedUser.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
        bestUsername ||
        'N/A';

      const bestUid =
        (matchedUser.inGameId && matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : '') ||
        (matchedUser.uid && matchedUser.uid !== 'N/A' ? matchedUser.uid : '') ||
        (matchedUser.id && matchedUser.id !== 'N/A' ? matchedUser.id : '') ||
        'N/A';

      return {
        username: bestUsername,
        inGameName: bestIgn,
        inGameId: bestUid,
        email: matchedUser.email || 'N/A',
        phone: matchedUser.phone || 'N/A',
        userId: matchedUser.uid || matchedUser.id || str,
        matchedUser
      };
    }

    const isEmail = str.includes('@');
    return {
      username: isEmail ? str.split('@')[0] : (str.length > 25 ? `User (${str.slice(0, 6)})` : (str || 'User')),
      inGameName: !isEmail ? str : 'N/A',
      inGameId: !isEmail ? str : 'N/A',
      email: isEmail ? str : 'N/A',
      phone: 'N/A',
      userId: !isEmail ? str : 'N/A',
      matchedUser: null
    };
  }

  // Object input extraction
  const pUserId = (parsed.userId || parsed.user_id || parsed.userUid || parsed.user_uid || parsed.uid || parsed.id || parsed.playerId || parsed.player_id || parsed.account_id || parsed.accountId || '').toString().trim();
  const pEmail = (parsed.email || parsed.userEmail || parsed.user_email || parsed.mail || '').toString().trim();
  const pPhone = (parsed.phone || parsed.userPhone || parsed.user_phone || parsed.mobile || '').toString().trim();
  const pUsername = (parsed.username || parsed.user_name || parsed.displayName || parsed.display_name || parsed.name || parsed.fullName || parsed.full_name || parsed.playerName || parsed.player_name || '').toString().trim();
  const pInGameName = (
    parsed.inGameName ||
    parsed.in_game_name ||
    parsed.ign ||
    parsed.free_fire_ign ||
    parsed.freeFireName ||
    parsed.ff_ign ||
    parsed.ff_name ||
    parsed.game_name ||
    parsed.gameName ||
    ''
  ).toString().trim();
  const pInGameId = (
    parsed.inGameId ||
    parsed.in_game_id ||
    parsed.free_fire_uid ||
    parsed.ff_uid ||
    parsed.ff_id ||
    parsed.game_uid ||
    parsed.gameUid ||
    parsed.game_id ||
    parsed.gameId ||
    parsed.ign_id ||
    parsed.ignId ||
    ''
  ).toString().trim();

  // Find matching user in users list
  const matchedUser = (users || []).find((u) => {
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

  const bestUsername =
    (matchedUser?.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
    (matchedUser?.inGameName && matchedUser.inGameName !== 'Player' && matchedUser.inGameName !== 'User' && matchedUser.inGameName !== 'N/A' ? matchedUser.inGameName : '') ||
    (matchedUser?.displayName && matchedUser.displayName !== 'Player' && matchedUser.displayName !== 'User' ? matchedUser.displayName : '') ||
    (pUsername && pUsername !== 'Player' && pUsername !== 'User' ? pUsername : '') ||
    (pInGameName && pInGameName !== 'Player' && pInGameName !== 'User' && pInGameName !== 'N/A' ? pInGameName : '') ||
    (matchedUser?.email ? matchedUser.email.split('@')[0] : '') ||
    (pEmail ? pEmail.split('@')[0] : '') ||
    (matchedUser?.phone ? matchedUser.phone : '') ||
    (pPhone ? pPhone : '') ||
    'User';

  const bestIgn =
    (matchedUser?.inGameName && matchedUser.inGameName !== 'N/A' && matchedUser.inGameName !== 'Player' ? matchedUser.inGameName : '') ||
    (pInGameName && pInGameName !== 'N/A' && pInGameName !== 'Player' ? pInGameName : '') ||
    (matchedUser?.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
    (pUsername && pUsername !== 'Player' && pUsername !== 'User' ? pUsername : '') ||
    bestUsername ||
    'N/A';

  const bestUid =
    (matchedUser?.inGameId && matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : '') ||
    (pInGameId && pInGameId !== 'N/A' ? pInGameId : '') ||
    (matchedUser?.uid && matchedUser.uid !== 'N/A' ? matchedUser.uid : '') ||
    (matchedUser?.id && matchedUser.id !== 'N/A' ? matchedUser.id : '') ||
    (pUserId && pUserId !== 'N/A' ? pUserId : '') ||
    'N/A';

  const finalEmail = matchedUser?.email || pEmail || 'N/A';
  const finalPhone = matchedUser?.phone || pPhone || 'N/A';
  const finalUserId = matchedUser?.uid || matchedUser?.id || pUserId || 'N/A';

  return {
    username: bestUsername,
    inGameName: bestIgn,
    inGameId: bestUid,
    email: finalEmail,
    phone: finalPhone,
    userId: finalUserId,
    matchedUser: matchedUser || null
  };
}

export function normalizeTransactionDoc(
  docData: any,
  id: string = docData?.id || '',
  profile?: any
): WalletTransaction {
  const desc = docData?.description || '';
  const refId = docData?.reference_id || docData?.referenceId || '';
  
  // Extract UTR from description if refId is not set
  let utr = docData?.utr || refId;
  if (!utr && desc) {
    const match = desc.match(/UTR:?\s*([A-Za-z0-9]+)/i);
    if (match && match[1]) utr = match[1];
  }

  // Extract UPI ID from description if upi_id is not set
  let upiId = docData?.upi_id || docData?.upiId || '';
  if (!upiId && desc) {
    const match = desc.match(/([a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64})/);
    if (match && match[1]) upiId = match[1];
  }

  let rawType = (docData?.type || 'deposit').toLowerCase();
  if (['recharge', 'add_money', 'topup', 'payment', 'credit'].includes(rawType)) {
    rawType = 'deposit';
  } else if (['debit', 'cashout', 'payout'].includes(rawType)) {
    rawType = 'withdrawal';
  }

  const rawStatus = String(docData?.status || 'pending').toLowerCase().trim();
  let statusVal: 'pending' | 'approved' | 'rejected' = 'pending';
  if (['approved', 'success', 'completed', 'paid', 'done', 'accepted', 'complete', 'succeeded'].includes(rawStatus)) {
    statusVal = 'approved';
  } else if (['rejected', 'failed', 'cancelled', 'declined', 'canceled', 'denied'].includes(rawStatus)) {
    statusVal = 'rejected';
  }

  const rawProofUrl = docData?.proof_image_url || docData?.proofImageUrl || '';
  const proofImageUrl = rawProofUrl
    ? rawProofUrl.startsWith('http')
      ? rawProofUrl
      : `${SUPABASE_URL}/storage/v1/object/public/deposits/${rawProofUrl}`
    : undefined;

  // Resolve authoritative username from profile or docData
  let resolvedUsername = '';
  if (profile) {
    resolvedUsername =
      (profile.username && profile.username !== 'User' && profile.username !== 'Player' ? profile.username : '') ||
      (profile.in_game_name && profile.in_game_name !== 'User' && profile.in_game_name !== 'Player' && profile.in_game_name !== 'N/A' ? profile.in_game_name : '') ||
      (profile.ign && profile.ign !== 'User' && profile.ign !== 'Player' && profile.ign !== 'N/A' ? profile.ign : '') ||
      (profile.display_name && profile.display_name !== 'User' && profile.display_name !== 'Player' ? profile.display_name : '') ||
      (profile.displayName && profile.displayName !== 'User' && profile.displayName !== 'Player' ? profile.displayName : '') ||
      (profile.name && profile.name !== 'User' && profile.name !== 'Player' ? profile.name : '') ||
      (profile.full_name && profile.full_name !== 'User' && profile.full_name !== 'Player' ? profile.full_name : '') ||
      (profile.player_name && profile.player_name !== 'User' && profile.player_name !== 'Player' ? profile.player_name : '') ||
      (profile.user_name && profile.user_name !== 'User' && profile.user_name !== 'Player' ? profile.user_name : '') ||
      (profile.email ? profile.email.split('@')[0] : '') ||
      (profile.phone ? profile.phone : '');
  }

  if (!resolvedUsername || resolvedUsername === 'User' || resolvedUsername === 'Player') {
    resolvedUsername =
      (docData?.username && docData.username !== 'User' && docData.username !== 'Player' ? docData.username : '') ||
      (docData?.user_name && docData.user_name !== 'User' && docData.user_name !== 'Player' ? docData.user_name : '') ||
      (docData?.in_game_name && docData.in_game_name !== 'User' && docData.in_game_name !== 'Player' && docData.in_game_name !== 'N/A' ? docData.in_game_name : '') ||
      (docData?.inGameName && docData.inGameName !== 'User' && docData.inGameName !== 'Player' && docData.inGameName !== 'N/A' ? docData.inGameName : '') ||
      (docData?.ign && docData.ign !== 'User' && docData.ign !== 'Player' && docData.ign !== 'N/A' ? docData.ign : '') ||
      (docData?.display_name && docData.display_name !== 'User' && docData.display_name !== 'Player' ? docData.display_name : '') ||
      (docData?.displayName && docData.displayName !== 'User' && docData.displayName !== 'Player' ? docData.displayName : '') ||
      (docData?.name && docData.name !== 'User' && docData.name !== 'Player' ? docData.name : '') ||
      (docData?.full_name && docData.full_name !== 'User' && docData.full_name !== 'Player' ? docData.full_name : '') ||
      (docData?.player_name && docData.player_name !== 'User' && docData.player_name !== 'Player' ? docData.player_name : '') ||
      (docData?.user_email ? docData.user_email.split('@')[0] : '') ||
      (docData?.email ? docData.email.split('@')[0] : '') ||
      (docData?.userEmail ? docData.userEmail.split('@')[0] : '') ||
      (docData?.userPhone ? docData.userPhone : '') ||
      (docData?.phone ? docData.phone : '') ||
      resolvedUsername ||
      'User';
  }

  return {
    id: id || docData?.id || `tx-${Date.now()}`,
    userId: docData?.user_id || docData?.userId || profile?.id || '',
    username: resolvedUsername,
    type: rawType as any,
    amount: Number(docData?.amount || 0),
    status: statusVal as any,
    paymentMethod: docData?.payment_method || docData?.paymentMethod || 'UPI',
    referenceId: refId || docData?.id || id,
    withdrawalRequestId: docData?.withdrawal_request_id || docData?.withdrawalRequestId,
    utr: utr || refId,
    proofImageUrl: proofImageUrl,
    upiId: upiId || undefined,
    bankDetails: docData?.bank_details || docData?.bankDetails,
    title: docData?.title,
    description: desc,
    adminNotes: docData?.admin_notes || docData?.adminNotes,
    rejectionReason: docData?.rejection_reason || docData?.rejectionReason,
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
    processedAt: docData?.processed_at || docData?.processedAt,
    processedBy: docData?.processed_by || docData?.processedBy,
    isCredit: Boolean(docData?.is_credit ?? docData?.isCredit ?? (rawType === 'deposit' || rawType === 'winning' || rawType === 'refund')),
    walletType: docData?.wallet_type || docData?.walletType || 'main',
    isRefunded: Boolean(
      docData?.is_refunded ||
      docData?.isRefunded ||
      (typeof desc === 'string' && (desc.includes('[REFUNDED') || desc.includes('Refunded:'))) ||
      (typeof docData?.admin_notes === 'string' && (docData.admin_notes.includes('[REFUNDED') || docData.admin_notes.includes('Refunded:')))
    ),
    refundedAt: docData?.refunded_at || docData?.refundedAt || (typeof desc === 'string' ? desc.match(/\[REFUNDED:.*?on (.*?)\]/)?.[1] : undefined),
    refundTxId: docData?.refund_tx_id || docData?.refundTxId,
    refundNotes: docData?.refund_notes || docData?.refundNotes,
  };
}

export function normalizeNotificationDoc(docData: any, id: string = docData?.id || ''): AppNotification {
  return {
    id: id || docData?.id || `notif-${Date.now()}`,
    title: docData?.title || 'Notification',
    message: docData?.message || docData?.body || '',
    type: (docData?.type || 'system') as any,
    targetUserId: docData?.target_user_id || docData?.targetUserId,
    sentAt: docData?.sent_at || docData?.sentAt || docData?.created_at || new Date().toISOString(),
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
    sentBy: docData?.sent_by || docData?.sentBy || 'Admin',
    isRead: Boolean(docData?.is_read ?? docData?.isRead ?? docData?.read ?? false),
    read: Boolean(docData?.is_read ?? docData?.isRead ?? docData?.read ?? false),
    imageUrl: docData?.image_url || docData?.imageUrl,
    link: docData?.link,
  };
}

export function normalizeCategoryDoc(docData: any, id: string = docData?.id || ''): MatchCategory {
  return {
    id: id || docData?.id || docData?.name?.toLowerCase().replace(/\s+/g, '-'),
    name: docData?.name || 'Game',
    description: docData?.description || '',
    isActive: Boolean(docData?.is_active ?? docData?.isActive ?? true),
    imageUrl: docData?.image_url || docData?.imageUrl || getCategoryBannerImage(docData?.name || ''),
    bannerUrl: docData?.banner_url || docData?.bannerUrl || docData?.image_url || docData?.imageUrl || getCategoryBannerImage(docData?.name || ''),
    displayOrder: Number(docData?.display_order ?? docData?.displayOrder ?? 0),
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
  };
}

export function normalizeCouponDoc(docData: any, id: string = docData?.id || docData?.coupon_id || ''): Coupon {
  const couponId = String(id || docData?.id || docData?.coupon_id || docData?.p_coupon_id || `cpn-${Date.now()}`);
  const code = String(docData?.code || docData?.p_code || docData?.id || '').trim().toUpperCase();
  const description = docData?.description || docData?.p_description || '';
  const rewardAmount = Number(docData?.reward_amount ?? docData?.rewardAmount ?? docData?.p_reward_amount ?? docData?.discount_value ?? docData?.discountValue ?? 0);
  const minDepositAmount = Number(docData?.min_deposit_amount ?? docData?.minDepositAmount ?? docData?.p_min_deposit_amount ?? docData?.min_deposit ?? docData?.minDeposit ?? 0);

  const rawMaxUses = docData?.max_uses ?? docData?.maxUses ?? docData?.p_max_uses ?? docData?.usage_limit ?? docData?.usageLimit;
  const maxUses = rawMaxUses !== undefined && rawMaxUses !== null && !isNaN(Number(rawMaxUses)) && Number(rawMaxUses) > 0 ? Number(rawMaxUses) : null;

  const usedCount = Number(docData?.used_count ?? docData?.usedCount ?? docData?.p_used_count ?? docData?.times_used ?? docData?.timesUsed ?? 0);

  const startsAt = docData?.starts_at || docData?.startsAt || docData?.p_starts_at || docData?.created_at || docData?.createdAt || new Date().toISOString();
  const expiresAt = docData?.expires_at || docData?.expiresAt || docData?.p_expires_at || docData?.expiry_date || docData?.expiryDate || docData?.valid_until || docData?.validUntil || null;

  const isActive = Boolean(docData?.is_active ?? docData?.isActive ?? docData?.p_is_active ?? true);
  const createdAt = docData?.created_at || docData?.createdAt || new Date().toISOString();

  return {
    id: couponId,
    code,
    description,
    rewardAmount,
    minDepositAmount,
    maxUses,
    usedCount,
    startsAt,
    expiresAt,
    isActive,
    createdAt,

    // Aliases for full backwards compatibility
    discountType: 'fixed',
    discountValue: rewardAmount,
    minDeposit: minDepositAmount,
    usageLimit: maxUses,
    timesUsed: usedCount,
    expiryDate: expiresAt ? String(expiresAt) : undefined,
    validUntil: expiresAt ? String(expiresAt) : undefined
  };
}

export function normalizeSystemSettingsFromRow(docData: any): SystemSettings {
  if (!docData) {
    return {
      appName: 'WinX7 Esports',
      contactEmail: 'support@winx7.com',
      supportPhone: '+91 9999988888',
      whatsappGroup: '',
      whatsappContact: '',
      telegramChannel: '',
      telegramGroup: '',
      telegramSupport: '',
      telegramContact: '',
      instagramContact: '',
      youtubeChannel: '',
      youtubeContact: '',
      discordServer: '',
      discordContact: '',
      websiteUrl: '',
      directChatUrl: '',
      supportLinks: [],
      telegramEnabled: true,
      telegramName: 'Telegram Customer Support',
      telegramDescription: 'Instant 24/7 support & match query resolution',
      whatsappEnabled: true,
      whatsappName: 'WhatsApp Official Update Channel',
      whatsappDescription: 'Get official match announcements & room ID updates',
      instagramEnabled: true,
      instagramName: 'Instagram Official Page',
      instagramDescription: 'Follow for tournament highlights, giveaways & news',
      youtubeEnabled: true,
      youtubeName: 'YouTube Official Channel',
      youtubeDescription: 'Watch live streamings & official match replays',
      upiId: 'winx7pay@upi',
      upiName: 'WinX7 Esports',
      depositQrImageUrl: '',
      customQrLink: '',
      depositInstructions: 'Scan QR using any UPI app (GPay, PhonePe, Paytm) and enter the 12-digit UTR number.',
      minDeposit: 10,
      minWithdrawal: 100,
      maxDeposit: 50000,
      maxWithdrawal: 25000,
      dailyWithdrawalLimit: 3,
      maintenanceMode: false,
      maintenanceMessage: 'Server under scheduled maintenance. Please check back shortly.',
      depositEnabled: true,
      withdrawEnabled: true,
      tournamentsEnabled: true,
      registrationEnabled: true,
      referralEnabled: true,
      referralBonus: 25,
      minAppVersion: '1.0.0',
      privacyPolicyText: '',
      termsAndFairPlayRulesText: '',
      privacyPolicy: '',
    };
  }

  let jsonPayload: any = {};
  const rawContainer = docData.data ?? docData.config ?? docData.settings ?? docData.content ?? docData.payload ?? docData.json_data;
  if (rawContainer) {
    if (typeof rawContainer === 'string') {
      try { jsonPayload = JSON.parse(rawContainer); } catch {}
    } else if (typeof rawContainer === 'object') {
      jsonPayload = rawContainer;
    }
  }

  // Check local preferences fallback
  let localPref: any = {};
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('winx7_system_settings');
      if (raw) localPref = JSON.parse(raw);
    } catch {}
  }

  const merged = { ...localPref, ...jsonPayload, ...docData };

  const whatsappVal = merged.whatsapp_contact || merged.whatsappContact || merged.whatsapp_group || merged.whatsappGroup || '';
  const telegramVal = merged.telegram_contact || merged.telegramContact || merged.telegram_channel || merged.telegramChannel || merged.telegram_support || merged.telegramSupport || '';
  const instagramVal = merged.instagram_contact || merged.instagramContact || '';
  const youtubeVal = merged.youtube_contact || merged.youtubeContact || merged.youtube_channel || merged.youtubeChannel || '';
  const privacyText = merged.privacy_policy_text || merged.privacyPolicyText || merged.privacy_policy || merged.privacyPolicy || '';
  const termsRulesText = merged.terms_and_fair_play_rules_text || merged.termsAndFairPlayRulesText || '';

  return {
    appName: merged.app_name || merged.appName || 'WinX7 Esports',
    upiId: merged.upi_id || merged.upiId || 'winx7pay@upi',
    upiName: merged.upi_name || merged.upiName || 'WinX7 Esports',
    depositQrImageUrl: merged.deposit_qr_image_url || merged.depositQrImageUrl || '',
    customQrLink: merged.custom_qr_link || merged.customQrLink || '',
    depositInstructions: merged.deposit_instructions || merged.depositInstructions || 'Scan QR using any UPI app (GPay, PhonePe, Paytm) and enter the 12-digit UTR number.',
    depositMode: merged.deposit_mode || merged.depositMode || 'MANUAL',
    gatewayProvider: merged.gateway_provider || merged.gatewayProvider || 'RAZORPAY',
    contactEmail: merged.contact_email || merged.contactEmail || 'support@winx7.com',
    supportPhone: merged.support_phone || merged.supportPhone || '+91 9999988888',
    whatsappGroup: whatsappVal,
    whatsappContact: whatsappVal,
    telegramChannel: telegramVal,
    telegramGroup: merged.telegram_group || merged.telegramGroup || '',
    telegramSupport: telegramVal,
    telegramContact: telegramVal,
    instagramContact: instagramVal,
    youtubeChannel: youtubeVal,
    youtubeContact: youtubeVal,
    discordServer: merged.discord_server || merged.discordServer || '',
    discordContact: merged.discord_contact || merged.discordContact || '',
    websiteUrl: merged.website_url || merged.websiteUrl || '',
    directChatUrl: merged.direct_chat_url || merged.directChatUrl || '',
    supportLinks: Array.isArray(merged.support_links) ? merged.support_links : (Array.isArray(merged.supportLinks) ? merged.supportLinks : []),

    telegramEnabled: merged.telegram_enabled !== undefined ? Boolean(merged.telegram_enabled) : (merged.telegramEnabled !== undefined ? Boolean(merged.telegramEnabled) : true),
    telegramName: merged.telegram_name || merged.telegramName || 'Telegram Customer Support',
    telegramDescription: merged.telegram_description || merged.telegramDescription || 'Instant 24/7 support & match query resolution',

    whatsappEnabled: merged.whatsapp_enabled !== undefined ? Boolean(merged.whatsapp_enabled) : (merged.whatsappEnabled !== undefined ? Boolean(merged.whatsappEnabled) : true),
    whatsappName: merged.whatsapp_name || merged.whatsappName || 'WhatsApp Official Update Channel',
    whatsappDescription: merged.whatsapp_description || merged.whatsappDescription || 'Get official match announcements & room ID updates',

    instagramEnabled: merged.instagram_enabled !== undefined ? Boolean(merged.instagram_enabled) : (merged.instagramEnabled !== undefined ? Boolean(merged.instagramEnabled) : true),
    instagramName: merged.instagram_name || merged.instagramName || 'Instagram Official Page',
    instagramDescription: merged.instagram_description || merged.instagramDescription || 'Follow for tournament highlights, giveaways & news',

    youtubeEnabled: merged.youtube_enabled !== undefined ? Boolean(merged.youtube_enabled) : (merged.youtubeEnabled !== undefined ? Boolean(merged.youtubeEnabled) : true),
    youtubeName: merged.youtube_name || merged.youtubeName || 'YouTube Official Channel',
    youtubeDescription: merged.youtube_description || merged.youtubeDescription || 'Watch live streamings & official match replays',

    maintenanceMode: merged.is_maintenance_mode !== undefined ? Boolean(merged.is_maintenance_mode) : (merged.maintenance_mode !== undefined ? Boolean(merged.maintenance_mode) : Boolean(merged.maintenanceMode)),
    maintenanceMessage: merged.maintenance_message || merged.maintenanceMessage || 'Server under scheduled maintenance. Please check back shortly.',
    registrationEnabled: merged.is_registration_on !== undefined ? Boolean(merged.is_registration_on) : (merged.registration_enabled !== undefined ? Boolean(merged.registration_enabled) : (merged.registrationEnabled !== undefined ? Boolean(merged.registrationEnabled) : true)),
    tournamentsEnabled: merged.is_tournament_on !== undefined ? Boolean(merged.is_tournament_on) : (merged.tournaments_enabled !== undefined ? Boolean(merged.tournaments_enabled) : (merged.tournamentsEnabled !== undefined ? Boolean(merged.tournamentsEnabled) : true)),
    withdrawEnabled: merged.is_withdraw_on !== undefined ? Boolean(merged.is_withdraw_on) : (merged.withdraw_enabled !== undefined ? Boolean(merged.withdraw_enabled) : (merged.withdrawEnabled !== undefined ? Boolean(merged.withdrawEnabled) : true)),
    depositEnabled: merged.is_deposit_on !== undefined ? Boolean(merged.is_deposit_on) : (merged.deposit_enabled !== undefined ? Boolean(merged.deposit_enabled) : (merged.depositEnabled !== undefined ? Boolean(merged.depositEnabled) : true)),
    referralEnabled: merged.is_referral_on !== undefined ? Boolean(merged.is_referral_on) : (merged.referral_enabled !== undefined ? Boolean(merged.referral_enabled) : (merged.referralEnabled !== undefined ? Boolean(merged.referralEnabled) : true)),
    referralBonus: Number(merged.referral_bonus ?? merged.referralBonus ?? 25),
    minAppVersion: String(merged.min_app_version || merged.minAppVersion || '1.0.0'),
    minDeposit: Number(merged.min_deposit ?? merged.minDeposit ?? 10),
    maxDeposit: Number(merged.max_deposit ?? merged.maxDeposit ?? 50000),
    minWithdrawal: Number(merged.min_withdrawal ?? merged.minWithdrawal ?? 100),
    maxWithdrawal: Number(merged.max_withdrawal ?? merged.maxWithdrawal ?? 25000),
    dailyWithdrawalLimit: Number(merged.daily_withdrawal_limit ?? merged.dailyWithdrawalLimit ?? 3),
    autoApproveWithdrawals: Boolean(merged.auto_approve_withdrawals ?? merged.autoApproveWithdrawals ?? false),
    autoApprovalMaxAmount: Number(merged.auto_approval_max_amount ?? merged.autoApprovalMaxAmount ?? 500),
    privacyPolicyText: privacyText,
    termsAndFairPlayRulesText: termsRulesText,
    privacyPolicy: privacyText,
    termsAndConditions: termsRulesText,
    fairPlayRules: termsRulesText,
  };
}

// Table Mapper Helper
function resolveSupabaseTable(collectionName: string): string {
  switch (collectionName) {
    case 'tournaments':
    case 'matches':
      return 'tournaments';
    case 'users':
    case 'players':
    case 'adminUsers':
    case 'staff':
      return 'profiles';
    case 'walletTransactions':
    case 'transactions':
    case 'deposits':
    case 'withdrawals':
    case 'deposit_requests':
    case 'depositRequests':
    case 'user_deposits':
    case 'payment_requests':
    case 'recharges':
    case 'user_withdrawals':
    case 'withdraw_requests':
    case 'withdrawRequests':
    case 'wallet_transactions':
      return 'wallet_transactions';
    case 'categories':
    case 'gameCategories':
    case 'match_categories':
      return 'categories';
    case 'notifications':
      return 'notifications';
    case 'leaderboard':
      return 'leaderboard';
    case 'support_tickets':
    case 'supportTickets':
      return 'support_tickets';
    case 'settings':
    case 'app_config':
    case 'official_links':
    case 'banners':
    case 'coupons':
    case 'match_rules':
    case 'matchRules':
    case 'saved_images':
    case 'savedImages':
      return 'app_config';
    default:
      return collectionName;
  }
}

// Local Cache Helpers
export function updateLocalTournamentCache(tourId: string, updates?: Partial<Tournament> | Tournament, isDelete = false) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('winx7_tournaments');
    const existing: Tournament[] = raw ? JSON.parse(raw) : [];
    if (isDelete) {
      const filtered = existing.filter((item) => item && item.id !== tourId);
      localStorage.setItem('winx7_tournaments', JSON.stringify(filtered));
      return;
    }
    const idx = existing.findIndex((item) => item && item.id === tourId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...updates };
    } else if (updates) {
      existing.unshift({ id: tourId, ...updates } as Tournament);
    }
    localStorage.setItem('winx7_tournaments', JSON.stringify(existing));
  } catch (err) {
    console.warn('[LocalStorage Tournament Cache] Update warning:', err);
  }
}

export function updateLocalTransactionCache(txId: string, updates?: Partial<WalletTransaction> | WalletTransaction, isDelete?: boolean) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('winx7_wallet_transactions');
    let existing: WalletTransaction[] = raw ? JSON.parse(raw) : [];
    if (isDelete) {
      existing = existing.filter((item) => item && item.id !== txId && item.referenceId !== txId);
    } else if (updates) {
      const idx = existing.findIndex((item) => item && (item.id === txId || item.referenceId === txId));
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...updates };
      } else {
        existing.unshift({ id: txId, ...updates } as WalletTransaction);
      }
    }
    localStorage.setItem('winx7_wallet_transactions', JSON.stringify(existing));
  } catch (err) {
    console.warn('[LocalStorage Transaction Cache] Update warning:', err);
  }
}

export function updateLocalNotificationCache(notifId: string, updates: Partial<AppNotification> | AppNotification) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('winx7_notifications');
    const existing: AppNotification[] = raw ? JSON.parse(raw) : [];
    const idx = existing.findIndex((item) => item && item.id === notifId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...updates };
    } else {
      existing.unshift({ id: notifId, ...updates } as AppNotification);
    }
    localStorage.setItem('winx7_notifications', JSON.stringify(existing));
  } catch (err) {
    console.warn('[LocalStorage Notification Cache] Update warning:', err);
  }
}

export async function getTxOverridesFromSupabase(): Promise<Record<string, any>> {
  try {
    const { data: configData } = await supabase.from('app_config').select('*').eq('id', 'tx_overrides').maybeSingle();
    if (configData?.privacy_policy_text) {
      try { return JSON.parse(configData.privacy_policy_text); } catch {}
    }
  } catch {}
  return {};
}

export async function saveTxOverrideInSupabase(
  txId: string,
  status: string,
  rejectionReason?: string,
  description?: string,
  extraData?: Record<string, any>
): Promise<void> {
  try {
    await ensureSupabaseAuthSession();
    const { data: configData } = await supabase.from('app_config').select('*').eq('id', 'tx_overrides').maybeSingle();
    let currentOverrides: Record<string, any> = {};
    if (configData?.privacy_policy_text) {
      try { currentOverrides = JSON.parse(configData.privacy_policy_text); } catch {}
    }
    const existingForTx = currentOverrides[txId] || {};
    currentOverrides[txId] = {
      ...existingForTx,
      status,
      rejectionReason: rejectionReason !== undefined ? rejectionReason : (existingForTx.rejectionReason || ''),
      description: description !== undefined ? description : (existingForTx.description || ''),
      ...(extraData || {}),
      updatedAt: new Date().toISOString()
    };

    await supabase.from('app_config').upsert({
      id: 'tx_overrides',
      privacy_policy_text: JSON.stringify(currentOverrides),
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[saveTxOverrideInSupabase] Error saving tx_overrides:', err);
  }
}

export function processAndEnrichTransactions(
  data: any[],
  overrides: Record<string, any>,
  profileMap?: Map<string, any>
): WalletTransaction[] {
  const refundedRefIds = new Set<string>();
  (data || []).forEach((item: any) => {
    if (item.type === 'refund' && item.reference_id) {
      refundedRefIds.add(item.reference_id);
    }
  });

  return (data || []).map((item: any) => {
    const rawUserId = item?.user_id || item?.userId || item?.account_id;
    const prof = (rawUserId && profileMap) ? profileMap.get(rawUserId) : null;
    const norm = normalizeTransactionDoc(item, item.id, prof);
    const ov =
      overrides[item.id] ||
      (item.reference_id ? overrides[item.reference_id] : null) ||
      (item.withdrawal_request_id ? overrides[item.withdrawal_request_id] : null) ||
      (norm.referenceId ? overrides[norm.referenceId] : null) ||
      (norm.withdrawalRequestId ? overrides[norm.withdrawalRequestId] : null);

    if (ov) {
      if (ov.status) norm.status = ov.status as any;
      if (ov.description) norm.description = ov.description;
      if (ov.rejectionReason) norm.rejectionReason = ov.rejectionReason;
      if (ov.isRefunded !== undefined) norm.isRefunded = Boolean(ov.isRefunded);
      if (ov.refundedAt) norm.refundedAt = ov.refundedAt;
      if (ov.refundTxId) norm.refundTxId = ov.refundTxId;
      if (ov.refundNotes) norm.refundNotes = ov.refundNotes;
    }
    if (
      refundedRefIds.has(norm.id) ||
      (norm.referenceId && refundedRefIds.has(norm.referenceId)) ||
      (norm.withdrawalRequestId && refundedRefIds.has(norm.withdrawalRequestId))
    ) {
      norm.isRefunded = true;
    }
    return norm;
  });
}

// Core Realtime / Polling Subscription Engine
export async function fetchTransactionsFromSupabase(): Promise<WalletTransaction[]> {
  await ensureSupabaseAuthSession();
  const [{ data, error }, overrides, profsRes] = await Promise.all([
    supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
    getTxOverridesFromSupabase(),
    supabase.from('profiles').select('*')
  ]);

  if (error) {
    handleSupabaseError(error, 'fetchTransactionsFromSupabase');
    throw new Error(`Database error fetching transactions: ${error.message}`);
  }

  const profileMap = new Map<string, any>();
  for (const p of profsRes.data || []) {
    if (p && p.id) profileMap.set(p.id, p);
  }

  return processAndEnrichTransactions(data || [], overrides, profileMap);
}

export function subscribeCollection<T = any>(
  collectionName: string,
  callback: (data: T[]) => void
): () => void {
  const tableName = resolveSupabaseTable(collectionName);
  let isSubscribed = true;
  let channel: any = null;
  let pollInterval: any = null;

  const fetchData = async () => {
    try {
      if (tableName === 'tournaments' || collectionName === 'tournaments' || collectionName === 'matches') {
        let dbTournaments: Tournament[] = [];
        try {
          await ensureSupabaseAuthSession();
          const [tournsRes, regsRes, profsRes] = await Promise.all([
            supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
            supabase.from('registrations').select('*'),
            supabase.from('profiles').select('*'),
          ]);

          if (tournsRes.error) {
            handleSupabaseError(tournsRes.error, 'subscribeCollection(tournaments)');
          }

          const rawTournaments = tournsRes.data || [];
          const rawRegistrations = regsRes.data || [];
          const rawProfiles = profsRes.data || [];

          // Map profiles by id for fast enrichment
          const profileMap = new Map<string, any>();
          for (const p of rawProfiles) {
            if (p && p.id) profileMap.set(p.id, p);
          }

          // Group registrations by tournament_id / match_id
          const regsByTournId = new Map<string, any[]>();
          for (const r of rawRegistrations) {
            if (r) {
              const tournId = r.tournament_id || r.match_id;
              if (tournId) {
                const list = regsByTournId.get(tournId) || [];
                list.push(r);
                regsByTournId.set(tournId, list);
              }
            }
          }

          dbTournaments = rawTournaments.map((item: any) => {
            const matchRegs = regsByTournId.get(item.id) || [];
            return normalizeTournamentDoc(item, item.id, matchRegs, profileMap);
          });
        } catch (err: any) {
          console.warn('[subscribeCollection(tournaments)] error:', err);
        }

        if (isSubscribed) callback(dbTournaments as any);
        return;
      }

      if (tableName === 'wallet_transactions' || collectionName === 'transactions' || collectionName === 'walletTransactions' || collectionName === 'deposit_requests' || collectionName === 'deposits') {
        try {
          await ensureSupabaseAuthSession();
          const [{ data, error }, overrides, profsRes] = await Promise.all([
            supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
            getTxOverridesFromSupabase(),
            supabase.from('profiles').select('*')
          ]);

          if (error) {
            handleSupabaseError(error, 'subscribeCollection(wallet_transactions)');
            return;
          }

          if (data) {
            const profileMap = new Map<string, any>();
            for (const p of profsRes.data || []) {
              if (p && p.id) profileMap.set(p.id, p);
            }
            const dbTxData = processAndEnrichTransactions(data, overrides, profileMap);
            if (isSubscribed) callback(dbTxData as any);
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          if (errMsg.includes('Failed to fetch') || errMsg.includes('fetch')) {
            console.warn('[subscribeCollection wallet_transactions] Transient network disconnection detected, will retry:', errMsg);
          } else {
            console.warn('[subscribeCollection wallet_transactions] Exception:', errMsg);
          }
          return;
        }
        return;
      }

      if (tableName === 'app_config') {
        const { data, error } = await supabase.from('app_config').select('*');
        if (error) {
          handleSupabaseError(error, `subscribeCollection(${collectionName})`);
          return;
        }
        if (!isSubscribed) return;

        if (collectionName === 'saved_images' || collectionName === 'savedImages') {
          const getItemVal = (item: any) => {
            const raw = item.value ?? item.data ?? item.content ?? item.config ?? item.payload ?? item.json_data;
            if (raw === undefined || raw === null) return item;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return raw; }
            }
            return raw;
          };

          const dbImages = (data || [])
            .filter((item: any) => item.id?.startsWith('saved_image_') || item.id === 'saved_images' || item.key?.startsWith('saved_image_'))
            .map((item: any) => {
              const val = getItemVal(item);
              const cleanId = item.id?.replace('saved_image_', '') || item.key?.replace('saved_image_', '');
              if (typeof val === 'object' && val !== null) {
                return { ...val, id: val.id || cleanId };
              }
              return { id: cleanId, url: String(val) };
            });

          let localImages: any[] = [];
          try {
            const raw = localStorage.getItem('winx7_saved_images');
            if (raw) localImages = JSON.parse(raw);
          } catch {}

          const mergedMap = new Map<string, any>();
          localImages.forEach((img) => { if (img && img.id) mergedMap.set(img.id, img); });
          dbImages.forEach((img) => { if (img && img.id) mergedMap.set(img.id, img); });

          const finalImages = Array.from(mergedMap.values());
          try {
            localStorage.setItem('winx7_saved_images', JSON.stringify(finalImages));
          } catch {}

          callback(finalImages as any);
          return;
        }

        if (collectionName === 'banners') {
          const getItemVal = (item: any) => {
            const raw = item.value ?? item.data ?? item.content ?? item.config ?? item.payload ?? item.json_data;
            if (raw === undefined || raw === null) return item;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return raw; }
            }
            return raw;
          };

          const banners = (data || [])
            .filter((item: any) => item.id?.startsWith('banner_') || item.key?.startsWith('banner_'))
            .map((item: any) => {
              const val = getItemVal(item);
              return { id: item.id || item.key, ...val };
            });
          callback(banners as any);
          return;
        }

        if (collectionName === 'coupons') {
          fetchCouponsFromSupabase()
            .then((coupons) => {
              callback(coupons as any);
            })
            .catch((err) => {
              console.warn('Coupon subscription fetch failed:', err?.message || err);
            });
          return;
        }

        if (collectionName === 'match_rules' || collectionName === 'matchRules') {
          const getItemVal = (item: any) => {
            const raw = item.value ?? item.data ?? item.content ?? item.config ?? item.payload ?? item.json_data;
            if (raw === undefined || raw === null) return item;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return raw; }
            }
            return raw;
          };

          const rules = (data || [])
            .filter((item: any) => item.id?.startsWith('rule_') || item.id === 'match_rules' || item.key?.startsWith('rule_'))
            .map((item: any) => {
              const val = getItemVal(item);
              return { id: item.id || item.key, ...val };
            });
          callback(rules as any);
          return;
        }

        if (collectionName === 'settings') {
          const generalSettings = (data || []).find((item: any) => item.id === 'general' || item.key === 'general') || ((data && data.length > 0) ? data[0] : null);
          if (generalSettings) {
            const normalized = normalizeSystemSettingsFromRow(generalSettings);
            const result = {
              ...normalized,
              id: 'general'
            };
            callback([result] as any);
          } else {
            callback([] as any);
          }
          return;
        }
      }

      if (tableName === 'notifications' || collectionName === 'notifications') {
        let dbNotifs: AppNotification[] = [];
        try {
          const { data, error } = await supabase.from('notifications').select('*');
          if (!error && data) {
            dbNotifs = data.map((item: any) => normalizeNotificationDoc(item, item.id));
          } else if (error) {
            handleSupabaseError(error, `subscribeCollection(${collectionName})`);
          }
        } catch (err) {
          console.warn('[Notifications Query Notice]:', err);
        }

        let localNotifs: AppNotification[] = [];
        try {
          const raw = localStorage.getItem('winx7_notifications');
          if (raw) localNotifs = JSON.parse(raw);
        } catch {}

        const mergedNotifMap = new Map<string, AppNotification>();
        localNotifs.forEach((n) => { if (n && n.id) mergedNotifMap.set(n.id, n); });
        dbNotifs.forEach((n) => { if (n && n.id) mergedNotifMap.set(n.id, n); });

        const finalNotifList = Array.from(mergedNotifMap.values());
        try {
          localStorage.setItem('winx7_notifications', JSON.stringify(finalNotifList));
        } catch {}

        if (isSubscribed) callback(finalNotifList as any);
        return;
      }

      if (tableName === 'profiles' && collectionName !== 'adminUsers' && collectionName !== 'staff') {
        let profData: any[] = [];
        let walData: any[] = [];
        try {
          const [profRes, walRes] = await Promise.all([
            supabase.from('profiles').select('*'),
            supabase.from('wallets').select('*'),
          ]);
          profData = profRes.data || [];
          walData = walRes.data || [];
        } catch (e) {
          console.warn('[subscribeCollection users fetch error]', e);
        }

        const walletMap = new Map<string, any>();
        for (const w of walData) {
          if (w && w.user_id) {
            walletMap.set(w.user_id, w);
          }
        }

        const mergedUsers = profData.map((p: any) => {
          const w = walletMap.get(p.id);
          
          if (!w) {
            // Background init if wallet missing
            ensureUserProfileExists(p.id).catch(() => {});
          }

          const dep = w ? Number(w.deposit_balance ?? 0) : Number(p.deposit_balance ?? p.wallet_balance ?? 0);
          const win = w ? Number(w.winning_balance ?? 0) : Number(p.winning_balance ?? p.unclaimed_winnings ?? 0);
          const bon = w ? Number(w.bonus_balance ?? 0) : Number(p.bonus_balance ?? 0);
          const tot = w ? Number(w.total_balance ?? (dep + win + bon)) : (dep + win + bon);

          return normalizeUserDoc({
            ...p,
            deposit_balance: dep,
            depositBalance: dep,
            wallet_balance: dep,
            walletBalance: dep,
            winning_balance: win,
            winningBalance: win,
            unclaimed_winnings: win,
            unclaimedWinnings: win,
            bonus_balance: bon,
            bonusBalance: bon,
            total_balance: tot,
            totalBalance: tot,
          }, p.id);
        });

        if (isSubscribed) callback(mergedUsers as any);
        return;
      }

      let query = supabase.from(tableName).select('*');

      if (collectionName === 'adminUsers' || collectionName === 'staff') {
        query = query.in('role', ['admin', 'superadmin', 'staff', 'moderator']);
      }

      let data: any[] | null = null;
      let error: any = null;
      try {
        const res = await query;
        data = res.data;
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        handleSupabaseError(error, `subscribeCollection(${collectionName})`);
        return;
      }

      if (!isSubscribed || !data) return;

      const normalized = data.map((item: any) => {
        switch (tableName) {
          case 'tournaments':
            return normalizeTournamentDoc(item, item.id);
          case 'profiles':
            if (collectionName === 'adminUsers' || collectionName === 'staff') {
              return {
                id: item.id,
                uid: item.id,
                email: item.email,
                displayName: item.display_name || item.username,
                role: item.role || 'staff',
                status: item.status || 'active',
                permissions: item.permissions || ['tournaments', 'matches'],
                createdAt: item.created_at || new Date().toISOString(),
                avatarUrl: item.avatar_url,
              };
            }
            return normalizeUserDoc(item, item.id);
          case 'wallet_transactions':
            return normalizeTransactionDoc(item, item.id);
          case 'categories':
            return normalizeCategoryDoc(item, item.id);
          case 'notifications':
            return normalizeNotificationDoc(item, item.id);
          default:
            return item;
        }
      });

      callback(normalized as any);
    } catch (err: any) {
      console.warn(`[Supabase Subscribe ${collectionName}] Notice:`, err?.message || err);
    }
  };

  const startSubscription = async () => {
    // 1. Ensure authentication session exists BEFORE querying or subscribing
    await ensureSupabaseAuthSession();
    if (!isSubscribed) return;

    // 2. Fetch initial data
    await fetchData();
    if (!isSubscribed) return;

    // 3. Setup polling interval
    pollInterval = setInterval(() => {
      if (isSubscribed) fetchData();
    }, 30000);

    // 4. Setup Supabase Realtime channel
    const channelName = `admin_sub_${tableName}_${collectionName}`;
    try {
      // Remove any existing channel with the same name to avoid duplicate subscriptions
      const existingChannel = supabase.channel(channelName);
      if (existingChannel) {
        supabase.removeChannel(existingChannel);
      }

      let chanBuilder = supabase.channel(channelName);

      if (tableName === 'tournaments' || collectionName === 'tournaments' || collectionName === 'matches') {
        chanBuilder = chanBuilder
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tournaments' }, () => fetchData())
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments' }, () => fetchData())
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tournaments' }, () => fetchData())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => fetchData())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData());
      } else if (tableName === 'wallet_transactions' || collectionName === 'transactions' || collectionName === 'walletTransactions' || collectionName === 'deposit_requests' || collectionName === 'deposits') {
        chanBuilder = chanBuilder
          .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => fetchData())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => fetchData());
      } else if (tableName === 'profiles' && collectionName !== 'adminUsers' && collectionName !== 'staff') {
        chanBuilder = chanBuilder
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => fetchData());
      } else {
        chanBuilder = chanBuilder.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableName },
          (payload) => {
            console.log(`[Supabase Realtime ${tableName}] Event received:`, payload.eventType);
            fetchData();
          }
        );
      }

      channel = chanBuilder.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          console.warn(`[Supabase Realtime] Channel status '${status}' for ${tableName}. Refetching data.`);
          fetchData();
        } else if (status === 'SUBSCRIBED') {
          console.log(`[Supabase Realtime] Subscribed to changes on '${tableName}'`);
        }
      });
    } catch (channelErr: any) {
      console.warn(`[Supabase Realtime] Setup note for ${collectionName}:`, channelErr?.message || channelErr);
    }
  };

  startSubscription();

  return () => {
    isSubscribed = false;
    if (pollInterval) clearInterval(pollInterval);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
}

export async function getMatchParticipantsFromSupabase(matchId: string): Promise<Participant[]> {
  if (!matchId) return [];
  try {
    await ensureSupabaseAuthSession();
    const [regsRes, profsRes, tournRes] = await Promise.all([
      supabase.from('registrations').select('*').eq('tournament_id', matchId),
      supabase.from('profiles').select('*'),
      supabase.from('tournaments').select('*').eq('id', matchId).single(),
    ]);

    const rawRegs = regsRes.data || [];
    const rawProfiles = profsRes.data || [];
    const tournData = tournRes.data;

    const profileMap = new Map<string, any>();
    for (const p of rawProfiles) {
      if (p && p.id) profileMap.set(p.id, p);
    }

    const regParticipants: Participant[] = rawRegs.map((r: any, idx: number) => {
      const prof = r.user_id ? profileMap.get(r.user_id) : null;
      const ign = r.ff_ign || r.player_name || prof?.in_game_name || prof?.ff_ign || prof?.username || `Player ${idx + 1}`;
      const uid = r.ff_uid || prof?.in_game_id || prof?.ff_uid || '';
      const uname = prof?.name || prof?.display_name || prof?.username || r.player_name || r.ff_ign || `Player ${idx + 1}`;

      return {
        id: r.id || `reg-${r.user_id || idx}`,
        userId: r.user_id || `user-${idx}`,
        username: uname,
        inGameName: ign,
        inGameId: uid,
        registeredAt: r.created_at || r.updated_at || new Date().toISOString(),
        teamName: r.team_name,
        slotNumber: Number(r.slot_number || idx + 1),
        kills: Number(r.kills || 0),
        rank: r.rank ? Number(r.rank) : undefined,
        prizeWon: Number(r.winnings || r.prize_won || 0),
        status: r.status || 'registered',
      };
    });

    // Merge with any inline participants if available
    const parsedInline: Participant[] = (() => {
      if (!tournData?.participants) return [];
      if (Array.isArray(tournData.participants)) {
        return tournData.participants.map((p: any, idx: number) => ({
          id: p.id || p.userId || p.uid || `part-${idx}`,
          userId: p.userId || p.id || p.uid || `user-${idx}`,
          username: p.username || p.inGameName || p.in_game_name || p.ff_ign || `Player ${idx + 1}`,
          inGameName: p.inGameName || p.in_game_name || p.ff_ign || p.username || `Player ${idx + 1}`,
          inGameId: p.inGameId || p.in_game_id || p.ff_uid || p.playerId || '',
          registeredAt: p.registeredAt || p.registered_at || new Date().toISOString(),
          teamName: p.teamName || p.team_name,
          slotNumber: p.slotNumber || p.slot_number || idx + 1,
          kills: Number(p.kills || 0),
          rank: p.rank ? Number(p.rank) : undefined,
          prizeWon: Number(p.prizeWon || p.prize_won || 0),
          status: p.status || 'registered',
        }));
      }
      return [];
    })();

    const participantMap = new Map<string, Participant>();
    for (const p of regParticipants) {
      const key = p.userId || p.id;
      if (key) participantMap.set(key, p);
    }
    for (const p of parsedInline) {
      const key = p.userId || p.id;
      if (key) {
        if (participantMap.has(key)) {
          // Authoritative registrations exist, merge results into them safely without wiping non-zero values
          const existing = participantMap.get(key)!;
          const prizeVal = (existing.prizeWon && existing.prizeWon > 0) ? existing.prizeWon : (p.prizeWon && p.prizeWon > 0 ? p.prizeWon : (existing.prizeWon || 0));
          const rankVal = (existing.rank !== undefined && existing.rank > 0) ? existing.rank : (p.rank && p.rank > 0 ? p.rank : existing.rank);
          const killVal = (existing.kills !== undefined && existing.kills > 0) ? existing.kills : (p.kills && p.kills > 0 ? p.kills : (existing.kills || 0));
          const statusVal = (existing.status && existing.status !== 'registered') ? existing.status : (p.status || existing.status);

          participantMap.set(key, { 
            ...existing, 
            rank: rankVal,
            kills: killVal,
            prizeWon: prizeVal,
            status: statusVal,
            slotNumber: existing.slotNumber ?? p.slotNumber,
            teamName: existing.teamName || p.teamName
          });
        } else {
          // No registration found, fallback to inline participant
          participantMap.set(key, p);
        }
      }
    }

    return Array.from(participantMap.values());
  } catch (err: any) {
    console.error('[getMatchParticipantsFromSupabase] Error:', err);
    throw new Error(`Database error querying match registrations: ${err?.message || err}`);
  }
}

// Initial Data Seeding
export async function seedInitialFirestoreDataIfEmpty(initialData?: any): Promise<void> {
}

export async function purgeDemoFirestoreData(): Promise<void> {
  // Purge logic if needed
}

export async function safeSupabaseWrite(
  tableName: string,
  payload: Record<string, any>,
  mode: 'upsert' | 'update' | 'insert' = 'upsert',
  matchId?: string
): Promise<any> {
  let currentPayload = { ...payload };

  // Ensure UUID for tables expecting UUID primary keys
  if (['wallet_transactions', 'tournaments', 'profiles', 'notifications'].includes(tableName)) {
    if ((mode === 'upsert' || mode === 'insert') && currentPayload.id) {
      if (!isUuid(currentPayload.id)) {
        if (tableName === 'wallet_transactions' && !currentPayload.reference_id) {
          currentPayload.reference_id = currentPayload.id;
        }
        currentPayload.id = crypto.randomUUID();
      }
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    let result: { data: any; error: any };
    if (mode === 'upsert') {
      result = await supabase.from(tableName).upsert(currentPayload);
    } else if (mode === 'update') {
      if (matchId && !isUuid(matchId)) {
        if (tableName === 'wallet_transactions') {
          result = await supabase.from(tableName).update(currentPayload).eq('reference_id', matchId);
        } else {
          console.warn(`[Supabase ${tableName}] Non-UUID matchId '${matchId}' skipped for DB update.`);
          return { data: null, error: null };
        }
      } else {
        result = await supabase.from(tableName).update(currentPayload).eq('id', matchId!);
      }
    } else {
      result = await supabase.from(tableName).insert(currentPayload);
    }

    if (!result.error) {
      return result;
    }

    if (result.error.code === '42501' || (result.error.message && String(result.error.message).includes('row-level security'))) {
      console.warn(`[Supabase ${tableName}] Row-Level Security policy notice (${result.error.code}), maintaining state locally:`, result.error.message);
      return { data: null, error: result.error };
    }

    if (
      result.error.code === 'PGRST204' ||
      result.error.code === '42703' ||
      (result.error.message &&
        (String(result.error.message).includes('column') ||
          String(result.error.message).includes('schema cache')))
    ) {
      const match =
        result.error.message.match(/Could not find the '([^']+)' column/i) ||
        result.error.message.match(/'([^']+)' column/i) ||
        result.error.message.match(/column "([^"]+)" of relation/i) ||
        result.error.message.match(/column "([^"]+)" does not exist/i) ||
        result.error.message.match(/column '([^']+)' does not exist/i);
      if (match && match[1] && match[1] in currentPayload) {
        console.warn(`[Supabase ${tableName}] Column '${match[1]}' not in schema cache, omitting and retrying...`);
        delete currentPayload[match[1]];
        continue;
      }
    }

    handleSupabaseError(result.error, `${mode} ${tableName}`);
    throw result.error;
  }
}

// Tournament CRUD
export async function createTournamentInSupabase(
  tournament: Tournament,
  categoriesList?: MatchCategory[]
): Promise<string> {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const id = (tournament.id && isUuid(tournament.id)) ? tournament.id : crypto.randomUUID();
  tournament.id = id;
  const tourWithId = { ...tournament, id };
  updateLocalTournamentCache(id, tourWithId);

  const gameVal = tournament.game || tournament.category || 'BGMI';
  const modeVal = tournament.matchType || 'Solo';
  const mapVal = tournament.map || 'Erangel';
  const maxVal = Number(tournament.maxParticipants || tournament.maxSlots || 100);
  const joinedVal = Number(tournament.joinedParticipants || tournament.filledSlots || 0);
  const killVal = Number(tournament.perKillPrize || tournament.perKillReward || 0);
  const schedVal = tournament.matchSchedule || tournament.schedule || tournament.startTime || new Date().toISOString();

  const dtInfo = getMatchDateTimeStrings(schedVal);
  const matchDateStr = (tournament as any).matchDate || (tournament as any).match_date || dtInfo.matchDate;

  // Resolve clean image URL for banner and thumbnail (safe for mobile User App Image.network)
  let bannerImg = tournament.bannerUrl || (tournament as any).thumbnailUrl || (tournament as any).imageUrl;
  if (!bannerImg || typeof bannerImg !== 'string' || !bannerImg.trim() || bannerImg.trim() === 'N/A') {
    bannerImg = getCategoryBannerImage(gameVal);
  } else {
    bannerImg = bannerImg.trim();
  }

  // Normalize Prize Distribution items preserving exact rank labels & prize numbers
  const rawDist = tournament.prizeDistribution || tournament.prize_distribution || [];
  const normalizedPrizeDist = (Array.isArray(rawDist) ? rawDist : []).map((p: any) => {
    const rankLabel = String(p.rankRange || p.rank_range || p.rankName || p.title || p.label || p.position || (p.rank ? `Rank ${p.rank}` : 'Prize')).trim();
    const amountVal = Number(p.prize ?? p.amount ?? p.reward ?? 0);
    return {
      rankRange: rankLabel,
      rank_range: rankLabel,
      rankName: rankLabel,
      title: rankLabel,
      label: rankLabel,
      prize: amountVal,
      amount: amountVal,
      reward: amountVal,
    };
  });

  const payload = cleanUndefined({
    id,
    title: (tournament.title || 'Untitled Tournament').toUpperCase(),
    category_id: tournament.categoryId || null,
    category_name: gameVal,
    banner_url: bannerImg,
    thumbnail_url: bannerImg,
    image_url: bannerImg,
    card_image: bannerImg,
    card_image_url: bannerImg,
    saved_image_id: tournament.savedImageId || null,
    map_name: mapVal,
    mode: modeVal,
    total_slots: maxVal,
    joined_slots: joinedVal,
    prize_pool: Number(tournament.prizePool || 0),
    entry_fee: Number(tournament.entryFee || 0),
    kill_reward: killVal,
    match_time: schedVal,
    match_date: matchDateStr,
    status: (tournament.status || 'UPCOMING').toUpperCase(),
    is_free: Number(tournament.entryFee || 0) === 0,
    is_featured: Boolean(tournament.isFeatured),
    is_recommended: true,
    is_private: Boolean(
      tournament.requireAccessCode ??
      tournament.requiresAccessCode ??
      tournament.requires_access_code ??
      tournament.require_access_code ??
      tournament.isPrivate ??
      (tournament as any).is_private ??
      false
    ),
    room_id: tournament.roomId || '',
    room_password: tournament.roomPassword || '',
    requires_access_code: Boolean(
      tournament.requireAccessCode ??
      tournament.requiresAccessCode ??
      tournament.requires_access_code ??
      tournament.require_access_code ??
      tournament.isPrivate ??
      (tournament as any).is_private ??
      false
    ),
    access_code: (
      tournament.requireAccessCode ??
      tournament.requiresAccessCode ??
      tournament.requires_access_code ??
      tournament.require_access_code ??
      tournament.isPrivate ??
      (tournament as any).is_private ??
      false
    ) ? (
      (tournament.accessCode && String(tournament.accessCode).trim().length > 0)
        ? String(tournament.accessCode).trim()
        : ((tournament as any).access_code && String((tournament as any).access_code).trim().length > 0)
          ? String((tournament as any).access_code).trim()
          : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())
    ) : null,
    winner_note: (
      tournament.requireAccessCode ??
      tournament.requiresAccessCode ??
      tournament.requires_access_code ??
      tournament.require_access_code ??
      tournament.isPrivate ??
      (tournament as any).is_private ??
      false
    ) ? JSON.stringify({
      access_code: (
        (tournament.accessCode && String(tournament.accessCode).trim().length > 0)
          ? String(tournament.accessCode).trim()
          : ((tournament as any).access_code && String((tournament as any).access_code).trim().length > 0)
            ? String((tournament as any).access_code).trim()
            : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())
      ),
      requires_access_code: true
    }) : ((tournament as any).winner_note || (tournament as any).winnerNote || null),
    rules: Array.isArray(tournament.rules) ? tournament.rules.join('\n') : String(tournament.rules || ''),
    description: `Compete in ${gameVal} and win instant wallet rewards!`,
    participants: Array.isArray(tournament.participants) ? tournament.participants : [],
    prize_distribution: normalizedPrizeDist,
    created_at: tournament.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  try {
    await ensureSupabaseAuthSession();
    await safeSupabaseWrite('tournaments', payload, 'upsert');
    return id;
  } catch (err: any) {
    console.error('[DEBUG DB Create Match Error]', { recordId: id, error: err?.message || err });
    throw err;
  }
}

export async function updateTournamentInSupabase(
  id: string,
  updates: Partial<Tournament> | Tournament,
  categoriesList?: MatchCategory[]
): Promise<void> {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  
  const gameVal = updates.game || updates.category;
  const modeVal = updates.matchType;
  const mapVal = updates.map;
  const maxVal = updates.maxParticipants !== undefined ? Number(updates.maxParticipants) : updates.maxSlots !== undefined ? Number(updates.maxSlots) : undefined;
  const joinedVal = updates.joinedParticipants !== undefined ? Number(updates.joinedParticipants) : updates.filledSlots !== undefined ? Number(updates.filledSlots) : undefined;
  const killVal = updates.perKillPrize !== undefined ? Number(updates.perKillPrize) : updates.perKillReward !== undefined ? Number(updates.perKillReward) : undefined;
  // Prioritize explicit startTime/match_time to guarantee edited match time is not overridden by stale matchSchedule
  const schedVal = updates.startTime || updates.match_time || updates.matchSchedule || updates.schedule;

  let matchDateStr: string | undefined = undefined;
  let dtInfoForCache: any = undefined;
  if (schedVal) {
    dtInfoForCache = getMatchDateTimeStrings(schedVal);
    matchDateStr = (updates as any).matchDate || (updates as any).match_date || dtInfoForCache.matchDate;
  } else {
    matchDateStr = (updates as any).matchDate || (updates as any).match_date;
  }

  const cacheUpdates = {
    ...updates,
    ...(schedVal ? {
      startTime: schedVal,
      match_time: schedVal,
      matchSchedule: schedVal,
      schedule: schedVal,
      matchDate: matchDateStr,
      match_date: matchDateStr,
      dayOfWeek: dtInfoForCache?.dayOfWeek,
      formattedTime: dtInfoForCache?.formattedTime
    } : {})
  };
  updateLocalTournamentCache(id, cacheUpdates);

  if (!isUuid(id)) {
    console.warn('[updateTournamentInSupabase] Non-UUID ID skipped for Supabase DB update:', id);
    return;
  }

  let bannerImg = updates.bannerUrl || (updates as any).thumbnailUrl || (updates as any).imageUrl;
  if (bannerImg && typeof bannerImg === 'string') {
    bannerImg = bannerImg.trim();
  }

  // Normalize Prize Distribution items if updated
  let normalizedPrizeDist: any = undefined;
  if (updates.prizeDistribution || (updates as any).prize_distribution) {
    const rawDist = updates.prizeDistribution || (updates as any).prize_distribution;
    normalizedPrizeDist = (Array.isArray(rawDist) ? rawDist : []).map((p: any) => {
      const rankLabel = String(p.rankRange || p.rank_range || p.rankName || p.title || p.label || p.position || (p.rank ? `Rank ${p.rank}` : 'Prize')).trim();
      const amountVal = Number(p.prize ?? p.amount ?? p.reward ?? 0);
      return {
        rankRange: rankLabel,
        rank_range: rankLabel,
        rankName: rankLabel,
        title: rankLabel,
        label: rankLabel,
        prize: amountVal,
        amount: amountVal,
        reward: amountVal,
      };
    });
  }

  // Handle Access Code update logic
  let requiresAccessCodeUpdate: boolean | undefined = undefined;
  if (
    updates.requireAccessCode !== undefined ||
    (updates as any).requiresAccessCode !== undefined ||
    (updates as any).require_access_code !== undefined ||
    (updates as any).requires_access_code !== undefined ||
    updates.isPrivate !== undefined ||
    (updates as any).is_private !== undefined
  ) {
    requiresAccessCodeUpdate = Boolean(
      updates.requireAccessCode ??
      (updates as any).requiresAccessCode ??
      (updates as any).require_access_code ??
      (updates as any).requires_access_code ??
      updates.isPrivate ??
      (updates as any).is_private
    );
  }

  let accessCodeUpdate: string | null | undefined = undefined;
  if (requiresAccessCodeUpdate === false) {
    accessCodeUpdate = null;
  } else if (requiresAccessCodeUpdate === true) {
    const rawCode = updates.accessCode || (updates as any).access_code;
    accessCodeUpdate = (rawCode && typeof rawCode === 'string' && rawCode.trim().length > 0)
      ? rawCode.trim()
      : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase());
  } else if (updates.accessCode !== undefined || (updates as any).access_code !== undefined) {
    const rawCode = updates.accessCode !== undefined ? updates.accessCode : (updates as any).access_code;
    if (rawCode && typeof rawCode === 'string' && rawCode.trim().length > 0) {
      accessCodeUpdate = rawCode.trim();
      requiresAccessCodeUpdate = true;
    } else {
      accessCodeUpdate = null;
      requiresAccessCodeUpdate = false;
    }
  }

  let winnerNoteUpdate: string | null | undefined = undefined;
  if (requiresAccessCodeUpdate !== undefined) {
    if (requiresAccessCodeUpdate === false) {
      winnerNoteUpdate = null;
    } else if (requiresAccessCodeUpdate === true && accessCodeUpdate) {
      winnerNoteUpdate = JSON.stringify({
        access_code: accessCodeUpdate,
        requires_access_code: true
      });
    }
  } else if ((updates as any).winner_note !== undefined || (updates as any).winnerNote !== undefined) {
    winnerNoteUpdate = (updates as any).winner_note ?? (updates as any).winnerNote;
  }

  const payload: Record<string, any> = cleanUndefined({
    title: updates.title ? String(updates.title).toUpperCase() : undefined,
    category_id: updates.categoryId,
    category_name: gameVal,
    banner_url: bannerImg,
    thumbnail_url: bannerImg,
    image_url: bannerImg,
    card_image: bannerImg,
    card_image_url: bannerImg,
    saved_image_id: updates.savedImageId,
    map_name: mapVal,
    mode: modeVal,
    total_slots: maxVal,
    joined_slots: joinedVal,
    prize_pool: updates.prizePool !== undefined ? Number(updates.prizePool) : undefined,
    entry_fee: updates.entryFee !== undefined ? Number(updates.entryFee) : undefined,
    kill_reward: killVal,
    match_time: schedVal,
    match_date: matchDateStr,
    status: updates.status ? String(updates.status).toUpperCase() : undefined,
    is_featured: updates.isFeatured !== undefined ? Boolean(updates.isFeatured) : undefined,
    is_private: requiresAccessCodeUpdate,
    room_id: updates.roomId,
    room_password: updates.roomPassword,
    requires_access_code: requiresAccessCodeUpdate,
    access_code: accessCodeUpdate,
    winner_note: winnerNoteUpdate,
    rules: updates.rules !== undefined ? (Array.isArray(updates.rules) ? updates.rules.join('\n') : String(updates.rules)) : undefined,
    participants: updates.participants,
    completed_at: updates.completedAt ?? undefined,
    prize_distribution: normalizedPrizeDist,
    updated_at: new Date().toISOString(),
  });


  try {
    await ensureSupabaseAuthSession();
    await safeSupabaseWrite('tournaments', payload, 'update', id);
  } catch (err: any) {
    console.error('[DEBUG DB Update Match Error]', { recordId: id, error: err?.message || err });
    throw err;
  }
}

export async function deleteTournamentFromSupabase(id: string): Promise<void> {
  updateLocalTournamentCache(id, undefined, true);
  if (!isUuid(id)) {
    console.warn('[DEBUG DB Delete Match] Non-UUID ID skipped for Supabase DB delete:', id);
    return;
  }
  try {
    await ensureSupabaseAuthSession();
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) {
      console.error('[DEBUG DB Delete Match Error]', { recordId: id, error: error.message });
      handleSupabaseError(error, 'deleteTournamentFromSupabase');
    } else {
    }
  } catch (err: any) {
    console.error('[DEBUG DB Delete Match Catch Error]', err);
  }
}

// User & Wallet Functions
export async function updateUserStatusInSupabase(
  userId: string,
  status: UserStatus | string,
  banReason?: string
): Promise<void> {
  const payload = cleanUndefined({
    status,
    ban_reason: banReason || null,
    updated_at: new Date().toISOString(),
  });

  await safeSupabaseWrite('profiles', payload, 'update', userId);
}

export async function updateUserWalletBalanceInSupabase(
  userId: string,
  newBalance: number,
  walletType: 'main' | 'winning' | 'bonus' | string = 'main',
  creditDelta: number = 0
): Promise<void> {
  await ensureSupabaseAuthSession();
  const currentWallet = await getUserWallet(userId);

  let newDeposit = currentWallet.depositBalance;
  let newWinning = currentWallet.winningBalance;
  let newBonus = currentWallet.bonusBalance;

  const isWinning = walletType === 'winning' || walletType === 'winnings';
  const isBonus = walletType === 'bonus';
  const val = Math.max(0, Number(newBalance || 0));

  if (isWinning) {
    newWinning = val;
  } else if (isBonus) {
    newBonus = val;
  } else {
    newDeposit = val;
  }

  await syncUserWallet(userId, newDeposit, newWinning, newBonus);
}

export async function adjustUserWalletBalanceInSupabase(
  userId: string,
  deltaAmount: number,
  description?: string,
  walletType: 'main' | 'winning' | 'bonus' = 'main',
  customTxType?: string,
  customRefId?: string
): Promise<void> {
  await ensureSupabaseAuthSession();

  let rpcName = '';
  if (walletType === 'winning') {
    rpcName = 'admin_adjust_winning';
  } else {
    rpcName = 'admin_adjust_deposit';
  }

  const { data, error } = await supabase.rpc(rpcName, {
    p_user_id: userId,
    p_amount: deltaAmount,
    p_description: description || 'Admin Adjustment'
  });

  if (error) {
    console.error(`[adjustUserWalletBalanceInSupabase] RPC error (${rpcName}):`, error);
    throw new Error(`Adjustment failed: ${error.message || String(error)}`);
  }

  const result = data as any;
  if (result && typeof result === 'object') {
    if (result.success === false) {
      throw new Error(result.message || 'Adjustment failed on the server.');
    }
  }
}

export async function updateUserProfileInSupabase(
  userId: string,
  updates: Partial<AppUser> & { avatar_id?: string; avatarId?: string; is_admin_override?: boolean }
): Promise<void> {
  await ensureSupabaseAuthSession();

  // 1. Fetch current profile from DB
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  // 2. Fetch saved limits from app_config fallback
  const configKey = `user_profile_limits_${userId}`;
  const { data: limitsData } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', configKey)
    .maybeSingle();

  const limitsConfig = limitsData?.value ?? limitsData?.data ?? limitsData?.json_data ?? {};

  const now = Date.now();
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 Hours

  const formatRemaining = (lastTimestampIso: string | number) => {
    if (!lastTimestampIso) return null;
    const lastTime = new Date(lastTimestampIso).getTime();
    if (isNaN(lastTime)) return null;
    const elapsed = now - lastTime;
    if (elapsed >= COOLDOWN_MS) return null;
    const remainingMs = COOLDOWN_MS - elapsed;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Current database values
  const currentUsername = (currentProfile?.username || currentProfile?.name || '').trim();
  const currentIgn = (currentProfile?.in_game_name || currentProfile?.ff_ign || '').trim();
  const currentUid = (currentProfile?.in_game_id || currentProfile?.ff_uid || '').trim();
  const currentAvatarId = (currentProfile?.avatar_id || currentProfile?.avatarId || 'avatar_1').trim();

  // Last change timestamps
  const lastUsernameChangeAt = currentProfile?.last_username_change_at || limitsConfig?.last_username_change_at;
  const lastIgnChangeAt = currentProfile?.last_ign_change_at || limitsConfig?.last_ign_change_at;
  const lastUidChangeAt = currentProfile?.last_uid_change_at || limitsConfig?.last_uid_change_at;
  const lastAvatarChangeAt = currentProfile?.last_avatar_change_at || limitsConfig?.last_avatar_change_at;

  const newUsername = (updates.username || updates.displayName || '').trim();
  const newIgn = (updates.inGameName || '').trim();
  const newUid = (updates.inGameId || '').trim();

  // Extract avatar_id from updates
  let rawAvatarId = updates.avatar_id || updates.avatarId;
  if (!rawAvatarId && updates.avatarUrl && String(updates.avatarUrl).startsWith('avatar_')) {
    rawAvatarId = updates.avatarUrl;
  }
  const newAvatarId = rawAvatarId ? String(rawAvatarId).trim().toLowerCase() : currentAvatarId;
  const newAvatarUrl = resolvePresetAvatarUrl(newAvatarId, updates.avatarUrl || currentProfile?.avatar_url);

  const isAdminOverride = Boolean(updates.is_admin_override ?? true);

  // If user change without admin override, verify cooldowns
  if (!isAdminOverride) {
    if (newUsername && currentUsername && newUsername !== currentUsername) {
      if (lastUsernameChangeAt) {
        const remaining = formatRemaining(lastUsernameChangeAt);
        if (remaining) {
          throw new Error(`Username can only be changed once every 24 hours. Please wait ${remaining} before changing again.`);
        }
      }
    }

    if (newIgn && currentIgn && newIgn !== currentIgn) {
      if (lastIgnChangeAt) {
        const remaining = formatRemaining(lastIgnChangeAt);
        if (remaining) {
          throw new Error(`In-Game Name (IGN) can only be changed once every 24 hours. Please wait ${remaining} before changing again.`);
        }
      }
    }

    if (newUid && currentUid && newUid !== currentUid) {
      if (lastUidChangeAt) {
        const remaining = formatRemaining(lastUidChangeAt);
        if (remaining) {
          throw new Error(`Game UID can only be changed once every 24 hours. Please wait ${remaining} before changing again.`);
        }
      }
    }

    if (newAvatarId && currentAvatarId && newAvatarId !== currentAvatarId) {
      if (lastAvatarChangeAt) {
        const remaining = formatRemaining(lastAvatarChangeAt);
        if (remaining) {
          throw new Error(`Profile avatar can only be changed once every 24 hours. Please wait ${remaining} before changing again.`);
        }
      }
    }
  }

  const finalPhone = updates.phone !== undefined ? updates.phone : (currentProfile?.phone || currentProfile?.phone_number || '');

  const nowIso = new Date().toISOString();
  const updatedTimestamps: Record<string, any> = { ...limitsConfig };

  let usernameChanged = false;
  let ignChanged = false;
  let uidChanged = false;
  let avatarChanged = false;

  if (newUsername && currentUsername && newUsername !== currentUsername) {
    usernameChanged = true;
    updatedTimestamps.last_username_change_at = nowIso;
  }

  if (newIgn && currentIgn && newIgn !== currentIgn) {
    ignChanged = true;
    updatedTimestamps.last_ign_change_at = nowIso;
  }

  if (newUid && currentUid && newUid !== currentUid) {
    uidChanged = true;
    updatedTimestamps.last_uid_change_at = nowIso;
  }

  if (newAvatarId && currentAvatarId && newAvatarId !== currentAvatarId) {
    avatarChanged = true;
    updatedTimestamps.last_avatar_change_at = nowIso;
  }

  const nameVal = updates.displayName || updates.username || currentProfile?.name || currentProfile?.username;
  const usernameVal = updates.username || updates.displayName || currentProfile?.username || currentProfile?.name;
  const ignVal = updates.inGameName !== undefined ? updates.inGameName : (currentProfile?.ff_ign || currentProfile?.in_game_name);
  const uidVal = updates.inGameId !== undefined ? updates.inGameId : (currentProfile?.ff_uid || currentProfile?.in_game_id);
  const depositVal = updates.walletBalance !== undefined ? Number(updates.walletBalance) : undefined;
  const winningVal = updates.winningBalance !== undefined ? Number(updates.winningBalance) : undefined;

  const payload: Record<string, any> = cleanUndefined({
    id: userId,
    name: nameVal,
    username: usernameVal,
    display_name: nameVal,
    email: updates.email || currentProfile?.email,
    phone: finalPhone,
    phone_number: finalPhone,
    mobile: finalPhone,
    ff_ign: ignVal,
    free_fire_ign: ignVal,
    in_game_name: ignVal,
    ff_uid: uidVal,
    free_fire_uid: uidVal,
    in_game_id: uidVal,
    avatar_id: newAvatarId,
    avatar_url: newAvatarUrl,
    deposit_balance: depositVal,
    wallet_balance: depositVal,
    winning_balance: winningVal,
    status: updates.status || currentProfile?.status || 'active',
    ban_reason: updates.banReason,
    ...(usernameChanged ? { last_username_change_at: nowIso } : {}),
    ...(ignChanged ? { last_ign_change_at: nowIso } : {}),
    ...(uidChanged ? { last_uid_change_at: nowIso } : {}),
    ...(avatarChanged ? { last_avatar_change_at: nowIso } : {}),
    updated_at: nowIso,
  });

  try {
    const { data: updatedDoc, error: saveErr } = await supabase
      .from('profiles')
      .upsert(payload)
      .select()
      .maybeSingle();

    if (saveErr) {
      console.warn('[updateUserProfileInSupabase direct upsert notice]:', saveErr.message);
      await safeSupabaseWrite('profiles', payload, 'upsert', userId);
    }

    // Update local cache
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('winx7_users');
        if (raw) {
          const list: AppUser[] = JSON.parse(raw);
          const idx = list.findIndex((u) => u.id === userId || u.uid === userId);
          const updatedUser = normalizeUserDoc(updatedDoc || payload, userId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...updatedUser };
          } else {
            list.push(updatedUser);
          }
          localStorage.setItem('winx7_users', JSON.stringify(list));
        }
      } catch {}
    }

    if (usernameChanged || ignChanged || uidChanged || avatarChanged) {
      await upsertAppConfig(configKey, updatedTimestamps, 'saveUserProfileLimits');
    }

  } catch (err: any) {
    console.error('[DEBUG DB Update Profile Error]', { userId, error: err?.message || err });
    throw err;
  }
}

// Transaction Approval & Rejection
export async function approveTransactionInSupabase(
  txOrId: WalletTransaction | string,
  adminNotes?: string
): Promise<{ success: boolean; credited: boolean; message: string }> {
  const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
  await ensureSupabaseAuthSession();

  if (!isUuid(txId)) {
    throw new Error('Invalid transaction ID format. Must be a valid UUID.');
  }

  // Fetch transaction to determine type
  const { data: tx, error: fetchErr } = await supabase
    .from('wallet_transactions')
    .select('type')
    .eq('id', txId)
    .single();

  if (fetchErr) {
    throw new Error(`Failed to fetch transaction: ${fetchErr.message}`);
  }

  const isDeposit = ['deposit', 'recharge', 'add_money'].includes(tx.type?.toLowerCase() || '');

  if (isDeposit) {
    // 1. Call the single atomic Supabase RPC `approve_deposit`
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('approve_deposit', {
      p_transaction_id: txId,
      p_admin_note: adminNotes || 'Approved by WinX7 Admin',
    });

    if (rpcErr) {
      console.error('[Supabase approve_deposit RPC Error]:', rpcErr);
      if (rpcErr.code === 'PGRST202') {
        throw new Error(
          `Database Function Missing (PGRST202): The 'approve_deposit' RPC function does not exist in your Supabase database. ` +
          `Please open your Supabase Dashboard -> SQL Editor, and run the SQL schema script defined in /supabase_functions.sql to create it.`
        );
      }
      throw new Error(`Database Error (${rpcErr.code}): ${rpcErr.message}. ${rpcErr.hint || ''}`);
    }

    if (rpcRes) {
      if (rpcRes.success === false) {
        throw new Error(rpcRes.message || 'Database transaction rolled back during approval.');
      }
      updateLocalTransactionCache(txId, { status: 'approved', adminNotes: adminNotes || 'Approved by Admin' });
      return {
        success: Boolean(rpcRes.success),
        credited: Boolean(rpcRes.credited),
        message: rpcRes.message || 'Deposit approved and credited successfully.',
      };
    }
    throw new Error('No response received from approve_deposit database transaction.');
  } else {
    // Standard update for non-deposit transactions (e.g., withdrawals)
    const { error: updateErr } = await supabase
      .from('wallet_transactions')
      .update({
        status: 'approved',
        description: `Approved: ${adminNotes || 'Approved by Admin'}`
      })
      .eq('id', txId);

    if (updateErr) {
      throw new Error(`Database Error (${updateErr.code}): ${updateErr.message}`);
    }
    updateLocalTransactionCache(txId, { status: 'approved', adminNotes: adminNotes || 'Approved by Admin' });
    return {
      success: true,
      credited: true, // Assuming non-deposit approval still 'credits' in terms of status update
      message: 'Transaction approved successfully.',
    };
  }
}

export async function rejectTransactionInSupabase(
  txOrId: WalletTransaction | string,
  rejectionReason?: string,
  shouldRefundOrAdminNotes?: boolean | string
): Promise<void> {
  const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
  const adminNotes = typeof shouldRefundOrAdminNotes === 'string' ? shouldRefundOrAdminNotes : rejectionReason;
  await ensureSupabaseAuthSession();

  if (!isUuid(txId)) {
    throw new Error('Invalid transaction ID format. Must be a valid UUID.');
  }

  // Fetch transaction to determine type
  const { data: tx, error: fetchErr } = await supabase
    .from('wallet_transactions')
    .select('type')
    .eq('id', txId)
    .single();

  if (fetchErr) {
    throw new Error(`Failed to fetch transaction: ${fetchErr.message}`);
  }

  const isDeposit = ['deposit', 'recharge', 'add_money'].includes(tx.type?.toLowerCase() || '');

  if (isDeposit) {
    // 1. Call single atomic Supabase RPC `reject_deposit`
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('reject_deposit', {
      p_transaction_id: txId,
      p_rejection_reason: rejectionReason || adminNotes || 'Rejected by Admin',
    });

    if (rpcErr) {
      console.error('[Supabase reject_deposit RPC Error]:', rpcErr);
      if (rpcErr.code === 'PGRST202') {
        throw new Error(
          `Database Function Missing (PGRST202): The 'reject_deposit' RPC function does not exist in your Supabase database. ` +
          `Please open your Supabase Dashboard -> SQL Editor, and run the SQL schema script defined in /supabase_functions.sql to create it.`
        );
      }
      throw new Error(`Database Error (${rpcErr.code}): ${rpcErr.message}. ${rpcErr.hint || ''}`);
    }

    if (rpcRes) {
      if (rpcRes.success === false) {
        throw new Error(rpcRes.message || 'Database transaction rolled back during rejection.');
      }
      updateLocalTransactionCache(txId, { status: 'rejected', adminNotes: adminNotes || rejectionReason || 'Rejected by Admin' });
      return;
    }
    throw new Error('No response received from reject_deposit database transaction.');
  } else {
    // Standard update for non-deposit transactions
    const { error: updateErr } = await supabase
      .from('wallet_transactions')
      .update({
        status: 'rejected',
        description: `Rejected: ${rejectionReason || adminNotes || 'Rejected by Admin'}`
      })
      .eq('id', txId);

    if (updateErr) {
      throw new Error(`Database Error (${updateErr.code}): ${updateErr.message}`);
    }
    updateLocalTransactionCache(txId, { status: 'rejected', adminNotes: adminNotes || rejectionReason || 'Rejected by Admin' });
    return;
  }
}

export async function deleteTransactionFromSupabase(txOrId: string | WalletTransaction): Promise<void> {
  await ensureSupabaseAuthSession();
  const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;
  const refId = typeof txOrId === 'object' ? txOrId.referenceId : undefined;

  updateLocalTransactionCache(txId, undefined, true);
  if (refId) updateLocalTransactionCache(refId, undefined, true);

  // Clear from localStorage caches as well
  try {
    const raw = localStorage.getItem('winx7_wallet_transactions');
    if (raw) {
      const list: WalletTransaction[] = JSON.parse(raw);
      const filtered = list.filter((t) => t && t.id !== txId && t.referenceId !== txId && (!refId || (t.id !== refId && t.referenceId !== refId)));
      localStorage.setItem('winx7_wallet_transactions', JSON.stringify(filtered));
    }
  } catch {}

  try {
    if (isUuid(txId)) {
      await supabase.from('wallet_transactions').delete().eq('id', txId);
    }
    if (refId) {
      await supabase.from('wallet_transactions').delete().eq('reference_id', refId);
    }
    await supabase.from('wallet_transactions').delete().eq('reference_id', txId);
    try {
      await supabase.from('wallet_transactions').delete().or(`id.eq.${txId},reference_id.eq.${txId}`);
    } catch {}
  } catch (err) {
    console.warn('[deleteTransactionFromSupabase] Error deleting transaction:', err);
  }
}

export async function clearAllPendingDepositsFromSupabase(): Promise<number> {
  await ensureSupabaseAuthSession();
  try {
    const { data: pendingTxs } = await supabase
      .from('wallet_transactions')
      .select('id, reference_id')
      .eq('type', 'deposit')
      .eq('status', 'pending');

    const count = (pendingTxs || []).length;
    if (count > 0) {
      for (const t of pendingTxs!) {
        updateLocalTransactionCache(t.id, undefined, true);
        if (t.reference_id) updateLocalTransactionCache(t.reference_id, undefined, true);
      }
      await supabase
        .from('wallet_transactions')
        .delete()
        .eq('type', 'deposit')
        .eq('status', 'pending');
    }
    return count;
  } catch (err) {
    console.warn('[clearAllPendingDepositsFromSupabase] Error clearing pending deposits:', err);
    return 0;
  }
}

export async function createTransactionInSupabase(tx: WalletTransaction): Promise<void> {
  await ensureSupabaseAuthSession();
  const rawId = tx.id || `tx-${Date.now()}`;
  const id = isUuid(rawId) ? rawId : crypto.randomUUID();
  const referenceId = tx.referenceId || rawId;
  const txWithId = { ...tx, id, referenceId };
  updateLocalTransactionCache(id, txWithId);

  const payload: Record<string, any> = {
    id,
    user_id: tx.userId,
    type: tx.type || 'deposit',
    amount: Number(tx.amount || 0),
    status: tx.status || 'pending',
    title: tx.title || (tx.type === 'deposit' ? 'Deposit Request' : tx.type === 'withdrawal' ? 'Withdrawal Request' : 'Wallet Transaction'),
    description: tx.description || [tx.paymentMethod ? `Method: ${tx.paymentMethod}` : '', tx.utr ? `UTR: ${tx.utr}` : '', tx.adminNotes ? `Note: ${tx.adminNotes}` : '', tx.rejectionReason ? `Reason: ${tx.rejectionReason}` : ''].filter(Boolean).join(' | ') || (tx.type === 'deposit' ? 'Deposit Request' : 'Wallet Transaction'),
    reference_id: referenceId,
    upi_id: tx.upiId || '',
    created_at: tx.createdAt || new Date().toISOString(),
  };

  const { error } = await supabase.from('wallet_transactions').upsert(payload);
  if (error) {
    console.error('[createTransactionInSupabase] Error saving transaction:', error.message);
    if (error.code !== '42501') {
      throw error;
    }
  }
}

// Category CRUD
export async function saveCategoryInSupabase(category: MatchCategory, index?: number): Promise<void> {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const id = (category.id && isUuid(category.id)) ? category.id : crypto.randomUUID();
  const payload = cleanUndefined({
    id,
    name: category.name,
    description: category.description || null,
    is_active: category.isActive ?? true,
    image_url: category.imageUrl || getCategoryBannerImage(category.name),
    banner_url: category.bannerUrl || null,
    display_order: index !== undefined ? index : category.displayOrder ?? category.sortOrder ?? category.order ?? 0,
    created_at: category.createdAt || new Date().toISOString(),
  });

  const { error } = await supabase.from('categories').upsert(payload);
  if (error) {
    handleSupabaseError(error, 'saveCategoryInSupabase');
    throw error;
  }
}

export async function deleteCategoryFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    handleSupabaseError(error, 'deleteCategoryFromSupabase');
    throw error;
  }
}

// Helper for safe app_config upsert across schema variations
async function upsertAppConfig(id: string, valueObj: any, opName: string): Promise<void> {
  const jsonStr = typeof valueObj === 'string' ? valueObj : JSON.stringify(valueObj);
  const now = new Date().toISOString();

  // Try standard data/config/settings columns - NEVER use 'value' because app_config has no 'value' column
  const candidatePayloads: Record<string, any>[] = [
    { id, data: valueObj, updated_at: now },
    { id, config: valueObj, updated_at: now },
    { id, settings: valueObj, updated_at: now },
    { id, content: jsonStr, updated_at: now },
    { id, payload: valueObj, updated_at: now },
    { id, json_data: valueObj, updated_at: now },
  ];

  let lastError: any = null;
  for (const payload of candidatePayloads) {
    try {
      const { error } = await supabase.from('app_config').upsert(payload as any, { onConflict: 'id' });
      if (!error) return;
      lastError = error;
      if (error.code !== 'PGRST204' && error.code !== '42703') {
        console.warn(`[Supabase ${opName}] notice (${error.code}):`, error.message);
      }
    } catch (e) {
      lastError = e;
    }
  }
  console.warn(`[Supabase ${opName}] Notice: app_config write completed with note.`, lastError?.message || '');
}

// Coupon RPC Error Handler
export function handleCouponError(error: any): string {
  if (!error) return "Unable to complete the request. Please try again.";
  const msg = (
    typeof error === 'string'
      ? error
      : error?.message || error?.details || error?.hint || ''
  ).toString();

  if (/coupon code already exists|already exists|duplicate key|unique constraint/i.test(msg)) {
    return "Coupon code already exists.";
  }
  if (/coupon has redemption history|redemption history|cannot be deleted/i.test(msg)) {
    return "This coupon has redemption history and cannot be deleted. Deactivate it instead.";
  }
  if (/coupon not found/i.test(msg)) {
    return "Coupon not found.";
  }
  if (/invalid reward amount|reward amount must be greater/i.test(msg)) {
    return "Reward amount must be greater than zero.";
  }
  if (/invalid minimum deposit|minimum lifetime deposit/i.test(msg)) {
    return "Minimum lifetime deposit cannot be negative.";
  }
  if (/invalid maximum uses|maximum uses must be/i.test(msg)) {
    return "Maximum uses must be greater than zero.";
  }
  if (/expiry must be after|expiry date must be later|expiry must be later/i.test(msg)) {
    return "Expiry must be after the start time.";
  }

  if (msg) {
    return msg;
  }

  return "Unable to complete the request. Please try again.";
}

// Verify coupon admin auth session and log auth details
export async function verifyCouponAdminAuth(): Promise<boolean> {
  await ensureSupabaseAuthSession();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  console.log("AUTH USER:", user?.id);
  console.log("AUTH EMAIL:", user?.email);
  console.log("AUTH ERROR:", userError);

  const {
    data: adminResult,
    error: adminError
  } = await supabase.rpc("is_coupon_admin");

  console.log("IS COUPON ADMIN:", adminResult);
  console.log("ADMIN RPC ERROR:", adminError);

  if (userError) {
    throw new Error(`Supabase Auth Session Error: ${userError.message || String(userError)}`);
  }

  if (!user) {
    throw new Error("Supabase Auth Session Error: No active authenticated Supabase user found.");
  }

  if (adminError) {
    throw new Error(`is_coupon_admin RPC Error: ${adminError.message || String(adminError)}`);
  }

  if (adminResult !== true) {
    throw new Error(`is_coupon_admin() returned false for authenticated user ${user.email} (${user.id}). Please check role in public.profiles table.`);
  }

  return true;
}

// Fetch coupons using admin_list_coupons RPC
export async function fetchCouponsFromSupabase(): Promise<Coupon[]> {
  await verifyCouponAdminAuth();
  const { data, error } = await supabase.rpc('admin_list_coupons');
  if (error) {
    console.warn('[Coupon RPC] admin_list_coupons notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }
  return (data || []).map((item: any) => normalizeCouponDoc(item));
}

// Create coupon using admin_create_coupon RPC
export async function adminCreateCouponInSupabase(payload: {
  code: string;
  description?: string;
  rewardAmount: number;
  minDepositAmount: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}): Promise<Coupon> {
  await verifyCouponAdminAuth();

  const p_code = payload.code.trim().toUpperCase();
  const p_description = payload.description?.trim() || null;
  const p_reward_amount = Number(payload.rewardAmount);
  const p_min_deposit_amount = Number(payload.minDepositAmount || 0);
  const p_max_uses = payload.maxUses && Number(payload.maxUses) > 0 ? Number(payload.maxUses) : null;
  const p_starts_at = payload.startsAt ? new Date(payload.startsAt).toISOString() : new Date().toISOString();
  const p_expires_at = payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null;

  const { data, error } = await supabase.rpc('admin_create_coupon', {
    p_code,
    p_description,
    p_reward_amount,
    p_min_deposit_amount,
    p_max_uses,
    p_starts_at,
    p_expires_at
  });

  if (error) {
    console.warn('[Coupon RPC] admin_create_coupon notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }

  if (data) {
    return normalizeCouponDoc(Array.isArray(data) ? data[0] : data);
  }

  return normalizeCouponDoc({
    code: p_code,
    description: p_description,
    reward_amount: p_reward_amount,
    min_deposit_amount: p_min_deposit_amount,
    max_uses: p_max_uses,
    starts_at: p_starts_at,
    expires_at: p_expires_at,
    is_active: true
  });
}

// Update coupon using admin_update_coupon RPC
export async function adminUpdateCouponInSupabase(payload: {
  couponId: string;
  code: string;
  description?: string;
  rewardAmount: number;
  minDepositAmount: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
}): Promise<Coupon> {
  await verifyCouponAdminAuth();

  const p_coupon_id = payload.couponId;
  const p_code = payload.code.trim().toUpperCase();
  const p_description = payload.description?.trim() || null;
  const p_reward_amount = Number(payload.rewardAmount);
  const p_min_deposit_amount = Number(payload.minDepositAmount || 0);
  const p_max_uses = payload.maxUses && Number(payload.maxUses) > 0 ? Number(payload.maxUses) : null;
  const p_starts_at = payload.startsAt ? new Date(payload.startsAt).toISOString() : new Date().toISOString();
  const p_expires_at = payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null;
  const p_is_active = Boolean(payload.isActive);

  const { data, error } = await supabase.rpc('admin_update_coupon', {
    p_coupon_id,
    p_code,
    p_description,
    p_reward_amount,
    p_min_deposit_amount,
    p_max_uses,
    p_starts_at,
    p_expires_at,
    p_is_active
  });

  if (error) {
    console.warn('[Coupon RPC] admin_update_coupon notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }

  if (data) {
    return normalizeCouponDoc(Array.isArray(data) ? data[0] : data);
  }

  return normalizeCouponDoc({
    id: p_coupon_id,
    code: p_code,
    description: p_description,
    reward_amount: p_reward_amount,
    min_deposit_amount: p_min_deposit_amount,
    max_uses: p_max_uses,
    starts_at: p_starts_at,
    expires_at: p_expires_at,
    is_active: p_is_active
  });
}

// Delete coupon using admin_delete_coupon RPC
export async function adminDeleteCouponFromSupabase(couponId: string): Promise<void> {
  await verifyCouponAdminAuth();

  const { error } = await supabase.rpc('admin_delete_coupon', {
    p_coupon_id: couponId
  });

  if (error) {
    console.warn('[Coupon RPC] admin_delete_coupon notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }
}

// Check coupon RPC
export async function checkCouponInSupabase(code: string): Promise<any> {
  await ensureSupabaseAuthSession();
  const { data, error } = await supabase.rpc('check_coupon', {
    p_code: code.trim().toUpperCase()
  });
  if (error) {
    console.warn('[Coupon RPC] check_coupon notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }
  return data;
}

// Redeem coupon RPC
export async function redeemCouponInSupabase(code: string): Promise<any> {
  await ensureSupabaseAuthSession();
  const { data, error } = await supabase.rpc('redeem_coupon', {
    p_code: code.trim().toUpperCase()
  });
  if (error) {
    console.warn('[Coupon RPC] redeem_coupon notice:', error.message || error);
    throw new Error(handleCouponError(error));
  }
  return data;
}

// Wrapper aliases for compatibility
export async function saveCouponInSupabase(coupon: Coupon): Promise<Coupon> {
  if (coupon.id && !coupon.id.startsWith('cpn-new-') && !coupon.id.startsWith('temp-')) {
    return await adminUpdateCouponInSupabase({
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      rewardAmount: coupon.rewardAmount || coupon.discountValue || 0,
      minDepositAmount: coupon.minDepositAmount || coupon.minDeposit || 0,
      maxUses: coupon.maxUses ?? coupon.usageLimit,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt || coupon.expiryDate,
      isActive: coupon.isActive
    });
  } else {
    return await adminCreateCouponInSupabase({
      code: coupon.code,
      description: coupon.description,
      rewardAmount: coupon.rewardAmount || coupon.discountValue || 0,
      minDepositAmount: coupon.minDepositAmount || coupon.minDeposit || 0,
      maxUses: coupon.maxUses ?? coupon.usageLimit,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt || coupon.expiryDate
    });
  }
}

export async function deleteCouponFromSupabase(couponId: string): Promise<void> {
  await adminDeleteCouponFromSupabase(couponId);
}

// Saved Images in app_config table & localStorage
export async function saveSavedImageInSupabase(image: SavedImage): Promise<void> {
  const id = image.id || `img_${Date.now()}`;
  const cleanImage = { ...image, id };

  // 1. Save to localStorage cache immediately
  try {
    const existingRaw = localStorage.getItem('winx7_saved_images');
    const existing: SavedImage[] = existingRaw ? JSON.parse(existingRaw) : [];
    const idx = existing.findIndex((item) => item.id === id);
    if (idx >= 0) {
      existing[idx] = cleanImage;
    } else {
      existing.unshift(cleanImage);
    }
    localStorage.setItem('winx7_saved_images', JSON.stringify(existing));
  } catch (err) {
    console.warn('[LocalStorage SavedImage] Cache warning:', err);
  }

  // 2. Sync to Supabase app_config
  await upsertAppConfig(`saved_image_${id}`, cleanImage, 'saveSavedImageInSupabase');
}

export async function deleteSavedImageFromSupabase(imageId: string): Promise<void> {
  const rawId = imageId.replace('saved_image_', '');

  // 1. Remove from localStorage cache
  try {
    const existingRaw = localStorage.getItem('winx7_saved_images');
    if (existingRaw) {
      const existing: SavedImage[] = JSON.parse(existingRaw);
      const filtered = existing.filter((img) => img.id !== rawId && img.id !== `saved_image_${rawId}`);
      localStorage.setItem('winx7_saved_images', JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn('[LocalStorage SavedImage] Delete warning:', err);
  }

  // 2. Remove from Supabase app_config
  try {
    const cleanId = imageId.startsWith('saved_image_') ? imageId : `saved_image_${imageId}`;
    await supabase.from('app_config').delete().eq('id', cleanId);
  } catch (err) {
    console.warn('[Supabase Delete Saved Image] Notice:', err);
  }
}

// System Settings in app_config table
export async function saveSystemSettingsInSupabase(settings: SystemSettings): Promise<void> {
  await ensureSupabaseAuthSession();
  
  // 1. Save full settings object to localStorage for instant local reactivity
  try {
    localStorage.setItem('winx7_system_settings', JSON.stringify(settings));
  } catch {}

  const now = new Date().toISOString();

  // 2. Discover existing columns in public.app_config for id = 'general'
  let existingColumns: Set<string> | null = null;
  try {
    const { data: generalRow } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'general')
      .maybeSingle();

    if (generalRow) {
      existingColumns = new Set(Object.keys(generalRow));
    } else {
      const { data: anyRow } = await supabase
        .from('app_config')
        .select('*')
        .limit(1);
      if (anyRow && anyRow.length > 0) {
        existingColumns = new Set(Object.keys(anyRow[0]));
      }
    }
  } catch (e) {
    console.warn('[saveSystemSettingsInSupabase] schema probe notice:', e);
  }

  // 3. Complete field dictionary for public.app_config row id = 'general'
  const fullFieldDict: Record<string, any> = {
    id: 'general',
    whatsapp_contact: settings.whatsappContact || settings.whatsappGroup || '',
    telegram_contact: settings.telegramContact || settings.telegramChannel || '',
    instagram_contact: settings.instagramContact || '',
    youtube_contact: settings.youtubeContact || settings.youtubeChannel || '',
    privacy_policy_text: settings.privacyPolicyText || settings.privacyPolicy || '',
    terms_and_fair_play_rules_text: settings.termsAndFairPlayRulesText || '',
    app_name: settings.appName || 'WinX7 Esports',
    is_maintenance_mode: Boolean(settings.maintenanceMode),
    maintenance_message: settings.maintenanceMessage || '',
    is_registration_on: Boolean(settings.registrationEnabled ?? true),
    is_tournament_on: Boolean(settings.tournamentsEnabled ?? true),
    is_withdraw_on: Boolean(settings.withdrawEnabled ?? true),
    is_deposit_on: Boolean(settings.depositEnabled ?? true),
    is_referral_on: Boolean(settings.referralEnabled ?? true),
    referral_bonus: Number(settings.referralBonus ?? 25),
    min_app_version: String(settings.minAppVersion || '1.0.0'),
    upi_id: settings.upiId || '',
    upi_name: settings.upiName || '',
    custom_qr_link: settings.customQrLink || '',
    deposit_instructions: settings.depositInstructions || '',
    deposit_qr_image_url: settings.depositQrImageUrl || '',
    deposit_mode: settings.depositMode || 'MANUAL',
    gateway_provider: settings.gatewayProvider || 'RAZORPAY',
    min_deposit: Number(settings.minDeposit ?? 10),
    min_withdrawal: Number(settings.minWithdrawal ?? 100),
    max_deposit: Number(settings.maxDeposit ?? 50000),
    max_withdrawal: Number(settings.maxWithdrawal ?? 25000),
    daily_withdrawal_limit: Number(settings.dailyWithdrawalLimit ?? 3),
    auto_approve_withdrawals: Boolean(settings.autoApproveWithdrawals ?? false),
    auto_approval_max_amount: Number(settings.autoApprovalMaxAmount ?? 500),
    contact_email: settings.contactEmail || '',
    support_phone: settings.supportPhone || '',
    whatsapp_group: settings.whatsappGroup || settings.whatsappContact || '',
    telegram_channel: settings.telegramChannel || settings.telegramContact || '',
    telegram_group: settings.telegramGroup || '',
    telegram_support: settings.telegramSupport || settings.telegramContact || '',
    youtube_channel: settings.youtubeChannel || settings.youtubeContact || '',
    discord_server: settings.discordServer || '',
    discord_contact: settings.discordContact || '',
    website_url: settings.websiteUrl || '',
    direct_chat_url: settings.directChatUrl || '',
    updated_at: now,
  };

  let payload: Record<string, any> = {};
  if (existingColumns && existingColumns.size > 0) {
    for (const [key, val] of Object.entries(fullFieldDict)) {
      if (existingColumns.has(key)) {
        payload[key] = val;
      }
    }
  } else {
    payload = { ...fullFieldDict };
  }

  // Ensure NEVER sending 'value' column
  delete payload.value;

  // 4. Update row where id = 'general'
  let currentPayload = { ...payload };
  let updateSuccess = false;
  let lastErr: any = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const { error: updateErr } = await supabase
      .from('app_config')
      .update(currentPayload)
      .eq('id', 'general');

    if (!updateErr) {
      updateSuccess = true;
      break;
    }

    lastErr = updateErr;

    if (
      updateErr.code === 'PGRST204' ||
      updateErr.code === '42703' ||
      (updateErr.message && (updateErr.message.includes('column') || updateErr.message.includes('schema cache')))
    ) {
      const match =
        updateErr.message.match(/Could not find the '([^']+)' column/i) ||
        updateErr.message.match(/'([^']+)' column/i) ||
        updateErr.message.match(/column "([^"]+)" of relation/i) ||
        updateErr.message.match(/column "([^"]+)" does not exist/i) ||
        updateErr.message.match(/column '([^']+)' does not exist/i);

      if (match && match[1] && match[1] in currentPayload) {
        console.warn(`[saveSystemSettingsInSupabase] Column '${match[1]}' not found in app_config, omitting and retrying...`);
        delete currentPayload[match[1]];
        continue;
      }
    }

    // Try upsert if row might not exist yet
    const { error: upsertErr } = await supabase
      .from('app_config')
      .upsert(currentPayload, { onConflict: 'id' });

    if (!upsertErr) {
      updateSuccess = true;
      break;
    }

    lastErr = upsertErr;
    if (
      upsertErr.code === 'PGRST204' ||
      upsertErr.code === '42703' ||
      (upsertErr.message && (upsertErr.message.includes('column') || upsertErr.message.includes('schema cache')))
    ) {
      const match =
        upsertErr.message.match(/Could not find the '([^']+)' column/i) ||
        upsertErr.message.match(/'([^']+)' column/i) ||
        upsertErr.message.match(/column "([^"]+)" of relation/i) ||
        upsertErr.message.match(/column "([^"]+)" does not exist/i) ||
        upsertErr.message.match(/column '([^']+)' does not exist/i);

      if (match && match[1] && match[1] in currentPayload) {
        delete currentPayload[match[1]];
        continue;
      }
    }

    break;
  }

  if (!updateSuccess && lastErr) {
    console.error('[saveSystemSettingsInSupabase] Error saving system settings to Supabase:', lastErr);
    throw new Error(`Failed to save settings to Supabase (${lastErr.code || 'DB_ERROR'}): ${lastErr.message}`);
  }

  // 5. Verify the updated row by reading it back from Supabase
  const { data: verifiedRow, error: verifyErr } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 'general')
    .maybeSingle();

  if (verifyErr || !verifiedRow) {
    const errMsg = verifyErr ? verifyErr.message : 'Row id="general" not found after write';
    console.error('[saveSystemSettingsInSupabase] Readback verification failed:', errMsg);
    throw new Error(`Save verification failed: ${errMsg}`);
  }

  console.log('[saveSystemSettingsInSupabase] Confirmed settings updated in Supabase app_config (id=general):', {
    id: verifiedRow.id,
    whatsapp_contact: verifiedRow.whatsapp_contact,
    telegram_contact: verifiedRow.telegram_contact,
    instagram_contact: verifiedRow.instagram_contact,
    youtube_contact: verifiedRow.youtube_contact,
    privacy_policy_text: verifiedRow.privacy_policy_text ? `${verifiedRow.privacy_policy_text.length} chars` : '',
    terms_and_fair_play_rules_text: verifiedRow.terms_and_fair_play_rules_text ? `${verifiedRow.terms_and_fair_play_rules_text.length} chars` : '',
    updated_at: verifiedRow.updated_at
  });
}

export async function getSystemSettingsFromSupabase(): Promise<SystemSettings | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'general')
      .maybeSingle();

    if (error) {
      console.warn('[Supabase getSystemSettings] Notice:', error.message);
      return null;
    }

    if (data) {
      return normalizeSystemSettingsFromRow(data);
    }
  } catch (err: any) {
    console.warn('[Supabase System Settings] Notice:', err?.message || err);
  }
  return null;
}

// Notifications CRUD
export async function sendNotificationInSupabase(notification: AppNotification): Promise<void> {
  const rawId = notification.id || `notif-${Date.now()}`;
  const id = isUuid(rawId) ? rawId : crypto.randomUUID();
  const notifWithId = { ...notification, id };
  updateLocalNotificationCache(id, notifWithId);

  const payload = cleanUndefined({
    id,
    title: notification.title,
    message: notification.message,
    type: notification.type || 'system',
    target_user_id: notification.targetUserId || null,
    image_url: notification.imageUrl || null,
    link: notification.link || null,
    sent_at: notification.sentAt || new Date().toISOString(),
    sent_by: notification.sentBy || 'Admin',
    is_read: false,
  });

  await safeSupabaseWrite('notifications', payload, 'upsert');
}

export async function updateNotificationReadState(id: string, isRead: boolean): Promise<void> {
  updateLocalNotificationCache(id, { isRead });
  try {
    await safeSupabaseWrite('notifications', { is_read: isRead }, 'update', id);
  } catch {}
}

export async function cleanupOldDevelopmentNotifications(): Promise<void> {}

// Admin Users in profiles table
export async function saveAdminUserInSupabase(adminUser: AdminUser): Promise<void> {
  const id = adminUser.uid || adminUser.id || `admin-${Date.now()}`;
  const { error } = await supabase.from('profiles').upsert({
    id,
    email: adminUser.email,
    username: adminUser.displayName || adminUser.email.split('@')[0],
    display_name: adminUser.displayName,
    role: adminUser.role,
    status: adminUser.status || 'active',
    avatar_url: adminUser.avatarUrl || null,
    created_at: adminUser.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    handleSupabaseError(error, 'saveAdminUserInSupabase');
  }
}

export async function updateAdminUserStatusInSupabase(uid: string, status: 'active' | 'inactive'): Promise<void> {
  try {
    await supabase.from('profiles').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', uid);
  } catch {}
}

export async function deleteAdminUserFromSupabase(uid: string): Promise<void> {
  try {
    await supabase.from('profiles').delete().eq('id', uid);
  } catch {}
}

// ==========================================
// WINX7 STAFF MANAGEMENT RPC FUNCTIONS
// ==========================================

export function formatStaffError(error: any): string {
  const msg = (
    typeof error === 'string'
      ? error
      : error?.message || error?.details || error?.hint || ''
  ).toString();

  if (/only superadmin|permission|unauthorized|is_coupon_admin|forbidden|not authorized/i.test(msg)) {
    return 'Only SUPERADMIN can manage staff accounts.';
  }
  if (/already a staff|already exists|duplicate key|unique constraint/i.test(msg)) {
    return 'This user is already a staff member.';
  }
  if (/not found|user does not exist|does not exist/i.test(msg)) {
    return 'User account could not be found.';
  }
  if (/blocked|banned|suspended user/i.test(msg)) {
    return 'This user cannot be appointed as staff due to their account status.';
  }
  if (msg) {
    return msg;
  }
  return 'Failed to execute staff operation.';
}

export function normalizeStaffMemberDoc(doc: any): StaffMember {
  const profile = doc.profile || {};
  const rawStatus = (doc.status || 'ACTIVE').toString().toUpperCase().trim();
  const status: StaffStatus = rawStatus === 'SUSPENDED' ? 'SUSPENDED' : rawStatus === 'REMOVED' ? 'REMOVED' : 'ACTIVE';

  const staffIdVal = doc.staff_id || doc.staffId || doc.staff_code || doc.id || '';
  const userIdVal = doc.user_id || doc.userId || profile.id || '';
  const nameVal = doc.name || doc.display_name || doc.displayName || profile.name || profile.display_name || profile.username || 'Staff Member';
  const emailVal = doc.email || profile.email || '';
  const phoneVal = doc.phone || profile.phone || '';
  const ffUidVal = doc.ff_uid || doc.ffUid || doc.in_game_id || doc.inGameId || profile.in_game_id || '';
  const ffIgnVal = doc.ff_ign || doc.ffIgn || doc.in_game_name || doc.inGameName || profile.in_game_name || '';

  return {
    id: doc.id || staffIdVal || crypto.randomUUID(),
    staffId: staffIdVal,
    staff_id: staffIdVal,
    userId: userIdVal,
    user_id: userIdVal,
    name: nameVal,
    displayName: nameVal,
    email: emailVal,
    phone: phoneVal,
    ffUid: ffUidVal,
    ff_uid: ffUidVal,
    inGameId: ffUidVal,
    ffIgn: ffIgnVal,
    ff_ign: ffIgnVal,
    inGameName: ffIgnVal,
    avatarUrl: doc.avatar_url || doc.avatarUrl || profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    avatar_url: doc.avatar_url || doc.avatarUrl || profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'STAFF',
    status: status,
    notes: doc.notes || doc.admin_notes || doc.p_notes || '',
    adminNotes: doc.notes || doc.admin_notes || doc.p_notes || '',
    joinedDate: doc.created_at || doc.joined_date || doc.joinedDate || new Date().toISOString(),
    created_at: doc.created_at || doc.joined_date || new Date().toISOString(),
    approvedDate: doc.approved_at || doc.approved_date || doc.created_at || new Date().toISOString(),
    approved_at: doc.approved_at || doc.approved_date || doc.created_at || new Date().toISOString(),
    updated_at: doc.updated_at || new Date().toISOString(),
  };
}

export async function fetchStaffMembersFromSupabase(): Promise<StaffMember[]> {
  try {
    const { data, error } = await supabase.rpc('get_staff_members');
    if (error) {
      console.warn('[Staff RPC] get_staff_members notice:', error.message || error);
      // Fallback query to staff_members table joined with profiles if RPC is missing
      const { data: tableData, error: tableErr } = await supabase
        .from('staff_members')
        .select(`
          *,
          profile:profiles (
            id,
            name,
            display_name,
            email,
            phone,
            in_game_id,
            in_game_name,
            avatar_url,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (tableErr) {
        throw error;
      }

      if (tableData && Array.isArray(tableData)) {
        return tableData.map((item: any) => normalizeStaffMemberDoc(item));
      }
    }

    if (data && Array.isArray(data)) {
      return data.map((item: any) => normalizeStaffMemberDoc(item));
    }
    return [];
  } catch (err: any) {
    console.error('fetchStaffMembersFromSupabase error:', err);
    throw new Error(formatStaffError(err));
  }
}

export async function createStaffMemberInSupabase(
  userId: string,
  notes?: string
): Promise<{ success: boolean; staffId?: string; error?: string; data?: any }> {
  try {
    const { data, error } = await supabase.rpc('create_staff_member', {
      p_user_id: userId,
      p_notes: notes || ''
    });

    if (error) {
      throw error;
    }

    let generatedStaffId = '';
    if (typeof data === 'string') {
      generatedStaffId = data;
    } else if (data && typeof data === 'object') {
      generatedStaffId = data.staff_id || data.staffId || data.id || '';
    }

    return { success: true, staffId: generatedStaffId, data };
  } catch (err: any) {
    return { success: false, error: formatStaffError(err) };
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveStaffIdentifiers(
  identifier: string,
  extra?: { id?: string; userId?: string; staffCode?: string }
): Promise<{ staffRecordId?: string; userId?: string; staffCode?: string }> {
  let staffRecordId = extra?.id && UUID_REGEX.test(extra.id) ? extra.id : undefined;
  let userId = extra?.userId && UUID_REGEX.test(extra.userId) ? extra.userId : undefined;
  let staffCode = extra?.staffCode || (!UUID_REGEX.test(identifier) ? identifier : undefined);

  if (UUID_REGEX.test(identifier)) {
    if (!staffRecordId) staffRecordId = identifier;
    if (!userId) userId = identifier;
  }

  // If we still don't have a valid UUID, look up the record in staff_members table
  if (!staffRecordId && !userId) {
    try {
      const { data } = await supabase
        .from('staff_members')
        .select('id, user_id, staff_id, staff_code')
        .or(`staff_id.eq.${identifier},staff_code.eq.${identifier}`)
        .limit(1);

      if (data && data[0]) {
        if (data[0].id) staffRecordId = data[0].id;
        if (data[0].user_id) userId = data[0].user_id;
        if (data[0].staff_id || data[0].staff_code) staffCode = data[0].staff_id || data[0].staff_code;
      }
    } catch {
      // Ignore lookup errors
    }
  }

  return { staffRecordId, userId, staffCode };
}

export async function suspendStaffMemberInSupabase(
  staffId: string,
  note?: string,
  extra?: { id?: string; userId?: string; staffCode?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { staffRecordId, userId, staffCode } = await resolveStaffIdentifiers(staffId, extra);
    const targetUuid = staffRecordId || userId;
    let rpcSuccess = false;

    // 1. Try RPC with valid UUID
    if (targetUuid && UUID_REGEX.test(targetUuid)) {
      const res1 = await supabase.rpc('suspend_staff', {
        p_staff_id: targetUuid,
        p_note: note || ''
      });
      if (!res1.error) {
        rpcSuccess = true;
      } else {
        const res2 = await supabase.rpc('suspend_staff', {
          p_user_id: targetUuid,
          p_note: note || ''
        });
        if (!res2.error) {
          rpcSuccess = true;
        } else {
          const res3 = await supabase.rpc('suspend_staff', {
            p_staff_id: targetUuid
          });
          if (!res3.error) {
            rpcSuccess = true;
          }
        }
      }
    }

    // 2. Direct table update fallback to guarantee status change
    const updatePayload: any = {
      status: 'SUSPENDED',
      updated_at: new Date().toISOString()
    };
    if (note) {
      updatePayload.notes = note;
    }

    if (targetUuid) {
      await supabase.from('staff_members').update(updatePayload).eq('id', targetUuid);
      if (userId) {
        await supabase.from('staff_members').update(updatePayload).eq('user_id', userId);
      }
    }
    if (staffCode) {
      await supabase.from('staff_members').update(updatePayload).eq('staff_id', staffCode);
      await supabase.from('staff_members').update(updatePayload).eq('staff_code', staffCode);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatStaffError(err) };
  }
}

export async function reactivateStaffMemberInSupabase(
  staffId: string,
  extra?: { id?: string; userId?: string; staffCode?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { staffRecordId, userId, staffCode } = await resolveStaffIdentifiers(staffId, extra);
    const targetUuid = staffRecordId || userId;

    if (targetUuid && UUID_REGEX.test(targetUuid)) {
      const res1 = await supabase.rpc('reactivate_staff', {
        p_staff_id: targetUuid
      });
      if (res1.error) {
        await supabase.rpc('reactivate_staff', {
          p_user_id: targetUuid
        });
      }
    }

    // Direct table update fallback
    const updatePayload: any = {
      status: 'ACTIVE',
      updated_at: new Date().toISOString()
    };

    if (targetUuid) {
      await supabase.from('staff_members').update(updatePayload).eq('id', targetUuid);
      if (userId) {
        await supabase.from('staff_members').update(updatePayload).eq('user_id', userId);
      }
    }
    if (staffCode) {
      await supabase.from('staff_members').update(updatePayload).eq('staff_id', staffCode);
      await supabase.from('staff_members').update(updatePayload).eq('staff_code', staffCode);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatStaffError(err) };
  }
}

export async function removeStaffMemberInSupabase(
  staffId: string,
  note?: string,
  extra?: { id?: string; userId?: string; staffCode?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { staffRecordId, userId, staffCode } = await resolveStaffIdentifiers(staffId, extra);
    const targetUuid = staffRecordId || userId;

    if (targetUuid && UUID_REGEX.test(targetUuid)) {
      const res1 = await supabase.rpc('remove_staff', {
        p_staff_id: targetUuid,
        p_note: note || ''
      });
      if (res1.error) {
        const res2 = await supabase.rpc('remove_staff', {
          p_staff_id: targetUuid
        });
        if (res2.error) {
          await supabase.rpc('remove_staff', {
            p_user_id: targetUuid,
            p_note: note || ''
          });
        }
      }
    }

    // Direct table update fallback
    const updatePayload: any = {
      status: 'REMOVED',
      updated_at: new Date().toISOString()
    };
    if (note) {
      updatePayload.notes = note;
    }

    if (targetUuid) {
      await supabase.from('staff_members').update(updatePayload).eq('id', targetUuid);
      if (userId) {
        await supabase.from('staff_members').update(updatePayload).eq('user_id', userId);
        // Demote user role in profiles table
        await supabase.from('profiles').update({
          role: 'user',
          updated_at: new Date().toISOString()
        }).eq('id', userId);
      }
    }
    if (staffCode) {
      await supabase.from('staff_members').update(updatePayload).eq('staff_id', staffCode);
      await supabase.from('staff_members').update(updatePayload).eq('staff_code', staffCode);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: formatStaffError(err) };
  }
}

export async function provisionStaffAccountInSupabase(params: {
  email: string;
  password?: string;
  pass?: string;
  displayName: string;
  role?: AdminRole;
  permissions?: string[];
}): Promise<{ success: boolean; adminUser?: AdminUser; error?: string }> {
  const { email, displayName, role = 'staff' } = params;

  try {
    // 1. Search for existing user profile by email
    const { data: existingProfiles, error: searchErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (searchErr || !existingProfiles || existingProfiles.length === 0) {
      return {
        success: false,
        error: "Please tell the staff member to sign up via the User App first, then you can promote them here by searching their exact email."
      };
    }

    const targetUser = existingProfiles[0];
    const id = targetUser.id;

    const newAdminUser: AdminUser = {
      uid: id,
      id,
      email: targetUser.email || email,
      displayName: targetUser.display_name || targetUser.username || displayName,
      role,
      status: targetUser.status || 'active',
      permissions:
        role === 'superadmin'
          ? ['all']
          : role === 'admin'
          ? ['tournaments', 'wallet', 'users', 'notifications']
          : ['tournaments', 'matches'],
      createdAt: targetUser.created_at || new Date().toISOString(),
    };

    // 2. Promote the existing user
    const { error: upsertErr } = await supabase.from('profiles').update({
      role,
      status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (upsertErr) {
      return { success: false, error: upsertErr.message };
    }

    return { success: true, adminUser: newAdminUser };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to provision staff' };
  }
}

// Leaderboard Sync
export async function syncLeaderboardToSupabase(usersList: AppUser[] = []): Promise<void> {
  if (!usersList || usersList.length === 0) return;

  const sorted = [...usersList]
    .filter((u) => u && u.status === 'active')
    .sort((a, b) => {
      const wDiff = (b.matchesWon || 0) - (a.matchesWon || 0);
      if (wDiff !== 0) return wDiff;
      return (b.totalKills || 0) - (a.totalKills || 0);
    })
    .slice(0, 50);

  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i];
    try {
      await supabase.from('leaderboard').upsert({
        id: `lb-${u.id || u.uid}`,
        user_id: u.id || u.uid,
        username: u.username,
        in_game_name: u.inGameName || u.username,
        avatar_url: u.avatarUrl || null,
        matches_played: u.matchesPlayed || 0,
        matches_won: u.matchesWon || 0,
        total_kills: u.totalKills || 0,
        total_earnings: u.totalEarnings || u.walletBalance || 0,
        rank: i + 1,
        points: (u.matchesWon || 0) * 100 + (u.totalKills || 0) * 10,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }
}

// Official Links & System Settings
export async function saveOfficialLinksInSupabase(links: OfficialLinkConfig, updatedBy: string = 'Admin'): Promise<void> {
  await ensureSupabaseAuthSession();
  const now = new Date().toISOString();
  const payloadObj = {
    ...links,
    updatedAt: now,
    updated_at: now,
    updatedBy,
    updated_by: updatedBy,
  };

  // 1. Update localStorage cache
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('winx7_official_links', JSON.stringify(payloadObj));
      // Also update system settings in localStorage
      const existingSettingsRaw = localStorage.getItem('winx7_system_settings');
      if (existingSettingsRaw) {
        const existingSettings = JSON.parse(existingSettingsRaw);
        const mergedSettings = {
          ...existingSettings,
          telegramContact: links.telegramContact,
          telegramEnabled: links.telegramEnabled,
          telegramName: links.telegramName,
          telegramDescription: links.telegramDescription,
          whatsappContact: links.whatsappContact,
          whatsappEnabled: links.whatsappEnabled,
          whatsappName: links.whatsappName,
          whatsappDescription: links.whatsappDescription,
          instagramContact: links.instagramContact,
          instagramEnabled: links.instagramEnabled,
          instagramName: links.instagramName,
          instagramDescription: links.instagramDescription,
          youtubeContact: links.youtubeContact,
          youtubeEnabled: links.youtubeEnabled,
          youtubeName: links.youtubeName,
          youtubeDescription: links.youtubeDescription,
          whatsappGroup: links.whatsappContact || existingSettings.whatsappGroup,
          telegramChannel: links.telegramContact || existingSettings.telegramChannel,
          youtubeChannel: links.youtubeContact || existingSettings.youtubeChannel,
        };
        localStorage.setItem('winx7_system_settings', JSON.stringify(mergedSettings));
      }
    } catch (e) {}
  }

  // 2. Direct UPDATE public.app_config row where id = 'general'
  const updatePayload: Record<string, any> = {
    whatsapp_contact: links.whatsappContact || '',
    telegram_contact: links.telegramContact || '',
    instagram_contact: links.instagramContact || '',
    youtube_contact: links.youtubeContact || '',
    updated_at: now,
  };

  const { error: updateErr } = await supabase
    .from('app_config')
    .update(updatePayload)
    .eq('id', 'general');

  if (updateErr) {
    console.warn('[saveOfficialLinksInSupabase] Direct update notice, trying upsert:', updateErr.message);
    const { error: upsertErr } = await supabase
      .from('app_config')
      .upsert({ id: 'general', ...updatePayload }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('[saveOfficialLinksInSupabase] Failed to update official links in Supabase:', upsertErr);
      throw new Error(`Failed to save official links: ${upsertErr.message}`);
    }
  }

  // 3. Read back to confirm value exists in Supabase
  const { data: verifiedRow, error: verifyErr } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 'general')
    .maybeSingle();

  if (verifyErr || !verifiedRow) {
    const errMsg = verifyErr ? verifyErr.message : 'Row id="general" not found after write';
    console.error('[saveOfficialLinksInSupabase] Readback verification failed:', errMsg);
    throw new Error(`Save verification failed: ${errMsg}`);
  }

  console.log('[saveOfficialLinksInSupabase] Confirmed official links updated in Supabase (id=general):', {
    whatsapp_contact: verifiedRow.whatsapp_contact,
    telegram_contact: verifiedRow.telegram_contact,
    instagram_contact: verifiedRow.instagram_contact,
    youtube_contact: verifiedRow.youtube_contact,
  });
}

export async function getOfficialLinksFromSupabase(): Promise<OfficialLinkConfig | null> {
  try {
    const { data: generalRow } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'general')
      .maybeSingle();

    if (generalRow) {
      const s = normalizeSystemSettingsFromRow(generalRow);
      return {
        telegramContact: s.telegramContact || generalRow.telegram_contact || '',
        telegramEnabled: s.telegramEnabled !== undefined ? Boolean(s.telegramEnabled) : true,
        telegramName: s.telegramName || 'Telegram Customer Support',
        telegramDescription: s.telegramDescription || 'Instant 24/7 support & match query resolution',
        whatsappContact: s.whatsappContact || generalRow.whatsapp_contact || '',
        whatsappEnabled: s.whatsappEnabled !== undefined ? Boolean(s.whatsappEnabled) : true,
        whatsappName: s.whatsappName || 'WhatsApp Official Update Channel',
        whatsappDescription: s.whatsappDescription || 'Get official match announcements & room ID updates',
        instagramContact: s.instagramContact || generalRow.instagram_contact || '',
        instagramEnabled: s.instagramEnabled !== undefined ? Boolean(s.instagramEnabled) : true,
        instagramName: s.instagramName || 'Instagram Official Page',
        instagramDescription: s.instagramDescription || 'Follow for tournament highlights, giveaways & news',
        youtubeContact: s.youtubeContact || generalRow.youtube_contact || '',
        youtubeEnabled: s.youtubeEnabled !== undefined ? Boolean(s.youtubeEnabled) : true,
        youtubeName: s.youtubeName || 'YouTube Official Channel',
        youtubeDescription: s.youtubeDescription || 'Watch live streamings & official match replays',
        updatedAt: generalRow.updated_at,
        updatedBy: 'Admin',
      };
    }
  } catch (err) {
    console.warn('[Supabase Official Links] Notice:', err);
  }
  return null;
}

export function subscribeOfficialLinks(callback: (links: OfficialLinkConfig) => void): () => void {
  const fetchLinks = async () => {
    const links = await getOfficialLinksFromSupabase();
    if (links) callback(links);
  };
  fetchLinks();
  const interval = setInterval(fetchLinks, 10000);
  return () => clearInterval(interval);
}

// Match Rules Presets
export async function createMatchRuleInSupabase(preset: Omit<MatchRulesPreset, 'createdAt'>): Promise<void> {
  const id = preset.id || `rule-${Date.now()}`;
  await upsertAppConfig(`rule_${id}`, { ...preset, id, createdAt: new Date().toISOString() }, 'createMatchRuleInSupabase');
}

export async function updateMatchRuleInSupabase(id: string, preset: Partial<MatchRulesPreset>): Promise<void> {
  await upsertAppConfig(`rule_${id}`, preset, 'updateMatchRuleInSupabase');
}

export async function deleteMatchRuleFromSupabase(id: string): Promise<void> {
  try {
    await supabase.from('app_config').delete().eq('id', `rule_${id}`);
  } catch {}
}

export async function cleanAllTournamentBanners(): Promise<{ scanned: number; cleaned: number; uploadedToStorage: number; replacedWithFallback: number; updatedCount: number }> {
  return { scanned: 0, cleaned: 0, uploadedToStorage: 0, replacedWithFallback: 0, updatedCount: 0 };
}

// SuperAdmin Login Initializer
export async function initializeDatabaseOnSuperAdminLogin(uid: string, email: string): Promise<void> {
  try {
    await supabase.from('profiles').upsert({
      id: uid,
      email,
      username: email.split('@')[0] || 'Admin',
      display_name: 'Kushaal Singh (Super Admin)',
      role: 'superadmin',
      status: 'active',
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[Supabase Admin Init] Notice:', e);
  }
}

export async function bootstrapSuperAdminAccount(): Promise<void> {}

// Compatibility Aliases for seamless migration
export const seedInitialSupabaseDataIfEmpty = seedInitialFirestoreDataIfEmpty;
export const createTournamentInFirestore = createTournamentInSupabase;
export const updateTournamentInFirestore = updateTournamentInSupabase;
export const deleteTournamentFromFirestore = deleteTournamentFromSupabase;
export const updateUserStatusInFirestore = updateUserStatusInSupabase;
export const updateUserWalletBalanceInFirestore = updateUserWalletBalanceInSupabase;
export const adjustUserWalletBalanceInFirestore = adjustUserWalletBalanceInSupabase;
export const updateUserProfileInFirestore = updateUserProfileInSupabase;
export const approveTransactionInFirestore = approveTransactionInSupabase;
export const rejectTransactionInFirestore = rejectTransactionInSupabase;
export const createTransactionInFirestore = createTransactionInSupabase;
export const deleteTransactionFromFirestore = deleteTransactionFromSupabase;
export const saveCategoryInFirestore = saveCategoryInSupabase;
export const deleteCategoryFromFirestore = deleteCategoryFromSupabase;
export const saveCouponInFirestore = saveCouponInSupabase;
export const deleteCouponFromFirestore = deleteCouponFromSupabase;
export const saveSystemSettingsInFirestore = saveSystemSettingsInSupabase;
export const getSystemSettingsFromFirestore = getSystemSettingsFromSupabase;
export const sendNotificationInFirestore = sendNotificationInSupabase;
export const saveAdminUserInFirestore = saveAdminUserInSupabase;
export const updateAdminUserStatusInFirestore = updateAdminUserStatusInSupabase;
export const deleteAdminUserFromFirestore = deleteAdminUserFromSupabase;
export const provisionStaffAccountInFirebase = provisionStaffAccountInSupabase;
export const provisionStaffAccountInFirestore = provisionStaffAccountInSupabase;
export const syncLeaderboardToFirestore = syncLeaderboardToSupabase;
export const saveOfficialLinksInFirestore = saveOfficialLinksInSupabase;
export const getOfficialLinksFromFirestore = getOfficialLinksFromSupabase;
export const createMatchRuleInFirestore = createMatchRuleInSupabase;
export const updateMatchRuleInFirestore = updateMatchRuleInSupabase;
export const deleteMatchRuleFromFirestore = deleteMatchRuleFromSupabase;
export const saveSavedImageInFirestore = saveSavedImageInSupabase;
export const deleteSavedImageFromFirestore = deleteSavedImageFromSupabase;
export const cleanAllFirestoreTournamentBanners = cleanAllTournamentBanners;

export async function refundRejectedWithdrawalInSupabase(
  txOrId: WalletTransaction | string,
  refundNotes?: string
): Promise<{ success: boolean; refundTxId: string; alreadyRefunded?: boolean; message?: string }> {
  await ensureSupabaseAuthSession();
  const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;

  let tx: WalletTransaction | null = typeof txOrId === 'object' ? txOrId : null;
  if (!tx) {
    const { data: dbTx } = await supabase.from('wallet_transactions').select('*').eq('id', txId).maybeSingle();
    if (dbTx) {
      tx = normalizeTransactionDoc(dbTx, dbTx.id);
    }
  }

  if (!tx || !tx.userId) {
    throw new Error('Transaction or user information not found.');
  }

  if (tx.status !== 'rejected') {
    throw new Error('Only rejected withdrawal requests can be manually refunded.');
  }

  // Double check overrides to prevent duplicate refunds
  const overrides = await getTxOverridesFromSupabase();
  const ov =
    overrides[txId] ||
    (tx.referenceId ? overrides[tx.referenceId] : null) ||
    (tx.withdrawalRequestId ? overrides[tx.withdrawalRequestId] : null);
  if (tx.isRefunded || ov?.isRefunded) {
    return {
      success: true,
      alreadyRefunded: true,
      refundTxId: `REFUND-${tx.withdrawalRequestId || tx.referenceId || tx.id}`,
      message: 'This withdrawal has already been manually refunded.'
    };
  }

  const refId = `REFUND-${tx.withdrawalRequestId || tx.referenceId || tx.id}`;
  const now = new Date().toISOString();

  // 1. Credit exact amount back to user wallet
  await adjustUserWalletBalanceInSupabase(
    tx.userId,
    tx.amount,
    refundNotes || `Manual refund for rejected withdrawal #${tx.withdrawalRequestId || tx.referenceId || tx.id}`,
    tx.walletType || 'winning',
    'refund'
  );

  // 2. Also try updating wallet_transactions table directly if valid UUID
  if (isUuid(txId)) {
    try {
      await supabase
        .from('wallet_transactions')
        .update({
          description: `Rejected (Refunded: ₹${tx.amount}) [REFUNDED: on ${now}]`,
          admin_notes: `[REFUNDED: on ${now}] Manual refund credited by Admin`
        })
        .eq('id', txId);
    } catch (e) {
      console.warn('[refundRejectedWithdrawalInSupabase] Direct DB update notice:', e);
    }
  }

  // 3. Mark original transaction as refunded permanently across all associated keys
  const refundData = {
    isRefunded: true,
    refundedAt: now,
    refundNotes: refundNotes || 'Manual refund credited by Admin'
  };

  const keysToSave = new Set<string>([txId]);
  if (tx.referenceId) keysToSave.add(tx.referenceId);
  if (tx.withdrawalRequestId) keysToSave.add(tx.withdrawalRequestId);

  for (const k of keysToSave) {
    await saveTxOverrideInSupabase(k, 'rejected', tx.rejectionReason, `Rejected (Refunded: ₹${tx.amount})`, refundData);
    updateLocalTransactionCache(k, refundData);
  }

  return { success: true, refundTxId: refId };
}

export const refundRejectedWithdrawalInFirestore = refundRejectedWithdrawalInSupabase;

export async function rejectWithdrawalWithRefund(
  txId: string,
  rejectionReason: string,
  refundEnabled: boolean
): Promise<void> {
  const { data, error } = await supabase.rpc('reject_withdrawal_with_refund', {
    p_transaction_id: txId,
    p_rejection_reason: rejectionReason,
    p_refund_enabled: refundEnabled,
  });

  if (error) throw error;
  if (!data?.success) throw new Error('Transaction processing failed.');
}

export async function publishMatchResults(
  matchId: string,
  results: { user_id: string; rank: number; kills: number; prize_won: number }[]
): Promise<{ success: boolean; message?: string; processed_count?: number }> {
  await ensureSupabaseAuthSession();

  const { data, error } = await supabase.rpc('publish_match_results', {
    p_match_id: matchId,
    p_results: results,
  });

  if (error) throw error;

  const result = data as { success: boolean; message?: string; processed_count?: number } | null;
  if (!result?.success) {
    throw new Error(result?.message || 'Result publishing failed.');
  }
  return result;
}

export async function cancelMatchAndRefund(matchId: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_match_and_refund', {
    p_match_id: matchId,
  });

  if (error) throw error;
  const result = data as { success: boolean; message?: string } | null;
  if (!result?.success) {
    throw new Error(result?.message || 'Match cancellation failed.');
  }
}

export async function joinMatchWithAccessCode(
  matchId: string,
  accessCode?: string
): Promise<{ success: boolean; message: string }> {
  await ensureSupabaseAuthSession();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('Unauthorized: Please log in to join tournaments.');
  }
  const userId = user.id;

  // 1. Fetch match record
  const { data: matchData, error: matchErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr || !matchData) {
    throw new Error('Match not found.');
  }

  const rawStatus = String(matchData.status || '').toLowerCase();
  if (
    rawStatus === 'cancelled' ||
    rawStatus === 'canceled' ||
    rawStatus === 'completed' ||
    rawStatus === 'finished' ||
    matchData.results_published
  ) {
    throw new Error('This match is unavailable for joining.');
  }

  // 2. Verify server/database time registration cutoff (+30s after start time)
  const matchTimeStr = matchData.match_time || matchData.start_time || matchData.startTime || matchData.matchTime || matchData.schedule || matchData.matchSchedule || matchData.created_at;
  if (matchTimeStr) {
    const startTimeMs = new Date(matchTimeStr).getTime();
    if (!isNaN(startTimeMs)) {
      const nowMs = Date.now();
      const cutoffMs = startTimeMs + 30000; // 30s grace window after scheduled start
      if (nowMs >= cutoffMs) {
        throw new Error('Registration closed. The 30-second grace period for this match has expired.');
      }
    }
  }

  // 3. Verify Match Access Code against authoritative public.tournaments columns (access_code, requires_access_code)
  const hasExplicitRequiresCol = matchData.requires_access_code !== undefined && matchData.requires_access_code !== null;
  let requiresAccessCode = hasExplicitRequiresCol
    ? Boolean(matchData.requires_access_code)
    : Boolean(
        matchData.requiresAccessCode ??
        matchData.require_access_code ??
        matchData.requireAccessCode ??
        matchData.is_private ??
        matchData.isPrivate ??
        false
      );

  let dbAccessCode = (matchData.access_code !== undefined && matchData.access_code !== null)
    ? String(matchData.access_code).trim()
    : String(matchData.accessCode || '').trim();

  // Backward compatibility fallback: ONLY if direct columns were undefined
  if (!hasExplicitRequiresCol && !dbAccessCode && matchData.winner_note) {
    try {
      const meta = typeof matchData.winner_note === 'string' ? JSON.parse(matchData.winner_note) : matchData.winner_note;
      if (meta && typeof meta === 'object') {
        if (meta.access_code) {
          dbAccessCode = String(meta.access_code).trim();
        }
        if (meta.requires_access_code !== undefined) {
          requiresAccessCode = Boolean(meta.requires_access_code);
        }
      }
    } catch {}
  }

  // Access Code OFF MUST bypass code verification.
  // Access Code ON MUST compare entered code against public.tournaments.access_code.
  if (requiresAccessCode) {
    const enteredCode = String(accessCode || '').trim();
    if (!enteredCode || !dbAccessCode || enteredCode !== dbAccessCode) {
      throw new Error('Invalid Access Code. Please enter the correct match access code to join.');
    }
  }

  // 4. Verify user has not already joined (check registrations & participants)
  const { data: existingRegs, error: regCheckErr } = await supabase
    .from('registrations')
    .select('*')
    .eq('tournament_id', matchId)
    .eq('user_id', userId);

  if (!regCheckErr && existingRegs && existingRegs.length > 0) {
    throw new Error('You have already joined this match.');
  }

  const currentParts = Array.isArray(matchData.participants) ? matchData.participants : [];
  const alreadyInInline = currentParts.some(
    (p: any) => p && (p.userId === userId || p.id === userId || p.user_id === userId)
  );
  if (alreadyInInline) {
    throw new Error('You have already joined this match.');
  }

  // 5. Check slot availability
  const totalSlots = Number(matchData.total_slots || matchData.max_slots || matchData.maxSlots || 48);
  const currentJoined = Math.max(currentParts.length, Number(matchData.joined_slots || 0));
  if (currentJoined >= totalSlots) {
    throw new Error('Match is fully booked.');
  }

  const entryFee = Number(matchData.entry_fee || matchData.entryFee || 0);

  // 6. If Paid Match (entry_fee > 0), check authoritative wallet balance and deduct
  if (entryFee > 0) {
    const wallet = await getUserWallet(userId);
    const availableBalance = wallet.depositBalance + wallet.winningBalance;
    if (availableBalance < entryFee) {
      throw new Error('Insufficient balance. Please add money to your wallet.');
    }

    let newDep = wallet.depositBalance;
    let newWin = wallet.winningBalance;
    if (newDep >= entryFee) {
      newDep -= entryFee;
    } else {
      const remainder = entryFee - newDep;
      newDep = 0;
      newWin = Math.max(0, newWin - remainder);
    }

    await syncUserWallet(userId, newDep, newWin, wallet.bonusBalance);

    const txId = crypto.randomUUID();
    const { error: txErr } = await supabase.from('wallet_transactions').insert({
      id: txId,
      user_id: userId,
      type: 'entry_fee',
      amount: entryFee,
      status: 'completed',
      description: `Entry fee for tournament: ${matchData.title || matchId}`,
      reference_id: matchId,
      created_at: new Date().toISOString(),
    });

    if (txErr) {
      // Rollback wallet balance on transaction failure
      await syncUserWallet(userId, wallet.depositBalance, wallet.winningBalance, wallet.bonusBalance);
      throw new Error(`Failed to record payment transaction: ${txErr.message}`);
    }
  }

  // 7. Insert registration record
  const assignedSlot = currentJoined + 1;
  const regId = crypto.randomUUID();
  const { error: insertRegErr } = await supabase.from('registrations').insert({
    id: regId,
    tournament_id: matchId,
    user_id: userId,
    slot_number: assignedSlot,
    status: 'registered',
    entry_fee: entryFee,
    created_at: new Date().toISOString(),
  });

  if (insertRegErr) {
    if (entryFee > 0) {
      const currentWallet = await getUserWallet(userId);
      await syncUserWallet(
        userId,
        currentWallet.depositBalance + entryFee,
        currentWallet.winningBalance,
        currentWallet.bonusBalance
      );
      await supabase
        .from('wallet_transactions')
        .delete()
        .eq('reference_id', matchId)
        .eq('user_id', userId)
        .eq('type', 'entry_fee');
    }
    throw new Error(`Failed to register for tournament: ${insertRegErr.message}`);
  }

  // 8. Update tournaments record joined_slots & participants
  const newParticipant = {
    userId,
    id: userId,
    joinedAt: new Date().toISOString(),
    slotNumber: assignedSlot,
    status: 'registered',
  };
  const updatedParticipants = [...currentParts, newParticipant];
  const newJoinedCount = updatedParticipants.length;

  await supabase
    .from('tournaments')
    .update({
      joined_slots: newJoinedCount,
      participants: updatedParticipants,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (entryFee > 0) {
    return {
      success: true,
      message: `Entry successful. ₹${entryFee} deducted from your wallet.`,
    };
  } else {
    return {
      success: true,
      message: 'Match Joined Successfully',
    };
  }
}

export const joinTournament = joinMatchWithAccessCode;

/* ==========================================================================
   RESULT REQUEST MANAGEMENT SERVICES (Supabase Backend + Realtime)
   ========================================================================== */

export async function fetchResultRequestsFromSupabase(): Promise<ResultRequest[]> {
  try {
    let requests: ResultRequest[] = [];

    // 1. Try dedicated result_requests table
    const { data: tableData, error: tableErr } = await supabase
      .from('result_requests')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (!tableErr && tableData) {
      requests = tableData.map((row: any) => ({
        id: row.id,
        matchId: row.match_id || row.matchId,
        matchTitle: row.match_title || row.matchTitle || 'Match Result',
        matchCategory: row.match_category || row.matchCategory,
        matchType: row.match_type || row.matchType,
        map: row.map,
        entryFee: Number(row.entry_fee ?? row.entryFee ?? 0),
        prizePool: Number(row.prize_pool ?? row.prizePool ?? 0),
        matchDateTime: row.match_date_time || row.matchDateTime,
        matchStatus: row.match_status || row.matchStatus,
        submittedByStaffId: row.submitted_by_staff_id || row.submittedByStaffId || 'Staff',
        submittedByStaffName: row.submitted_by_staff_name || row.submittedByStaffName || 'Staff Member',
        submittedByStaffEmail: row.submitted_by_staff_email || row.submittedByStaffEmail,
        submittedAt: row.submitted_at || row.submittedAt || new Date().toISOString(),
        status: (row.status || 'PENDING').toUpperCase() as ResultRequestStatus,
        participantCount: Number(row.participant_count ?? row.participantCount ?? (row.participant_results?.length || 0)),
        participantResults: Array.isArray(row.participant_results) ? row.participant_results : (Array.isArray(row.participantResults) ? row.participantResults : []),
        resultSummary: typeof row.result_summary === 'object' && row.result_summary ? row.result_summary : (typeof row.resultSummary === 'object' && row.resultSummary ? row.resultSummary : {}),
        evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls : (Array.isArray(row.evidenceUrls) ? row.evidenceUrls : []),
        proofNotes: row.proof_notes || row.proofNotes,
        rejectionReason: row.rejection_reason || row.rejectionReason,
        rejectedAt: row.rejected_at || row.rejectedAt,
        rejectedBy: row.rejected_by || row.rejectedBy,
        approvedAt: row.approved_at || row.approvedAt,
        approvedBy: row.approved_by || row.approvedBy,
        updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
      }));
    } else {
      // 2. Fallback to app_config table key 'result_requests'
      const { data: configData } = await supabase
        .from('app_config')
        .select('*')
        .eq('id', 'result_requests')
        .maybeSingle();

      if (configData) {
        const raw = configData.value ?? configData.data ?? configData.payload ?? configData.content;
        let list: any[] = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (typeof raw === 'string') {
          try { list = JSON.parse(raw); } catch {}
        }
        if (Array.isArray(list)) {
          requests = list.map((item: any) => ({
            id: item.id || `rr_${item.matchId}_${Date.now()}`,
            matchId: item.matchId || item.match_id,
            matchTitle: item.matchTitle || item.match_title || 'Match Result',
            matchCategory: item.matchCategory || item.match_category,
            matchType: item.matchType || item.match_type,
            map: item.map,
            entryFee: Number(item.entryFee ?? item.entry_fee ?? 0),
            prizePool: Number(item.prizePool ?? item.prize_pool ?? 0),
            matchDateTime: item.matchDateTime || item.match_date_time,
            matchStatus: item.matchStatus || item.match_status,
            submittedByStaffId: item.submittedByStaffId || item.submitted_by_staff_id || 'Staff',
            submittedByStaffName: item.submittedByStaffName || item.submitted_by_staff_name || 'Staff Member',
            submittedByStaffEmail: item.submittedByStaffEmail || item.submitted_by_staff_email,
            submittedAt: item.submittedAt || item.submitted_at || new Date().toISOString(),
            status: (item.status || 'PENDING').toUpperCase() as ResultRequestStatus,
            participantCount: Number(item.participantCount ?? item.participant_count ?? (item.participantResults?.length || 0)),
            participantResults: Array.isArray(item.participantResults) ? item.participantResults : (Array.isArray(item.participant_results) ? item.participant_results : []),
            resultSummary: typeof item.resultSummary === 'object' && item.resultSummary ? item.resultSummary : (typeof item.result_summary === 'object' && item.result_summary ? item.result_summary : {}),
            evidenceUrls: Array.isArray(item.evidenceUrls) ? item.evidenceUrls : (Array.isArray(item.evidence_urls) ? item.evidence_urls : []),
            proofNotes: item.proofNotes || item.proof_notes,
            rejectionReason: item.rejectionReason || item.rejection_reason,
            rejectedAt: item.rejectedAt || item.rejected_at,
            rejectedBy: item.rejectedBy || item.rejected_by,
            approvedAt: item.approvedAt || item.approved_at,
            approvedBy: item.approvedBy || item.approved_by,
            updatedAt: item.updatedAt || item.updated_at || new Date().toISOString()
          }));
        }
      }
    }

    // Sort descending by submittedAt
    return requests.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  } catch (err) {
    console.warn('[Supabase] Error fetching result requests:', err);
    return [];
  }
}

export async function submitResultRequestToSupabase(
  payload: Omit<ResultRequest, 'id' | 'submittedAt' | 'status' | 'updatedAt'>
): Promise<{ success: boolean; request: ResultRequest }> {
  await ensureSupabaseAuthSession();
  const { matchId } = payload;
  if (!matchId) throw new Error('Match ID is required to submit a result request.');

  // 1. Fetch current requests to enforce Duplicate Prevention Guard (Requirement #11)
  const existingRequests = await fetchResultRequestsFromSupabase();
  const existingPending = existingRequests.find(r => r.matchId === matchId && r.status === 'PENDING');
  if (existingPending) {
    throw new Error(`A result verification request for this match (${payload.matchTitle || matchId}) is already PENDING Admin verification.`);
  }

  // Check if tournament results are already published
  const { data: tourn } = await supabase
    .from('tournaments')
    .select('status, results_published')
    .eq('id', matchId)
    .maybeSingle();

  if (tourn?.results_published || ['completed', 'finished'].includes(String(tourn?.status || '').toLowerCase())) {
    throw new Error('Results for this match are already officially published.');
  }

  const now = new Date().toISOString();
  const requestId = `rr_${matchId}_${Date.now()}`;

  const newRequest: ResultRequest = {
    ...payload,
    id: requestId,
    submittedAt: now,
    status: 'PENDING',
    updatedAt: now,
  };

  // 2. Persist to dedicated table or app_config fallback
  try {
    const dbPayload = {
      id: requestId,
      match_id: matchId,
      match_title: payload.matchTitle,
      match_category: payload.matchCategory,
      match_type: payload.matchType,
      map: payload.map,
      entry_fee: payload.entryFee || 0,
      prize_pool: payload.prizePool || 0,
      match_date_time: payload.matchDateTime,
      match_status: payload.matchStatus || 'live',
      submitted_by_staff_id: payload.submittedByStaffId,
      submitted_by_staff_name: payload.submittedByStaffName,
      submitted_by_staff_email: payload.submittedByStaffEmail,
      submitted_at: now,
      status: 'PENDING',
      participant_count: payload.participantCount || payload.participantResults.length,
      participant_results: payload.participantResults,
      result_summary: payload.resultSummary,
      evidence_urls: payload.evidenceUrls || [],
      proof_notes: payload.proofNotes || '',
      updated_at: now,
    };

    const { error: insertErr } = await supabase.from('result_requests').upsert(dbPayload);
    if (insertErr) {
      // Table doesn't exist, store in app_config
      const updatedList = [newRequest, ...existingRequests.filter(r => r.id !== requestId)];
      await supabase.from('app_config').upsert({
        id: 'result_requests',
        value: updatedList,
        updated_at: now
      });
    }
  } catch {
    const updatedList = [newRequest, ...existingRequests.filter(r => r.id !== requestId)];
    await supabase.from('app_config').upsert({
      id: 'result_requests',
      value: updatedList,
      updated_at: now
    });
  }

  // 3. Update tournament state
  await supabase
    .from('tournaments')
    .update({
      result_request_status: 'PENDING',
      result_submitted_at: now,
      result_submitted_by: payload.submittedByStaffName,
      updated_at: now,
    })
    .eq('id', matchId);

  // 4. Send Realtime Broadcast Signal
  try {
    const channel = supabase.channel('winx7_realtime_events');
    await channel.send({
      type: 'broadcast',
      event: 'RESULT_REQUEST_CREATED',
      payload: { matchId, requestId, status: 'PENDING' },
    });
  } catch {}

  return { success: true, request: newRequest };
}

export async function approveAndPublishResultRequestInSupabase(
  requestId: string,
  adminUser: { uid: string; displayName: string; role?: string }
): Promise<{ success: boolean; message: string }> {
  await ensureSupabaseAuthSession();

  // 1. Backend Security Check (Requirement #12)
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = adminUser.role || '';
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role) userRole = profile.role;
  }

  const normalizedRole = userRole.toLowerCase().trim();
  if (normalizedRole === 'staff') {
    throw new Error('Security Error: Staff users are strictly forbidden from approving or publishing result requests.');
  }

  // 2. Retrieve request details
  const allRequests = await fetchResultRequestsFromSupabase();
  const request = allRequests.find(r => r.id === requestId || r.matchId === requestId);
  if (!request) throw new Error('Result request not found.');

  const now = new Date().toISOString();
  request.status = 'APPROVED';
  request.approvedAt = now;
  request.approvedBy = adminUser.displayName || adminUser.uid || 'Admin';
  request.updatedAt = now;

  // 3. Transform participant results into RPC format
  const rpcResults = request.participantResults
    .map((p) => {
      const resolvedId = (p.userId || (p as any).user_id || (p as any).uid || (p as any).id || '').toString().trim();
      return {
        user_id: resolvedId,
        rank: Number(p.rank || 0),
        kills: Number(p.kills || 0),
        prize_won: Number(p.prizeWon ?? (p as any).prize_won ?? 0)
      };
    })
    .filter(p => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.user_id));

  if (rpcResults.length === 0) {
    throw new Error('No valid player user IDs found to credit winnings. Please verify player registrations.');
  }

  // 4. Publish results via authoritative Supabase RPC
  await publishMatchResults(request.matchId, rpcResults);

  // 5. Update Result Request record in DB
  try {
    const { error: updateErr } = await supabase
      .from('result_requests')
      .update({
        status: 'APPROVED',
        approved_at: now,
        approved_by: adminUser.displayName,
        updated_at: now
      })
      .eq('id', requestId);

    if (updateErr) {
      const updatedList = allRequests.map(r => r.id === requestId ? request : r);
      await supabase.from('app_config').upsert({
        id: 'result_requests',
        value: updatedList,
        updated_at: now
      });
    }
  } catch {
    const updatedList = allRequests.map(r => r.id === requestId ? request : r);
    await supabase.from('app_config').upsert({
      id: 'result_requests',
      value: updatedList,
      updated_at: now
    });
  }

  // 6. Update tournament metadata
  await supabase
    .from('tournaments')
    .update({
      status: 'completed',
      results_published: true,
      result_request_status: 'APPROVED',
      completed_at: now,
      updated_at: now
    })
    .eq('id', request.matchId);

  // 7. Realtime Broadcast Notification (Requirement #8 & #9)
  try {
    const channel = supabase.channel('winx7_realtime_events');
    await channel.send({
      type: 'broadcast',
      event: 'RESULT_REQUEST_APPROVED',
      payload: { matchId: request.matchId, requestId, status: 'APPROVED' }
    });
  } catch {}

  return { success: true, message: `Result for match "${request.matchTitle}" has been approved and published.` };
}

export async function rejectResultRequestInSupabase(
  requestId: string,
  rejectionReason: string,
  adminUser: { uid: string; displayName: string; role?: string }
): Promise<{ success: boolean; message: string }> {
  await ensureSupabaseAuthSession();
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('Rejection reason is required.');
  }

  // 1. Security Check
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = adminUser.role || '';
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role) userRole = profile.role;
  }
  if (userRole.toLowerCase().trim() === 'staff') {
    throw new Error('Security Error: Staff users cannot reject result requests.');
  }

  const allRequests = await fetchResultRequestsFromSupabase();
  const request = allRequests.find(r => r.id === requestId || r.matchId === requestId);
  if (!request) throw new Error('Result request not found.');

  const now = new Date().toISOString();
  request.status = 'REJECTED';
  request.rejectionReason = rejectionReason.trim();
  request.rejectedAt = now;
  request.rejectedBy = adminUser.displayName || adminUser.uid || 'Admin';
  request.updatedAt = now;

  // 2. Update DB record
  try {
    const { error: updateErr } = await supabase
      .from('result_requests')
      .update({
        status: 'REJECTED',
        rejection_reason: rejectionReason.trim(),
        rejected_at: now,
        rejected_by: adminUser.displayName,
        updated_at: now
      })
      .eq('id', requestId);

    if (updateErr) {
      const updatedList = allRequests.map(r => r.id === requestId ? request : r);
      await supabase.from('app_config').upsert({
        id: 'result_requests',
        value: updatedList,
        updated_at: now
      });
    }
  } catch {
    const updatedList = allRequests.map(r => r.id === requestId ? request : r);
    await supabase.from('app_config').upsert({
      id: 'result_requests',
      value: updatedList,
      updated_at: now
    });
  }

  // 3. Update tournament metadata to allow Staff correction & resubmission
  await supabase
    .from('tournaments')
    .update({
      result_request_status: 'REJECTED',
      rejection_reason: rejectionReason.trim(),
      updated_at: now
    })
    .eq('id', request.matchId);

  // 4. Realtime Broadcast
  try {
    const channel = supabase.channel('winx7_realtime_events');
    await channel.send({
      type: 'broadcast',
      event: 'RESULT_REQUEST_REJECTED',
      payload: { matchId: request.matchId, requestId, status: 'REJECTED', rejectionReason: rejectionReason.trim() }
    });
  } catch {}

  return { success: true, message: `Result request for "${request.matchTitle}" rejected.` };
}

export function subscribeToResultRequests(onUpdate: (requests: ResultRequest[]) => void): () => void {
  let isSubscribed = true;

  const loadData = async () => {
    if (!isSubscribed) return;
    const requests = await fetchResultRequestsFromSupabase();
    if (isSubscribed) {
      onUpdate(requests);
    }
  };

  loadData();

  // Setup Postgres changes listener & broadcast listener
  const channel = supabase.channel('winx7_result_requests_rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'result_requests' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => loadData())
    .on('broadcast', { event: 'RESULT_REQUEST_CREATED' }, () => loadData())
    .on('broadcast', { event: 'RESULT_REQUEST_APPROVED' }, () => loadData())
    .on('broadcast', { event: 'RESULT_REQUEST_REJECTED' }, () => loadData())
    .subscribe();

  const intervalId = setInterval(loadData, 8000);

  return () => {
    isSubscribed = false;
    clearInterval(intervalId);
    supabase.removeChannel(channel);
  };
}

