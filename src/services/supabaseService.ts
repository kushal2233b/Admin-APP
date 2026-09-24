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
  ResultRequestParticipant,
  SupportStaffMember,
  SupportCategoryItem
} from '../types';
import { sendMatchResultNotification, sendWithdrawalNotification } from './notificationSenderService';
import { deleteFromStorage } from './storageService';
import { getSynchronizedServerTime } from './serverTimeSync';

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
export function getMatchDateTimeStrings(startTimeInput: string, matchDateInput?: string) {
  const timeStr = (startTimeInput || '').trim();
  const dateStr = (matchDateInput || '').trim();

  if (!timeStr) {
    const now = new Date();
    const iso = now.toISOString();
    return {
      matchTime: iso,
      matchDate: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
      formattedTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    };
  }

  // 1. Check if timeStr contains a full ISO timestamp/datetime.
  const hasDateInTimeStr = /^\d{4}-\d{2}-\d{2}/.test(timeStr) || timeStr.includes('T');

  if (hasDateInTimeStr) {
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
        const formattedTime = `${h12}:${String(minutes).padStart(2, '0')} ${ampm}`;

        return {
          matchTime: timeStr,
          matchDate,
          dayOfWeek,
          formattedTime
        };
      }
    } catch {}
  }

  // 2. Parse date components from dateStr if available, otherwise fallback to current date.
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1; // 1-indexed
  let day = new Date().getDate();

  if (dateStr) {
    const ymdMatch = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    const dmyMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (ymdMatch) {
      year = Number(ymdMatch[1]);
      month = Number(ymdMatch[2]);
      day = Number(ymdMatch[3]);
    } else if (dmyMatch) {
      day = Number(dmyMatch[1]);
      month = Number(dmyMatch[2]);
      year = Number(dmyMatch[3]);
    }
  }

  // 3. Parse time components from timeStr
  let hour = 12;
  let minute = 0;
  let parsedTimeSuccess = false;

  if (timeStr) {
    const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const militaryMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);

    if (ampmMatch) {
      let h = Number(ampmMatch[1]);
      const min = Number(ampmMatch[2]);
      const ampm = ampmMatch[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hour = h;
      minute = min;
      parsedTimeSuccess = true;
    } else if (militaryMatch) {
      hour = Number(militaryMatch[1]);
      minute = Number(militaryMatch[2]);
      parsedTimeSuccess = true;
    }
  }

  // 4. Reconstruct ISO timestamp with Asia/Kolkata (+05:30) offset
  if (parsedTimeSuccess || dateStr) {
    const isoWithOffset = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
    try {
      const dateObj = new Date(isoWithOffset);
      if (!isNaN(dateObj.getTime())) {
        const dayFormatted = String(day).padStart(2, '0');
        const monthFormatted = String(month).padStart(2, '0');
        const matchDate = `${dayFormatted}/${monthFormatted}/${year}`;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[dateObj.getDay()] || 'Today';
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        const formattedTime = `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;

        return {
          matchTime: dateObj.toISOString(),
          matchDate,
          dayOfWeek,
          formattedTime
        };
      }
    } catch {}
  }

  return {
    matchTime: timeStr,
    matchDate: dateStr || 'Today',
    dayOfWeek: 'Today',
    formattedTime: timeStr
  };
}

/**
 * Helper to get current date parts in Asia/Kolkata timezone
 */
export function getKolkataDateParts(referenceNowMs: number = Date.now()): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.format(new Date(referenceNowMs)).split('-');
    return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
  } catch {
    const d = new Date(referenceNowMs + 5.5 * 60 * 60 * 1000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
}

/**
 * Robust parser to extract exact timestamp in milliseconds from tournament start time / date fields.
 * Strictly uses Asia/Kolkata timezone (+05:30) for scheduled dates and times.
 */
export function parseMatchStartTimeMs(
  matchTime?: string | null,
  matchDate?: string | null,
  timeStr?: string | null,
  referenceNowMs: number = Date.now()
): number | null {
  const timeVal = (matchTime || '').trim();
  const dateVal = (matchDate || '').trim();
  const fallbackTimeVal = (timeStr || '').trim();

  // 1. Check if timeVal has explicit timezone designator (Z or +hh:mm)
  if (timeVal) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timeVal)) {
      const parsed = Date.parse(timeVal);
      if (!isNaN(parsed)) return parsed;
    }

    // 2. Check if timeVal is ISO local format: YYYY-MM-DDTHH:mm(:ss)?
    const isoMatch = timeVal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const [, y, m, d, h, min, s] = isoMatch;
      const sec = s ? s.padStart(2, '0') : '00';
      const isoWithKolkata = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min.padStart(2, '0')}:${sec}+05:30`;
      const parsed = Date.parse(isoWithKolkata);
      if (!isNaN(parsed)) return parsed;
    }
  }

  // 3. Extract time components (HH:mm:ss AM/PM or HH:mm:ss 24h)
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let timeFound = false;

  const rawTimeToParse = timeVal || fallbackTimeVal;
  if (rawTimeToParse) {
    const tMatch = rawTimeToParse.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
    if (tMatch) {
      let h = Number(tMatch[1]);
      const min = Number(tMatch[2]);
      const sec = tMatch[3] ? Number(tMatch[3]) : 0;
      const ampm = (tMatch[4] || '').toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hours = h;
      minutes = min;
      seconds = sec;
      timeFound = true;
    }
  }

  // 4. Extract date components (DD/MM/YYYY, YYYY-MM-DD, Today, Tomorrow)
  let year: number;
  let month: number;
  let day: number;

  const kolkataNow = getKolkataDateParts(referenceNowMs);

  if (dateVal) {
    const dmyMatch = dateVal.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    const ymdMatch = dateVal.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);

    if (dmyMatch) {
      day = Number(dmyMatch[1]);
      month = Number(dmyMatch[2]);
      year = Number(dmyMatch[3]);
    } else if (ymdMatch) {
      year = Number(ymdMatch[1]);
      month = Number(ymdMatch[2]);
      day = Number(ymdMatch[3]);
    } else if (dateVal.toLowerCase() === 'today') {
      year = kolkataNow.year;
      month = kolkataNow.month;
      day = kolkataNow.day;
    } else if (dateVal.toLowerCase() === 'tomorrow') {
      const tomorrowMs = referenceNowMs + 24 * 60 * 60 * 1000;
      const tKolkata = getKolkataDateParts(tomorrowMs);
      year = tKolkata.year;
      month = tKolkata.month;
      day = tKolkata.day;
    } else {
      year = kolkataNow.year;
      month = kolkataNow.month;
      day = kolkataNow.day;
    }
  } else {
    year = kolkataNow.year;
    month = kolkataNow.month;
    day = kolkataNow.day;
  }

  if (!timeFound && !timeVal && !fallbackTimeVal) {
    return null;
  }

  const yStr = String(year).padStart(4, '0');
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  const hStr = String(hours).padStart(2, '0');
  const minStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  const finalIso = `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}:${sStr}+05:30`;
  const resultMs = Date.parse(finalIso);
  return isNaN(resultMs) ? null : resultMs;
}

/**
 * Determines whether a match has reached its automatic LIVE threshold
 * Rule: Automatically transitions to LIVE at exactly 30 seconds after the scheduled start time
 * Example: Match scheduled for 10:30:00 AM becomes LIVE at 10:30:30 AM
 */
export function isMatchLiveBySchedule(
  matchTime?: string | null,
  matchDate?: string | null,
  timeStr?: string | null,
  currentServerTimeMs: number = getSynchronizedServerTime()
): boolean {
  const startMs = parseMatchStartTimeMs(matchTime, matchDate, timeStr, currentServerTimeMs);
  if (startMs === null || isNaN(startMs)) return false;
  // Exactly 30 seconds after scheduled start time in Asia/Kolkata
  const liveThresholdMs = startMs + 30 * 1000;
  return currentServerTimeMs >= liveThresholdMs;
}

/**
 * Normalize any Match ID into public format WX7-DDMM-XXX (strip old year if present)
 */
export function normalizePublicMatchId(rawMatchId?: string | null): string | null {
  if (!rawMatchId || typeof rawMatchId !== 'string') return null;
  const trimmed = rawMatchId.trim();
  // Old format: WX7-DDMMYY-XXX -> convert to WX7-DDMM-XXX
  const oldMatch = trimmed.match(/^WX7-(\d{4})\d{2}-(\d{3,})$/i);
  if (oldMatch) {
    return `WX7-${oldMatch[1]}-${oldMatch[2]}`;
  }
  // Already in WX7-DDMM-XXX format
  if (/^WX7-\d{4}-\d{3,}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

/**
 * Format date to public DDMM string in Asia/Kolkata timezone (NO YEAR)
 */
export function formatMatchIdDateKey(dateInput?: string | number | Date): string {
  let d: Date;
  if (!dateInput) {
    d = new Date();
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput);
  } else {
    const parsed = new Date(dateInput);
    d = isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value || String(d.getDate()).padStart(2, '0');
    const month = parts.find((p) => p.type === 'month')?.value || String(d.getMonth() + 1).padStart(2, '0');
    return `${day}${month}`;
  } catch {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}${month}`;
  }
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

  // Extract metadata from winner_note if available
  let metaGame = '';
  let metaMatchCategory = '';
  if (docData?.winner_note) {
    try {
      const parsed = typeof docData.winner_note === 'string' ? JSON.parse(docData.winner_note) : docData.winner_note;
      if (parsed && typeof parsed === 'object') {
        if (parsed.game) metaGame = String(parsed.game).trim().toUpperCase();
        if (parsed.match_category || parsed.matchCategory) metaMatchCategory = String(parsed.match_category || parsed.matchCategory).trim().toUpperCase();
      }
    } catch {}
  }

  // 1. Determine GAME (Must be FREE FIRE or BGMI)
  let gameName: string = 'FREE FIRE';
  const rawGame = String(docData?.game || metaGame || docData?.game_category || docData?.game_name || docData?.gameName || '').toUpperCase().trim();
  const rawTitle = String(docData?.title || docData?.name || '').toUpperCase().trim();
  const rawCat = String(docData?.category_name || docData?.category || docData?.match_category || docData?.matchCategory || metaMatchCategory || '').toUpperCase().trim();
  const rawMap = String(docData?.map_name || docData?.map || '').toUpperCase().trim();
  const rawMode = String(docData?.mode || docData?.match_type || docData?.matchType || '').toUpperCase().trim();
  const rawDesc = String(docData?.description || docData?.desc || '').toUpperCase().trim();
  const rawMaxSlots = Number(docData?.total_slots ?? docData?.max_slots ?? docData?.maxSlots ?? docData?.max_participants ?? docData?.maxParticipants ?? 0);

  const isBgmiSignals = 
    rawGame === 'BGMI' || 
    rawGame.includes('BATTLEGROUND') || 
    rawGame === 'PUBG' ||
    rawTitle.includes('BGMI') || 
    rawTitle.includes('BATTLEGROUND') ||
    rawTitle.includes('PUBG') ||
    rawCat === 'BGMI' || 
    rawCat.includes('BATTLEGROUND') ||
    ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes(rawMap) ||
    rawMode.includes('TDM') || 
    rawMode.includes('ULTIMATE ROYALE') ||
    rawDesc.includes('BGMI') ||
    rawDesc.includes('BATTLEGROUND') ||
    rawMaxSlots === 100;

  if (isBgmiSignals) {
    gameName = 'BGMI';
  } else if (rawGame === 'FREE FIRE' || rawGame === 'FREEFIRE' || rawGame === 'FF' || rawTitle.includes('FREE FIRE') || rawTitle.includes('FREEFIRE') || rawCat === 'FREE FIRE' || rawCat === 'FREEFIRE' || ['BERMUDA', 'NEXTERRA', 'KALAHARI', 'ALPINE', 'PURGATORY'].includes(rawMap) || rawMode.includes('CLASH SQUAD') || rawMode.includes('LONE WOLF') || rawMaxSlots === 48) {
    gameName = 'FREE FIRE';
  } else if (rawGame) {
    gameName = rawGame;
  }

  console.log('[DEBUG TRACE 6] User App Supabase query raw "game_category":', docData?.game_category ?? docData?.gameCategory ?? 'NULL');
  console.log('[DEBUG TRACE 7] Models.kt received Tournament.game_category:', docData?.game_category ?? docData?.gameCategory ?? gameName);
  console.log('[DEBUG TRACE 8] displayGameCategory GAME badge:', gameName);

  // 2. Determine MATCH CATEGORY (SURVIVOR, ARENA, LONE WOLF, etc.)
  let matchCategoryName = 'SURVIVOR';
  const rawExplicitCat = docData?.match_category || docData?.matchCategory || docData?.category_name || docData?.category;
  if (rawExplicitCat && typeof rawExplicitCat === 'string' && rawExplicitCat.trim()) {
    const upper = rawExplicitCat.trim().toUpperCase();
    if (upper === 'FREE FIRE' || upper === 'FREEFIRE' || upper === 'BGMI' || upper.includes('BATTLEGROUND')) {
      const modeUpper = String(docData?.mode || docData?.match_type || docData?.matchType || '').toUpperCase();
      if (modeUpper.includes('LONE WOLF') || modeUpper.includes('1 VS 1') || modeUpper.includes('2 VS 2')) {
        matchCategoryName = 'LONE WOLF';
      } else if (modeUpper.includes('ARENA') || modeUpper.includes('TDM') || modeUpper.includes('CLASH SQUAD') || modeUpper.includes('4 VS 4')) {
        matchCategoryName = 'ARENA';
      } else {
        matchCategoryName = 'SURVIVOR';
      }
    } else {
      matchCategoryName = rawExplicitCat.trim().toUpperCase();
    }
  } else {
    const modeUpper = String(docData?.mode || docData?.match_type || docData?.matchType || '').toUpperCase();
    if (modeUpper.includes('LONE WOLF')) {
      matchCategoryName = 'LONE WOLF';
    } else if (modeUpper.includes('ARENA') || modeUpper.includes('TDM') || modeUpper.includes('CLASH SQUAD')) {
      matchCategoryName = 'ARENA';
    } else {
      matchCategoryName = 'SURVIVOR';
    }
  }

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
  const dtInfo = getMatchDateTimeStrings(matchTimeVal, docData?.match_date || docData?.matchDate);
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

    const isTimeLive = isMatchLiveBySchedule(matchTimeVal, matchDateVal, docData?.time || dtInfo.formattedTime);

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

    const rawMatchId = (docData?.match_id !== undefined && docData?.match_id !== null && String(docData.match_id).trim().length > 0)
      ? String(docData.match_id).trim()
      : (docData?.matchId && String(docData.matchId).trim().length > 0)
        ? String(docData.matchId).trim()
        : '';
    const resolvedMatchId = normalizePublicMatchId(rawMatchId) || rawMatchId;

    return {
      id: id || docData?.id || `tournament-${Date.now()}`,
      matchId: resolvedMatchId,
      match_id: resolvedMatchId,
      title: docData?.title || docData?.name || 'Untitled Tournament',
      game: gameName,
      gameCategory: gameName,
      game_category: gameName,
      matchCategory: matchCategoryName,
      category: matchCategoryName,
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
      startTime: dtInfo.matchTime,
      matchSchedule: dtInfo.matchTime,
      schedule: dtInfo.matchTime,
      match_time: dtInfo.matchTime,
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

  const ffUid = extractCleanString(
    docData?.ff_uid ||
    docData?.ffUid ||
    docData?.free_fire_uid ||
    docData?.freefire_uid ||
    docData?.free_fire_id ||
    docData?.freefire_id ||
    docData?.ff_id ||
    meta?.ff_uid ||
    meta?.free_fire_uid,
    ''
  );

  const ffIgn = extractCleanString(
    docData?.ff_ign ||
    docData?.ffIgn ||
    docData?.free_fire_ign ||
    docData?.freefire_ign ||
    docData?.free_fire_name ||
    docData?.freeFireName ||
    docData?.ff_name ||
    meta?.ff_ign ||
    meta?.free_fire_ign,
    ''
  );

  const bgmiUid = extractCleanString(
    docData?.bgmi_uid ||
    docData?.bgmiUid ||
    docData?.bgmi_id ||
    docData?.bgmiId ||
    docData?.pubg_id ||
    docData?.pubgId ||
    docData?.pubg_uid ||
    docData?.pubgUid ||
    meta?.bgmi_uid ||
    meta?.bgmiUid ||
    meta?.bgmi_id,
    ''
  );

  const bgmiIgn = extractCleanString(
    docData?.bgmi_ign ||
    docData?.bgmiIgn ||
    docData?.bgmi_name ||
    docData?.bgmiName ||
    docData?.pubg_name ||
    docData?.pubgName ||
    meta?.bgmi_ign ||
    meta?.bgmiIgn ||
    meta?.bgmi_name,
    ''
  );

  const inGameId = extractCleanString(
    ffUid ||
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
    meta?.in_game_id ||
    meta?.inGameId ||
    meta?.game_id ||
    meta?.game_uid ||
    meta?.player_id,
    ''
  );

  const inGameName = extractCleanString(
    ffIgn ||
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
    ffUid: ffUid || inGameId,
    ffIgn: ffIgn || inGameName,
    bgmiUid: bgmiUid,
    bgmiIgn: bgmiIgn,
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
    status: (() => {
      const rawStatus = String(docData?.status || '').toLowerCase();
      const isSusp = Boolean(docData?.is_suspended ?? docData?.isSuspended ?? (rawStatus === 'suspended'));
      const isBan = Boolean(docData?.is_banned ?? docData?.isBanned ?? (rawStatus === 'banned'));
      const isBlock = Boolean(docData?.is_blocked ?? docData?.isBlocked ?? (rawStatus === 'blocked'));
      if (isSusp || rawStatus === 'suspended') return 'suspended';
      if (isBan || rawStatus === 'banned') return 'banned';
      if (isBlock || rawStatus === 'blocked') return 'blocked';
      return 'active';
    })(),
    is_suspended: Boolean(docData?.is_suspended ?? docData?.isSuspended ?? (String(docData?.status || '').toLowerCase() === 'suspended')),
    isSuspended: Boolean(docData?.is_suspended ?? docData?.isSuspended ?? (String(docData?.status || '').toLowerCase() === 'suspended')),
    is_banned: Boolean(docData?.is_banned ?? docData?.isBanned ?? (String(docData?.status || '').toLowerCase() === 'banned')),
    is_blocked: Boolean(docData?.is_blocked ?? docData?.isBlocked ?? ['blocked', 'banned'].includes(String(docData?.status || '').toLowerCase())),
    role: docData?.role || 'user',
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
    lastLogin: docData?.last_login || docData?.lastLogin || new Date().toISOString(),
    isEmailVerified: Boolean(docData?.is_email_verified ?? docData?.isEmailVerified ?? true),
    isPhoneVerified: Boolean(docData?.is_phone_verified ?? docData?.isPhoneVerified ?? false),
    banReason: docData?.ban_reason || docData?.banReason || '',
    ban_reason: docData?.ban_reason || docData?.banReason || '',
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
  users: AppUser[] = [],
  matchContext?: any
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
    parsed && typeof parsed === 'object' && (
      parsed.bgmi_uid || parsed.bgmiUid || parsed.bgmi_ign || parsed.bgmiIgn || parsed.pubgId ||
      (parsed.game || '').toUpperCase() === 'BGMI'
    )
  );

  // If input is a raw primitive string or number (e.g. user UUID, email, or username)
  if (typeof parsed === 'string' || typeof parsed === 'number') {
    const str = String(parsed).trim();
    const strLower = str.toLowerCase();

    const matchedUser = (users || []).find((u) => {
      if (!u) return false;
      const uId = (u.id || '').toLowerCase().trim();
      const uUid = (u.uid || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uInGameId = (u.inGameId || (u as any).bgmiUid || (u as any).ffUid || '').toLowerCase().trim();
      const uInGameName = (u.inGameName || (u as any).bgmiIgn || (u as any).ffIgn || '').toLowerCase().trim();
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

      let bestIgn = 'N/A';
      let bestUid = 'N/A';

      if (isBgmi) {
        bestIgn = (matchedUser as any).bgmiIgn || (matchedUser as any).bgmi_ign || (matchedUser as any).bgmiName || (matchedUser as any).pubgName || matchedUser.inGameName;
        bestUid = (matchedUser as any).bgmiUid || (matchedUser as any).bgmi_uid || (matchedUser as any).bgmiId || (matchedUser as any).pubgId || matchedUser.inGameId;
      } else {
        bestIgn = (matchedUser as any).ffIgn || (matchedUser as any).ff_ign || matchedUser.inGameName;
        bestUid = (matchedUser as any).ffUid || (matchedUser as any).ff_uid || matchedUser.inGameId;
      }

      if (!bestIgn || bestIgn === 'N/A') {
        bestIgn = (matchedUser.inGameName && matchedUser.inGameName !== 'N/A' && matchedUser.inGameName !== 'Player' ? matchedUser.inGameName : '') ||
                  (matchedUser.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
                  bestUsername || 'N/A';
      }

      if (!bestUid || bestUid === 'N/A') {
        bestUid = (matchedUser.inGameId && matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : '') ||
                  (matchedUser.uid && matchedUser.uid !== 'N/A' ? matchedUser.uid : '') ||
                  (matchedUser.id && matchedUser.id !== 'N/A' ? matchedUser.id : '') || 'N/A';
      }

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
    parsed.inGameName || parsed.in_game_name || parsed.ign || parsed.game_name || parsed.gameName || ''
  ).toString().trim();
  const pInGameId = (
    parsed.inGameId || parsed.in_game_id || parsed.game_uid || parsed.gameUid || parsed.game_id || parsed.gameId || parsed.ign_id || parsed.ignId || ''
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

    const uInGameId = (u.inGameId || (u as any).bgmiUid || (u as any).ffUid || (u as any).ignId || '').toString().toLowerCase().trim();
    if (pInGameId && uInGameId && pInGameId.toLowerCase() === uInGameId) return true;

    const uUsername = (u.username || (u as any).displayName || '').toString().toLowerCase().trim();
    if (pUsername && uUsername && pUsername.toLowerCase() === uUsername) return true;

    const uInGameName = (u.inGameName || (u as any).bgmiIgn || (u as any).ffIgn || (u as any).ign || '').toString().toLowerCase().trim();
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

  let bestIgn = 'N/A';
  let bestUid = 'N/A';

  if (isBgmi) {
    const userBgmiUid = (matchedUser as any)?.bgmiUid || (matchedUser as any)?.bgmi_uid || (matchedUser as any)?.bgmiId || (matchedUser as any)?.pubgId;
    const userBgmiIgn = (matchedUser as any)?.bgmiIgn || (matchedUser as any)?.bgmi_ign || (matchedUser as any)?.bgmiName || (matchedUser as any)?.pubgName;

    bestUid = userBgmiUid || parsed.bgmiUid || parsed.bgmi_uid || pInGameId || matchedUser?.inGameId || 'N/A';
    bestIgn = userBgmiIgn || parsed.bgmiIgn || parsed.bgmi_ign || pInGameName || matchedUser?.inGameName || 'N/A';
  } else {
    const userFfUid = (matchedUser as any)?.ffUid || (matchedUser as any)?.ff_uid || (matchedUser as any)?.freeFireId;
    const userFfIgn = (matchedUser as any)?.ffIgn || (matchedUser as any)?.ff_ign || (matchedUser as any)?.freeFireName;

    bestUid = userFfUid || parsed.ffUid || parsed.ff_uid || pInGameId || matchedUser?.inGameId || 'N/A';
    bestIgn = userFfIgn || parsed.ffIgn || parsed.ff_ign || pInGameName || matchedUser?.inGameName || 'N/A';
  }

  if (!bestIgn || bestIgn === 'N/A') {
    bestIgn = (matchedUser?.inGameName && matchedUser.inGameName !== 'N/A' && matchedUser.inGameName !== 'Player' ? matchedUser.inGameName : '') ||
              (pInGameName && pInGameName !== 'N/A' && pInGameName !== 'Player' ? pInGameName : '') ||
              (matchedUser?.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
              (pUsername && pUsername !== 'Player' && pUsername !== 'User' ? pUsername : '') ||
              bestUsername || 'N/A';
  }

  if (!bestUid || bestUid === 'N/A') {
    bestUid = (matchedUser?.inGameId && matchedUser.inGameId !== 'N/A' ? matchedUser.inGameId : '') ||
              (pInGameId && pInGameId !== 'N/A' ? pInGameId : '') ||
              (matchedUser?.uid && matchedUser.uid !== 'N/A' ? matchedUser.uid : '') ||
              (matchedUser?.id && matchedUser.id !== 'N/A' ? matchedUser.id : '') ||
              (pUserId && pUserId !== 'N/A' ? pUserId : '') || 'N/A';
  }

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

/**
 * Resolves authentic user account identity (Username, Email, Phone, User ID)
 * strictly for financial transactions (deposits, withdrawals, coupons, winnings, refunds, ledger).
 * Excludes Free Fire and BGMI in-game IGNs.
 */
export function resolveTransactionUser(
  input: any,
  users: AppUser[] = []
): {
  username: string;
  email: string;
  phone: string;
  userId: string;
  matchedUser: AppUser | null;
} {
  if (!input) {
    return {
      username: 'User',
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

  if (typeof parsed === 'string' || typeof parsed === 'number') {
    const str = String(parsed).trim();
    const strLower = str.toLowerCase();

    const matchedUser = (users || []).find((u) => {
      if (!u) return false;
      const uId = (u.id || '').toLowerCase().trim();
      const uUid = (u.uid || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUsername = (u.username || '').toLowerCase().trim();
      return (
        (uId && strLower === uId) ||
        (uUid && strLower === uUid) ||
        (uEmail && strLower === uEmail) ||
        (uUsername && strLower === uUsername)
      );
    });

    if (matchedUser) {
      const bestUsername =
        (matchedUser.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
        (matchedUser.displayName && matchedUser.displayName !== 'Player' && matchedUser.displayName !== 'User' ? matchedUser.displayName : '') ||
        (matchedUser.email ? matchedUser.email.split('@')[0] : '') ||
        'User';

      return {
        username: bestUsername,
        email: matchedUser.email || 'N/A',
        phone: matchedUser.phone || 'N/A',
        userId: matchedUser.uid || matchedUser.id || str,
        matchedUser
      };
    }

    const isEmail = str.includes('@');
    return {
      username: isEmail ? str.split('@')[0] : (str.length > 25 ? `User (${str.slice(0, 6)})` : (str || 'User')),
      email: isEmail ? str : 'N/A',
      phone: 'N/A',
      userId: !isEmail ? str : 'N/A',
      matchedUser: null
    };
  }

  const pUserId = (parsed.userId || parsed.user_id || parsed.userUid || parsed.user_uid || parsed.uid || parsed.id || '').toString().trim();
  const pEmail = (parsed.email || parsed.userEmail || parsed.user_email || parsed.mail || '').toString().trim();
  const pPhone = (parsed.phone || parsed.userPhone || parsed.user_phone || parsed.mobile || '').toString().trim();
  const pUsername = (parsed.username || parsed.user_name || parsed.displayName || parsed.display_name || parsed.name || parsed.fullName || parsed.full_name || '').toString().trim();

  const matchedUser = (users || []).find((u) => {
    if (!u) return false;
    const uUid = (u.uid || u.id || '').toString().toLowerCase().trim();
    if (pUserId && uUid && pUserId.toLowerCase() === uUid) return true;

    const uEmail = (u.email || '').toString().toLowerCase().trim();
    if (pEmail && uEmail && pEmail.toLowerCase() === uEmail) return true;

    const uPhone = (u.phone || '').toString().trim();
    if (pPhone && uPhone && pPhone === uPhone) return true;

    const uUsername = (u.username || (u as any).displayName || '').toString().toLowerCase().trim();
    if (pUsername && uUsername && pUsername.toLowerCase() === uUsername) return true;

    return false;
  });

  const bestUsername =
    (matchedUser?.username && matchedUser.username !== 'Player' && matchedUser.username !== 'User' ? matchedUser.username : '') ||
    (matchedUser?.displayName && matchedUser.displayName !== 'Player' && matchedUser.displayName !== 'User' ? matchedUser.displayName : '') ||
    (pUsername && pUsername !== 'Player' && pUsername !== 'User' ? pUsername : '') ||
    (matchedUser?.email ? matchedUser.email.split('@')[0] : '') ||
    (pEmail ? pEmail.split('@')[0] : '') ||
    (matchedUser?.phone ? matchedUser.phone : '') ||
    (pPhone ? pPhone : '') ||
    'User';

  const finalEmail = matchedUser?.email || pEmail || 'N/A';
  const finalPhone = matchedUser?.phone || pPhone || 'N/A';
  const finalUserId = matchedUser?.uid || matchedUser?.id || pUserId || 'N/A';

  return {
    username: bestUsername,
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
    userEmail: profile?.email || docData?.user_email || docData?.email || docData?.userEmail || undefined,
    userPhone: profile?.phone || docData?.user_phone || docData?.phone || docData?.userPhone || undefined,
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
    targetUserId: docData?.user_id || docData?.target_user_id || docData?.targetUserId,
    userId: docData?.user_id || docData?.target_user_id || docData?.userId,
    sentAt: docData?.created_at || docData?.sent_at || docData?.sentAt || new Date().toISOString(),
    createdAt: docData?.created_at || docData?.createdAt || new Date().toISOString(),
    sentBy: docData?.sent_by || docData?.sentBy || 'Admin',
    isRead: Boolean(docData?.is_read ?? docData?.isRead ?? docData?.read ?? false),
    read: Boolean(docData?.is_read ?? docData?.isRead ?? docData?.read ?? false),
    imageUrl: docData?.image_url || docData?.imageUrl,
    link: docData?.link,
  };
}

export function normalizeCategoryDoc(docData: any, id: string = docData?.id || ''): MatchCategory {
  const catName = String(docData?.name || docData?.title || docData?.game || docData?.category || 'Game').trim();
  const banner = docData?.banner_url || docData?.bannerUrl || docData?.image_url || docData?.imageUrl || getCategoryBannerImage(catName);
  const image = docData?.image_url || docData?.imageUrl || docData?.banner_url || docData?.bannerUrl || getCategoryBannerImage(catName);
  const orderNum = Number(docData?.display_order ?? docData?.displayOrder ?? docData?.sort_order ?? docData?.sortOrder ?? docData?.order ?? 0);

  return {
    id: id || docData?.id || catName.toLowerCase().replace(/\s+/g, '-'),
    name: catName,
    description: docData?.description || '',
    isActive: Boolean(docData?.is_active ?? docData?.isActive ?? true),
    imageUrl: image,
    bannerUrl: banner,
    displayOrder: orderNum,
    sortOrder: orderNum,
    order: orderNum,
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
      minAppVersion: '1.0.7',
      minimumAppVersion: '1.0.7',
      latestAppVersion: '1.0.8',
      appVersion: '1.0.8',
      updateMessage: '',
      updateUrl: '',
      isForceUpdate: false,
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
    minAppVersion: String(merged.minimum_app_version || merged.minimumAppVersion || merged.min_app_version || merged.minAppVersion || '1.0.7'),
    minimumAppVersion: String(merged.minimum_app_version || merged.minimumAppVersion || merged.min_app_version || merged.minAppVersion || '1.0.7'),
    latestAppVersion: String(merged.latest_app_version || merged.latestAppVersion || merged.app_version || merged.appVersion || merged.min_app_version || '1.0.8'),
    appVersion: String(merged.latest_app_version || merged.latestAppVersion || merged.app_version || merged.appVersion || '1.0.8'),
    updateMessage: String(merged.update_message || merged.updateMessage || ''),
    updateUrl: String(merged.update_url || merged.updateUrl || ''),
    isForceUpdate: Boolean(merged.is_force_update !== undefined ? merged.is_force_update : (merged.isForceUpdate ?? false)),
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
          let deletedIds: string[] = [];
          try {
            const delRaw = localStorage.getItem('winx7_deleted_image_ids');
            if (delRaw) deletedIds = JSON.parse(delRaw);
          } catch {}

          const getItemVal = (item: any) => {
            const raw = item.value ?? item.data ?? item.content ?? item.config ?? item.payload ?? item.json_data;
            if (raw === undefined || raw === null) return item;
            if (typeof raw === 'string') {
              try { return JSON.parse(raw); } catch { return raw; }
            }
            return raw;
          };

          const isDeleted = (idToCheck: string) => {
            if (!idToCheck) return true;
            const raw = idToCheck.replace('saved_image_', '');
            return deletedIds.includes(idToCheck) || deletedIds.includes(raw) || deletedIds.includes(`saved_image_${raw}`);
          };

          const dbImages = (data || [])
            .filter((item: any) => item.id?.startsWith('saved_image_') || item.id === 'saved_images' || item.key?.startsWith('saved_image_'))
            .map((item: any) => {
              const val = getItemVal(item);
              const cleanId = item.id?.replace('saved_image_', '') || item.key?.replace('saved_image_', '');
              if (typeof val === 'object' && val !== null) {
                if (val.deleted === true || val.is_deleted === true) return null;
                const finalId = val.id || cleanId;
                if (isDeleted(finalId)) return null;
                return { ...val, id: finalId };
              }
              if (isDeleted(cleanId)) return null;
              return { id: cleanId, url: String(val) };
            })
            .filter(Boolean);

          let localImages: any[] = [];
          try {
            const raw = localStorage.getItem('winx7_saved_images');
            if (raw) localImages = JSON.parse(raw);
          } catch {}

          const mergedMap = new Map<string, any>();
          localImages.forEach((img) => {
            if (img && img.id && !isDeleted(img.id)) {
              mergedMap.set(img.id, img);
            }
          });
          dbImages.forEach((img: any) => {
            if (img && img.id && !isDeleted(img.id)) {
              mergedMap.set(img.id, img);
            }
          });

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

        // 1. Fetch via backend API (authenticated via service role, avoiding anon RLS permission denied 42501)
        try {
          const apiRes = await fetch('/api/notifications');
          if (apiRes.ok) {
            const json = await apiRes.json();
            if (json && json.success && Array.isArray(json.data)) {
              dbNotifs = json.data.map((item: any) => normalizeNotificationDoc(item, item.id));
            }
          }
        } catch {}

        // 2. Direct client query fallback if server endpoint did not return records
        if (dbNotifs.length === 0) {
          try {
            const { data, error } = await supabase.from('notifications').select('*');
            if (!error && data) {
              dbNotifs = data.map((item: any) => normalizeNotificationDoc(item, item.id));
            }
          } catch (err) {
            // Suppress expected client-side RLS error
          }
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

        // If client-side profiles query was restricted by RLS (e.g. 0 or 1 row), query server-side admin user search endpoint
        if (profData.length <= 1) {
          try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/admin/users/search', { headers });
            if (res.ok) {
              const json = await res.json();
              if (json && json.success && Array.isArray(json.data) && json.data.length > profData.length) {
                profData = json.data;
              }
            }
          } catch (serverSearchErr) {
            console.warn('[subscribeCollection server search notice]:', serverSearchErr);
          }
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

      let normalized = data.map((item: any) => {
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

      if (tableName === 'categories') {
        // Filter out legacy accidental entries where GAME was stored as category
        const validCats = normalized.filter((c: any) => {
          const n = c?.name?.toUpperCase() || '';
          return n !== 'FREE FIRE' && n !== 'FREEFIRE' && n !== 'BGMI' && !n.includes('BATTLEGROUND');
        });

        if (validCats.length === 0) {
          normalized = [
            normalizeCategoryDoc({
              id: 'cat-survivor',
              name: 'SURVIVOR',
              description: 'Survivor & Battle Royale matches',
              is_active: true,
              display_order: 1,
              order: 1,
              sort_order: 1,
              image_url: getCategoryBannerImage('SURVIVOR'),
              banner_url: getCategoryBannerImage('SURVIVOR'),
            }),
            normalizeCategoryDoc({
              id: 'cat-arena',
              name: 'ARENA',
              description: 'Arena & TDM matches',
              is_active: true,
              display_order: 2,
              order: 2,
              sort_order: 2,
              image_url: getCategoryBannerImage('ARENA'),
              banner_url: getCategoryBannerImage('ARENA'),
            }),
            normalizeCategoryDoc({
              id: 'cat-lone-wolf',
              name: 'LONE WOLF',
              description: '1v1 & 2v2 Lone Wolf combat matches',
              is_active: true,
              display_order: 3,
              order: 3,
              sort_order: 3,
              image_url: getCategoryBannerImage('LONE WOLF'),
              banner_url: getCategoryBannerImage('LONE WOLF'),
            }),
          ];
        } else {
          normalized = validCats;
        }
      }

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
  try {
    const { data } = await supabase.from('categories').select('*');
    const list = data || [];
    const validMatchCats = list.filter((c: any) => {
      const n = c?.name?.toUpperCase() || '';
      return n !== 'FREE FIRE' && n !== 'FREEFIRE' && n !== 'BGMI' && !n.includes('BATTLEGROUND');
    });

    if (validMatchCats.length === 0) {
      await saveCategoryInSupabase({
        id: 'cat-survivor',
        name: 'SURVIVOR',
        description: 'Survivor & Battle Royale matches',
        isActive: true,
        imageUrl: getCategoryBannerImage('SURVIVOR'),
        bannerUrl: getCategoryBannerImage('SURVIVOR'),
        sortOrder: 1,
        displayOrder: 1,
        order: 1
      }, 1);

      await saveCategoryInSupabase({
        id: 'cat-arena',
        name: 'ARENA',
        description: 'Arena & TDM matches',
        isActive: true,
        imageUrl: getCategoryBannerImage('ARENA'),
        bannerUrl: getCategoryBannerImage('ARENA'),
        sortOrder: 2,
        displayOrder: 2,
        order: 2
      }, 2);

      await saveCategoryInSupabase({
        id: 'cat-lone-wolf',
        name: 'LONE WOLF',
        description: '1v1 & 2v2 Lone Wolf combat matches',
        isActive: true,
        imageUrl: getCategoryBannerImage('LONE WOLF'),
        bannerUrl: getCategoryBannerImage('LONE WOLF'),
        sortOrder: 3,
        displayOrder: 3,
        order: 3
      }, 3);
    }
  } catch (err: any) {
    console.warn('[seedInitialFirestoreDataIfEmpty] Category seeding check:', err?.message || err);
  }
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
      console.error(`[Supabase ${tableName}] Permission or RLS policy failure (${result.error.code}):`, result.error.message);
      handleSupabaseError(result.error, `${mode} ${tableName}`);
      throw result.error;
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
        if (tableName === 'tournaments' && match[1] === 'match_id') {
          handleSupabaseError(result.error, `${mode} ${tableName}`);
          throw result.error;
        }
        console.warn(`[Supabase ${tableName}] Column '${match[1]}' not in schema cache, omitting and retrying...`);
        delete currentPayload[match[1]];
        continue;
      }
    }

    handleSupabaseError(result.error, `${mode} ${tableName}`);
    throw result.error;
  }
}

/**
 * Acquire the next sequential Match ID from the authoritative database sequence generator
 */
export async function fetchAuthoritativeNextMatchId(matchTime?: string, matchDate?: string): Promise<string | null> {
  // 1. Try direct Supabase RPC invocation
  try {
    const { data, error } = await supabase.rpc('generate_next_match_id', {
      p_match_time: matchTime || null,
      p_match_date: matchDate || null,
      p_created_at: new Date().toISOString()
    });
    if (!error && data && typeof data === 'string' && /^WX7-\d{4}-\d{3,}$/i.test(data.trim())) {
      console.log('[Authoritative Match ID] Acquired via Supabase RPC:', data.trim());
      return data.trim();
    }
  } catch (rpcErr) {
    console.warn('[Authoritative Match ID] Supabase RPC call note:', rpcErr);
  }

  // 2. Fallback to server endpoint calling public.generate_next_match_id via service_role
  try {
    const res = await fetch('/api/tournaments/generate-match-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchTime: matchTime || null,
        matchDate: matchDate || null,
        createdAt: new Date().toISOString()
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.matchId && /^WX7-\d{4}-\d{3,}$/i.test(json.matchId.trim())) {
        console.log('[Authoritative Match ID] Acquired via backend sequence endpoint:', json.matchId.trim());
        return json.matchId.trim();
      }
    }
  } catch (srvErr) {
    console.warn('[Authoritative Match ID] Backend sequence endpoint note:', srvErr);
  }

  return null;
}

// Tournament CRUD
export async function createTournamentInSupabase(
  tournament: Tournament,
  categoriesList?: MatchCategory[]
): Promise<string> {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const id = (tournament.id && isUuid(tournament.id)) ? tournament.id : crypto.randomUUID();
  tournament.id = id;

  const isGameBgmi = 
    (tournament.game || '').toUpperCase() === 'BGMI' || 
    (tournament.game || '').toUpperCase().includes('BATTLEGROUND') || 
    (tournament.game || '').toUpperCase() === 'PUBG' ||
    (tournament.title || '').toUpperCase().includes('BGMI') ||
    (tournament.title || '').toUpperCase().includes('BATTLEGROUND') ||
    (tournament.title || '').toUpperCase().includes('PUBG') ||
    (tournament.category || '').toUpperCase() === 'BGMI' ||
    (tournament.matchCategory || '').toUpperCase() === 'BGMI' ||
    ((tournament as any).category_name || '').toUpperCase() === 'BGMI' ||
    ((tournament as any).game_name || '').toUpperCase() === 'BGMI' ||
    ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes((tournament.map || '').toUpperCase()) ||
    (tournament.matchType || '').toUpperCase().includes('TDM') ||
    (tournament.matchType || '').toUpperCase().includes('ULTIMATE ROYALE') ||
    Number(tournament.maxParticipants || tournament.maxSlots) === 100;
  const gameVal = isGameBgmi ? 'BGMI' : 'FREE FIRE';
  const matchCatVal = tournament.matchCategory || tournament.category || 'SURVIVOR';
  const modeVal = tournament.matchType || 'Solo';
  const mapVal = tournament.map || (isGameBgmi ? 'Erangel' : 'Bermuda');
  const maxVal = Number(tournament.maxParticipants || tournament.maxSlots || (isGameBgmi ? 100 : 48));
  const joinedVal = Number(tournament.joinedParticipants || tournament.filledSlots || 0);
  const killVal = Number(tournament.perKillPrize || tournament.perKillReward || 0);
  const schedVal = tournament.matchSchedule || tournament.schedule || tournament.startTime || new Date().toISOString();

  const dtInfo = getMatchDateTimeStrings(schedVal, (tournament as any).matchDate || (tournament as any).match_date);
  const matchDateStr = (tournament as any).matchDate || (tournament as any).match_date || dtInfo.matchDate;

  // Determine Match ID: If valid format already supplied, preserve it.
  // Otherwise, fetch the next sequence ID from the database sequence generator.
  let matchId = normalizePublicMatchId(tournament.matchId || (tournament as any).match_id);
  if (matchId && !/^WX7-\d{4}-\d{3,}$/i.test(matchId)) {
    matchId = normalizePublicMatchId(matchId);
  }
  if (!matchId || !/^WX7-\d{4}-\d{3,}$/i.test(matchId)) {
    const nextSeqId = await fetchAuthoritativeNextMatchId(schedVal, matchDateStr);
    if (nextSeqId) {
      matchId = nextSeqId;
    }
  }

  // Resolve clean image URL for banner and thumbnail (safe for mobile User App Image.network)
  let bannerImg = tournament.bannerUrl || (tournament as any).thumbnailUrl || (tournament as any).imageUrl;
  if (!bannerImg || typeof bannerImg !== 'string' || !bannerImg.trim() || bannerImg.trim() === 'N/A') {
    bannerImg = getCategoryBannerImage(matchCatVal) || getCategoryBannerImage(gameVal);
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
      prize: amountVal,
    };
  });

  const requiresAccessCodeVal = Boolean(
    tournament.requireAccessCode ??
    tournament.requiresAccessCode ??
    tournament.requires_access_code ??
    tournament.require_access_code ??
    tournament.isPrivate ??
    (tournament as any).is_private ??
    false
  );

  const accessCodeVal = requiresAccessCodeVal ? (
    (tournament.accessCode && String(tournament.accessCode).trim().length > 0)
      ? String(tournament.accessCode).trim()
      : ((tournament as any).access_code && String((tournament as any).access_code).trim().length > 0)
        ? String((tournament as any).access_code).trim()
        : ('WINX7-' + Math.random().toString(36).substring(2, 8).toUpperCase())
  ) : null;

  // EXPLICIT CLEAN PAYLOAD ONLY CONTAINING ACTUAL DATABASE COLUMNS IN public.tournaments
  const payload: Record<string, any> = cleanUndefined({
    id,
    match_id: matchId || undefined,
    title: (tournament.title || 'Untitled Tournament').toUpperCase(),
    category_id: tournament.categoryId || null,
    category_name: matchCatVal,
    game_category: gameVal,
    banner_url: bannerImg,
    thumbnail_url: bannerImg,
    image_url: bannerImg,
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
    is_private: requiresAccessCodeVal,
    room_id: tournament.roomId || '',
    room_password: tournament.roomPassword || '',
    requires_access_code: requiresAccessCodeVal,
    access_code: accessCodeVal,
    rules: Array.isArray(tournament.rules) ? tournament.rules.join('\n') : String(tournament.rules || ''),
    description: `Compete in ${gameVal} and win instant wallet rewards!`,
    participants: Array.isArray(tournament.participants) ? tournament.participants : [],
    prize_distribution: normalizedPrizeDist,
    winner_note: JSON.stringify({
      game: gameVal,
      match_category: matchCatVal,
      access_code: accessCodeVal,
      requires_access_code: requiresAccessCodeVal
    }),
    created_at: tournament.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('[createTournamentInSupabase] Executing write with clean schema columns for tournament:', id);

  try {
    await ensureSupabaseAuthSession();
    const writeResult = await safeSupabaseWrite('tournaments', payload, 'upsert');
    if (writeResult && writeResult.error) {
      throw writeResult.error;
    }

    // MANDATORY READ-BACK VERIFICATION
    const { data: dbCheck, error: checkErr } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();

    if (checkErr || !dbCheck) {
      console.error('[createTournamentInSupabase] Read-back verification failed:', checkErr);
      throw new Error(`Tournament was written, but verification read-back from the database failed: ${checkErr?.message || 'Row not found'}`);
    }

    if (!dbCheck.match_id) {
      console.error('[createTournamentInSupabase] Tournament row exists but match_id is missing:', dbCheck);
      throw new Error('Tournament was saved, but no Match ID was assigned by the database trigger.');
    }

    console.log('[Supabase Tournament Created & Verified]:', { id: dbCheck.id, match_id: dbCheck.match_id, title: dbCheck.title });
    const normalized = normalizeTournamentDoc(dbCheck, id);
    updateLocalTournamentCache(id, normalized);

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
  
  const isGameBgmi = 
    ((updates.game || '').toUpperCase() === 'BGMI') || 
    ((updates.game || '').toUpperCase().includes('BATTLEGROUND')) || 
    ((updates.game || '').toUpperCase() === 'PUBG') ||
    ((updates.title || '').toUpperCase().includes('BGMI')) ||
    ((updates.title || '').toUpperCase().includes('BATTLEGROUND')) ||
    ((updates.title || '').toUpperCase().includes('PUBG')) ||
    ((updates.category || '') as string).toUpperCase() === 'BGMI' ||
    ((updates.matchCategory || '') as string).toUpperCase() === 'BGMI' ||
    ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes(((updates.map || '') as string).toUpperCase()) ||
    ((updates.matchType || '') as string).toUpperCase().includes('TDM') ||
    ((updates.matchType || '') as string).toUpperCase().includes('ULTIMATE ROYALE') ||
    Number(updates.maxParticipants || updates.maxSlots) === 100;

  const gameVal = isGameBgmi ? 'BGMI' : (updates.game ? 'FREE FIRE' : undefined);
  const matchCatVal = updates.matchCategory || updates.category;
  const modeVal = updates.matchType;
  const mapVal = updates.map;
  const maxVal = updates.maxParticipants !== undefined ? Number(updates.maxParticipants) : updates.maxSlots !== undefined ? Number(updates.maxSlots) : undefined;
  const joinedVal = updates.joinedParticipants !== undefined ? Number(updates.joinedParticipants) : updates.filledSlots !== undefined ? Number(updates.filledSlots) : undefined;
  const killVal = updates.perKillPrize !== undefined ? Number(updates.perKillPrize) : updates.perKillReward !== undefined ? Number(updates.perKillReward) : undefined;
  const schedVal = updates.startTime || updates.match_time || updates.matchSchedule || updates.schedule;

  let matchDateStr: string | undefined = undefined;
  let dtInfoForCache: any = undefined;
  if (schedVal) {
    dtInfoForCache = getMatchDateTimeStrings(schedVal, (updates as any).matchDate || (updates as any).match_date);
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
        prize: amountVal,
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
  const finalMetaGame = gameVal || updates.game;
  const finalMetaCategory = matchCatVal || updates.matchCategory || updates.category;
  if (finalMetaGame || finalMetaCategory || requiresAccessCodeUpdate !== undefined) {
    winnerNoteUpdate = JSON.stringify({
      game: finalMetaGame,
      match_category: finalMetaCategory,
      access_code: accessCodeUpdate || null,
      requires_access_code: Boolean(requiresAccessCodeUpdate)
    });
  } else if ((updates as any).winner_note !== undefined || (updates as any).winnerNote !== undefined) {
    winnerNoteUpdate = (updates as any).winner_note ?? (updates as any).winnerNote;
  }

  // CLEAN UPDATE PAYLOAD WITH ONLY VALID DATABASE COLUMNS
  const payload: Record<string, any> = cleanUndefined({
    match_id: updates.matchId || (updates as any).match_id || undefined,
    title: updates.title ? String(updates.title).toUpperCase() : undefined,
    game_category: gameVal || updates.game || (updates as any).gameCategory || (updates as any).game_category,
    category_id: updates.categoryId,
    category_name: matchCatVal,
    banner_url: bannerImg,
    thumbnail_url: bannerImg,
    image_url: bannerImg,
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
  const isSuspended = ['suspended', 'blocked', 'banned'].includes(String(status).toLowerCase());
  const finalReason = banReason || (isSuspended ? 'Account suspended by administrator' : '');

  // 1. Primary: Server-side secure admin update (updates profiles and Supabase Auth with service role)
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/users/update-status', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        status: isSuspended ? 'SUSPENDED' : 'ACTIVE',
        isSuspended,
        reason: finalReason,
      }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.message || result.error || 'Server rejected status update');
    }
    return;
  } catch (apiErr: any) {
    console.warn('[updateUserStatusInSupabase] Backend API notice, falling back to direct DB write:', apiErr?.message || apiErr);
  }

  // 2. Direct client fallback
  const payload = cleanUndefined({
    status: isSuspended ? 'SUSPENDED' : 'ACTIVE',
    is_suspended: isSuspended,
    is_banned: status === 'banned',
    is_blocked: isSuspended,
    ban_reason: finalReason,
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
  const ffIgnVal = updates.ffIgn !== undefined ? updates.ffIgn : (updates as any).ff_ign !== undefined ? (updates as any).ff_ign : (updates.inGameName !== undefined ? updates.inGameName : (currentProfile?.ff_ign || currentProfile?.in_game_name));
  const ffUidVal = updates.ffUid !== undefined ? updates.ffUid : (updates as any).ff_uid !== undefined ? (updates as any).ff_uid : (updates.inGameId !== undefined ? updates.inGameId : (currentProfile?.ff_uid || currentProfile?.in_game_id));
  const bgmiIgnVal = updates.bgmiIgn !== undefined ? updates.bgmiIgn : (updates as any).bgmi_ign !== undefined ? (updates as any).bgmi_ign : currentProfile?.bgmi_ign;
  const bgmiUidVal = updates.bgmiUid !== undefined ? updates.bgmiUid : (updates as any).bgmi_uid !== undefined ? (updates as any).bgmi_uid : currentProfile?.bgmi_uid;
  const depositVal = updates.walletBalance !== undefined ? Number(updates.walletBalance) : undefined;
  const winningVal = updates.winningBalance !== undefined ? Number(updates.winningBalance) : undefined;

  // Authoritative suspension check: Ensure profile updates or syncs NEVER inadvertently lift suspension
  const isSuspendedInDb = Boolean(
    currentProfile?.is_suspended ??
    currentProfile?.isSuspended ??
    String(currentProfile?.status || '').toLowerCase() === 'suspended'
  );
  const existingBanReason = currentProfile?.ban_reason || currentProfile?.banReason || '';
  const existingIsBlocked = Boolean(currentProfile?.is_blocked ?? currentProfile?.isBlocked);

  // If user is currently suspended in database, status MUST stay 'suspended' and is_suspended MUST stay true
  const finalStatus = isSuspendedInDb ? 'suspended' : (updates.status || currentProfile?.status || 'active');
  const finalIsSuspended = isSuspendedInDb ? true : Boolean(updates.is_suspended ?? updates.isSuspended ?? false);
  const finalBanReason = isSuspendedInDb ? (updates.banReason || existingBanReason) : updates.banReason;

  const payload: Record<string, any> = cleanUndefined({
    id: userId,
    name: nameVal,
    username: usernameVal,
    display_name: nameVal,
    email: updates.email || currentProfile?.email,
    phone: finalPhone,
    phone_number: finalPhone,
    mobile: finalPhone,
    ff_ign: ffIgnVal,
    free_fire_ign: ffIgnVal,
    in_game_name: ffIgnVal,
    ff_uid: ffUidVal,
    free_fire_uid: ffUidVal,
    in_game_id: ffUidVal,
    bgmi_ign: bgmiIgnVal,
    bgmi_uid: bgmiUidVal,
    avatar_id: newAvatarId,
    avatar_url: newAvatarUrl,
    deposit_balance: depositVal,
    wallet_balance: depositVal,
    winning_balance: winningVal,
    status: finalStatus,
    is_suspended: finalIsSuspended,
    is_blocked: existingIsBlocked,
    ban_reason: finalBanReason,
    ...(usernameChanged ? { last_username_change_at: nowIso } : {}),
    ...(ignChanged ? { last_ign_change_at: nowIso } : {}),
    ...(uidChanged ? { last_uid_change_at: nowIso } : {}),
    ...(avatarChanged ? { last_avatar_change_at: nowIso } : {}),
    updated_at: nowIso,
  });

  try {
    // Prefer update over upsert since profiles row already exists and INSERT requires elevated permissions
    const { data: updatedDoc, error: saveErr } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (saveErr) {
      console.warn('[updateUserProfileInSupabase direct update notice]:', saveErr.message);
      await safeSupabaseWrite('profiles', payload, 'update', userId);
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
  const banner = category.bannerUrl || category.imageUrl || getCategoryBannerImage(category.name);
  const image = category.imageUrl || category.bannerUrl || getCategoryBannerImage(category.name);
  const orderVal = index !== undefined ? index : category.displayOrder ?? category.sortOrder ?? category.order ?? 0;

  const payload = cleanUndefined({
    id,
    name: category.name,
    description: category.description || null,
    is_active: category.isActive ?? true,
    image_url: image,
    banner_url: banner,
    display_order: orderVal,
    sort_order: orderVal,
    created_at: category.createdAt || new Date().toISOString(),
  });

  await safeSupabaseWrite('categories', payload, 'upsert');

  // Also sync to app_config for client mobile apps and caches
  try {
    const { data: allCats } = await supabase.from('categories').select('*');
    if (allCats && allCats.length > 0) {
      await upsertAppConfig('categories', allCats, 'syncCategoriesConfig');
      await upsertAppConfig('match_categories', allCats, 'syncMatchCategoriesConfig');
    }
  } catch (e) {
    console.warn('[saveCategoryInSupabase] app_config sync warning:', e);
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

  // 1. Remove from deleted blacklist if previously deleted
  try {
    const delRaw = localStorage.getItem('winx7_deleted_image_ids');
    if (delRaw) {
      const deletedList: string[] = JSON.parse(delRaw);
      const filtered = deletedList.filter((d) => d !== id && d !== `saved_image_${id}` && d !== id.replace('saved_image_', ''));
      localStorage.setItem('winx7_deleted_image_ids', JSON.stringify(filtered));
    }
  } catch {}

  // 2. Save to localStorage cache immediately
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

  // 3. Sync to Supabase app_config
  await upsertAppConfig(`saved_image_${id}`, cleanImage, 'saveSavedImageInSupabase');
}

export async function deleteSavedImageFromSupabase(imageId: string, storagePathOrUrl?: string): Promise<void> {
  const rawId = imageId.replace('saved_image_', '');
  const cleanId = `saved_image_${rawId}`;

  // 1. Record into deleted blacklist so it is never re-merged from dbImages or localStorage
  try {
    const deletedRaw = localStorage.getItem('winx7_deleted_image_ids');
    const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
    const toAdd = [rawId, cleanId, imageId];
    toAdd.forEach((idToAdd) => {
      if (idToAdd && !deletedList.includes(idToAdd)) {
        deletedList.push(idToAdd);
      }
    });
    localStorage.setItem('winx7_deleted_image_ids', JSON.stringify(deletedList));
  } catch (blackListErr) {
    console.warn('[LocalStorage SavedImage] Blacklist warning:', blackListErr);
  }

  let fileUrlOrPath = storagePathOrUrl;

  // 2. Remove from localStorage cache and locate file URL if not provided
  try {
    const existingRaw = localStorage.getItem('winx7_saved_images');
    if (existingRaw) {
      const existing: SavedImage[] = JSON.parse(existingRaw);
      const matched = existing.find((img) => img.id === rawId || img.id === cleanId || img.id === imageId);
      if (matched && !fileUrlOrPath) {
        fileUrlOrPath = matched.storagePath || matched.url;
      }
      const filtered = existing.filter((img) => img.id !== rawId && img.id !== cleanId && img.id !== imageId);
      localStorage.setItem('winx7_saved_images', JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn('[LocalStorage SavedImage] Delete warning:', err);
  }

  // 3. Delete file from Supabase Storage
  if (fileUrlOrPath) {
    try {
      await deleteFromStorage(fileUrlOrPath, 'match-cards');
    } catch (storageErr) {
      console.warn('[Supabase Storage] File delete notice:', storageErr);
    }
  }

  // 4. Remove and mark deleted in Supabase app_config
  try {
    await supabase.from('app_config').delete().in('id', [cleanId, rawId, imageId]);
    await upsertAppConfig(cleanId, { id: cleanId, deleted: true, is_deleted: true }, 'markSavedImageDeleted');
  } catch (err) {
    console.warn('[Supabase Delete Saved Image] Notice:', err);
  }
}

// System Settings in app_config table
export async function saveSystemSettingsInSupabase(settings: SystemSettings): Promise<void> {
  await ensureSupabaseAuthSession();

  // Enforce staff restriction: Staff accounts are strictly forbidden from modifying system & version settings
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = String(profile?.role || '').toLowerCase();
      if (role === 'staff') {
        throw new Error('Access Denied: Staff accounts do not have permission to modify app version or system configurations.');
      }
    }
  } catch (authErr: any) {
    if (authErr?.message?.includes('Access Denied')) {
      throw authErr;
    }
  }
  
  // 1. Save full settings object to localStorage for instant local reactivity
  try {
    localStorage.setItem('winx7_system_settings', JSON.stringify(settings));
  } catch {}

  const now = new Date().toISOString();

  // 2. Discover existing columns and existing json_data in public.app_config for id = 'general'
  let existingColumns: Set<string> | null = null;
  let existingJsonData: Record<string, any> = {};
  try {
    const { data: generalRow } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 'general')
      .maybeSingle();

    if (generalRow) {
      existingColumns = new Set(Object.keys(generalRow));
      if (generalRow.json_data && typeof generalRow.json_data === 'object' && !Array.isArray(generalRow.json_data)) {
        existingJsonData = { ...generalRow.json_data };
      }
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

  // Version fields for Android User App
  const minVer = String(settings.minimumAppVersion || settings.minAppVersion || '1.0.7').trim();
  const latestVer = String(settings.latestAppVersion || settings.appVersion || minVer || '1.0.8').trim();
  const updMsg = String(settings.updateMessage || '').trim();
  const updUrl = String(settings.updateUrl || '').trim();
  const forceUpd = Boolean(settings.isForceUpdate);

  const updatedJsonData = {
    ...existingJsonData,
    latest_app_version: latestVer,
    minimum_app_version: minVer,
    min_app_version: minVer,
    update_message: updMsg,
    update_url: updUrl,
    is_force_update: forceUpd,
  };

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
    min_app_version: minVer,
    minimum_app_version: minVer,
    latest_app_version: latestVer,
    update_message: updMsg,
    update_url: updUrl,
    is_force_update: forceUpd,
    json_data: updatedJsonData,
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
    min_app_version: verifiedRow.min_app_version,
    latest_app_version: verifiedRow.json_data?.latest_app_version || verifiedRow.latest_app_version,
    minimum_app_version: verifiedRow.json_data?.minimum_app_version || verifiedRow.minimum_app_version,
    is_force_update: verifiedRow.json_data?.is_force_update,
    update_url: verifiedRow.json_data?.update_url,
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

  // Validate target user ID: must be a valid UUID in PostgreSQL uuid column, otherwise null (broadcast)
  const candidateUser = notification.targetUserId || notification.userId;
  const validUserId = (candidateUser && isUuid(candidateUser)) ? candidateUser : null;

  // Exact Supabase notifications table schema:
  // [id, user_id, title, message, type, is_read, created_at]
  const payload = {
    id,
    user_id: validUserId,
    title: notification.title || 'Notification',
    message: notification.message || '',
    type: notification.type || 'system',
    is_read: false,
    created_at: notification.createdAt || notification.sentAt || new Date().toISOString(),
  };

  // 1. Try persisting via backend endpoint (authenticated with service role, bypassing RLS 42501)
  try {
    const apiRes = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (apiRes.ok) {
      return;
    }
  } catch {}

  // 2. Direct client fallback using clean schema
  try {
    await safeSupabaseWrite('notifications', payload, 'upsert');
  } catch {}
}

export async function updateNotificationReadState(id: string, isRead: boolean): Promise<void> {
  updateLocalNotificationCache(id, { isRead });
  try {
    const validId = isUuid(id) ? id : null;
    if (validId) {
      // 1. Try backend endpoint
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: validId, is_read: isRead }),
        });
      } catch {}

      // 2. Direct client fallback
      await safeSupabaseWrite('notifications', { is_read: isRead }, 'update', validId);
    }
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
  const nameVal = doc.name || doc.staff_name || doc.display_name || doc.displayName || profile.name || profile.display_name || profile.username || 'Staff Member';
  const emailVal = doc.email || doc.user_email || profile.email || '';
  const phoneVal = doc.phone || doc.user_phone || profile.phone || '';
  
  // Handle game specific IGNs from profile or RPC fields
  const ffIgnVal = doc.ff_ign || doc.user_ff_ign || doc.ffIgn || doc.in_game_name || doc.inGameName || profile.ff_ign || profile.in_game_name || '';
  const bgmiIgnVal = doc.bgmi_ign || doc.user_bgmi_ign || doc.bgmiIgn || profile.bgmi_ign || '';

  // Extract game assignment directly from public.staff_members authoritative source
  const rawAssigned = doc.assigned_game !== undefined ? doc.assigned_game : (doc.assignedGame !== undefined ? doc.assignedGame : (doc.game_assignment || profile.assigned_game || ''));
  let assignedGame: 'Free Fire' | 'BGMI' | string | undefined = undefined;

  if (rawAssigned && typeof rawAssigned === 'string') {
    const lower = rawAssigned.trim().toLowerCase();
    if (lower.includes('free fire') || lower === 'freefire' || lower === 'ff') {
      assignedGame = 'Free Fire';
    } else if (lower.includes('bgmi') || lower.includes('battlegrounds') || lower === 'pubg') {
      assignedGame = 'BGMI';
    } else if (lower.length > 0 && lower !== 'null' && lower !== 'undefined' && lower !== 'not assigned') {
      assignedGame = rawAssigned.trim();
    }
  }

  // Clean displayed notes by removing internal [Game: ...] tag if desired
  let cleanNotes = doc.notes || doc.admin_notes || doc.p_notes || '';
  if (cleanNotes && cleanNotes.includes('[Game:')) {
    cleanNotes = cleanNotes.replace(/\[Game:\s*[^\]]+\]\s*/gi, '').trim();
  }

  // Authoritative staff_members primary key row ID
  const staffRowId = doc.staff_member_id || doc.staff_member_row_id || doc.staffRecordId || (doc.id && doc.id !== userIdVal ? doc.id : doc.id);

  return {
    id: staffRowId || staffIdVal || crypto.randomUUID(),
    staffRecordId: staffRowId,
    staff_member_id: staffRowId,
    staffId: staffIdVal,
    staff_id: staffIdVal,
    userId: userIdVal,
    user_id: userIdVal,
    name: nameVal,
    displayName: nameVal,
    username: profile.username || nameVal,
    email: emailVal,
    phone: phoneVal,
    ffIgn: ffIgnVal,
    ff_ign: ffIgnVal,
    bgmiIgn: bgmiIgnVal,
    bgmi_ign: bgmiIgnVal,
    inGameName: ffIgnVal || bgmiIgnVal,
    avatarUrl: doc.avatar_url || doc.avatarUrl || profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    avatar_url: doc.avatar_url || doc.avatarUrl || profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'STAFF',
    status: status,
    assignedGame: assignedGame,
    assigned_game: assignedGame,
    gameAssignment: assignedGame,
    game_assignment: assignedGame,
    notes: cleanNotes,
    adminNotes: cleanNotes,
    joinedDate: doc.created_at || doc.joined_date || doc.joinedDate || new Date().toISOString(),
    created_at: doc.created_at || doc.joined_date || new Date().toISOString(),
    approvedDate: doc.approved_at || doc.approved_date || doc.created_at || new Date().toISOString(),
    approved_at: doc.approved_at || doc.approved_date || doc.created_at || new Date().toISOString(),
    updated_at: doc.updated_at || new Date().toISOString(),
  };
}

export async function fetchStaffMembersFromSupabase(): Promise<StaffMember[]> {
  try {
    await ensureSupabaseAuthSession();

    // 1. Fetch from RPC to get the joined data that bypasses RLS for profile details
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_staff_members');

    // 2. Direct query to public.staff_members table as the authoritative source for assigned_game
    const { data: staffRows, error: staffErr } = await supabase
      .from('staff_members')
      .select('*')
      .order('created_at', { ascending: false });

    if (rpcErr && staffErr) {
      console.error('[Staff] Both RPC and direct table select failed:', { rpcErr, staffErr });
      throw new Error(rpcErr.message || staffErr.message || 'Failed to fetch staff members');
    }

    const rpcList = Array.isArray(rpcData) ? rpcData : [];
    const tableList = Array.isArray(staffRows) ? staffRows : [];

    // Map by user_id for merging
    const rpcMap = new Map<string, any>();
    rpcList.forEach(r => {
      if (r.user_id) rpcMap.set(r.user_id, r);
    });

    // Merge logic: Base is the authoritative table rows (so we don't miss newly created staff)
    // and we augment with RPC data which contains profile details (name, email, phone, etc.)
    const mergedList = tableList.map((tableRow: any) => {
      const rpcRow = rpcMap.get(tableRow.user_id) || {};
      
      // Pass the merged object to normalizeStaffMemberDoc
      return normalizeStaffMemberDoc({
        ...rpcRow,          // RPC fields (staff_name, user_email, user_ff_ign, etc.)
        ...tableRow,        // Table fields (assigned_game, status, created_at, id) override
        id: tableRow.id,    // Always use the table's UUID for updates
        staff_member_id: tableRow.id,
        staffRecordId: tableRow.id
      });
    });

    // If there are any RPC records that somehow aren't in the table list, add them as well
    const tableUserIds = new Set(tableList.map(r => r.user_id).filter(Boolean));
    rpcList.forEach((rpcRow: any) => {
      if (rpcRow.user_id && !tableUserIds.has(rpcRow.user_id)) {
        mergedList.push(normalizeStaffMemberDoc(rpcRow));
      }
    });

    return mergedList;
  } catch (err: any) {
    console.error('fetchStaffMembersFromSupabase error:', err);
    throw new Error(formatStaffError(err));
  }
}

export async function createStaffMemberInSupabase(
  userId: string,
  notes?: string,
  assignedGame?: 'Free Fire' | 'BGMI' | string
): Promise<{ success: boolean; staffId?: string; error?: string; data?: any }> {
  // Embed the game tag in notes for robust persistence across all RPC versions & databases
  const gameTag = assignedGame ? `[Game: ${assignedGame}]` : '';
  const fullNotes = notes ? (gameTag ? `${gameTag} ${notes}` : notes) : (gameTag || '');

  try {
    let rpcRes: any = null;

    // 1. Try with p_assigned_game first
    try {
      const res1 = await supabase.rpc('create_staff_member', {
        p_user_id: userId,
        p_notes: fullNotes,
        p_assigned_game: assignedGame || 'Free Fire'
      });
      if (!res1.error) {
        rpcRes = res1.data;
      } else if (
        res1.error.code === '23505' ||
        /already exists|duplicate key|unique constraint/i.test(res1.error.message || res1.error.details || '')
      ) {
        throw res1.error;
      }
    } catch (e: any) {
      if (
        e?.code === '23505' ||
        /already exists|duplicate key|unique constraint/i.test(e?.message || e?.details || '')
      ) {
        throw e;
      }
      // ignore other RPC resolution errors and try fallback
    }

    // 2. Fallback to standard 2-param RPC
    if (!rpcRes) {
      const res2 = await supabase.rpc('create_staff_member', {
        p_user_id: userId,
        p_notes: fullNotes
      });
      if (res2.error) {
        throw res2.error;
      }
      rpcRes = res2.data;
    }

    let generatedStaffId = '';
    if (typeof rpcRes === 'string') {
      generatedStaffId = rpcRes;
    } else if (rpcRes && typeof rpcRes === 'object') {
      generatedStaffId = rpcRes.staff_id || rpcRes.staffId || rpcRes.id || '';
    }

    // 3. Update staff_members and profiles table with assigned_game for immediate persistence
    if (assignedGame) {
      try {
        if (generatedStaffId) {
          await supabase.from('staff_members').update({
            assigned_game: assignedGame,
            notes: fullNotes
          }).or(`staff_id.eq.${generatedStaffId},staff_code.eq.${generatedStaffId}`);
        }
        await supabase.from('staff_members').update({
          assigned_game: assignedGame,
          notes: fullNotes
        }).eq('user_id', userId);

        await supabase.from('profiles').update({
          assigned_game: assignedGame
        }).eq('id', userId);
      } catch (tableUpdateErr) {
        console.debug('[createStaffMemberInSupabase] Table update notice:', tableUpdateErr);
      }

      // Save to localStorage cache as well
      try {
        if (generatedStaffId) localStorage.setItem(`staff_game_assignment_${generatedStaffId}`, assignedGame);
        if (userId) localStorage.setItem(`staff_game_assignment_${userId}`, assignedGame);
      } catch {
        // ignore
      }
    }

    return { success: true, staffId: generatedStaffId, data: rpcRes };
  } catch (err: any) {
    const isConflictError = 
      err?.code === '23505' || 
      /already exists|duplicate key|unique constraint/i.test(err?.message || err?.details || String(err));

    if (isConflictError) {
      console.log('[createStaffMemberInSupabase] Conflict detected on user_id, reactivating existing staff member...');
      
      // 1. Try to fetch the existing staff_id
      let resolvedStaffId = '';
      try {
        const { data: existingRecords } = await supabase
          .from('staff_members')
          .select('id, staff_id, staff_code')
          .eq('user_id', userId)
          .limit(1);
        if (existingRecords && existingRecords[0]) {
          resolvedStaffId = existingRecords[0].staff_id || existingRecords[0].staff_code || existingRecords[0].id || '';
        }
      } catch (selectErr) {
        console.debug('[createStaffMemberInSupabase] Fetch existing staff row failed:', selectErr);
      }

      // 2. Perform direct table updates to reactivate
      try {
        await supabase.from('profiles').update({
          role: 'STAFF',
          assigned_game: assignedGame || 'Free Fire',
          updated_at: new Date().toISOString()
        }).eq('id', userId);

        await supabase.from('staff_members').update({
          status: 'ACTIVE',
          assigned_game: assignedGame || 'Free Fire',
          notes: fullNotes,
          updated_at: new Date().toISOString()
        }).eq('user_id', userId);
        
        console.log('[createStaffMemberInSupabase] Successfully reactivated existing staff:', resolvedStaffId || userId);
        return { success: true, staffId: resolvedStaffId || 'WX7-STF-RE', data: { user_id: userId } };
      } catch (updateErr: any) {
        console.error('[createStaffMemberInSupabase] Direct update reactivation failed:', updateErr);
        return { success: false, error: formatStaffError(updateErr) };
      }
    }

    return { success: false, error: formatStaffError(err) };
  }
}

export async function updateStaffMemberGameAssignmentInSupabase(
  staffId: string,
  assignedGame: 'Free Fire' | 'BGMI' | string,
  extra?: { id?: string; userId?: string; staffCode?: string; currentNotes?: string }
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    await ensureSupabaseAuthSession();

    // Resolve authoritative staff_members.id (Primary Key UUID of public.staff_members)
    // Requirement 5: Make sure "staffId" is the "staff_members.id", NOT the user_id and NOT the staff_id text.
    let targetStaffRowId = extra?.id || staffId;
    const staffCode = extra?.staffCode || (!UUID_REGEX.test(staffId) ? staffId : undefined);
    const userId = extra?.userId;

    if (!targetStaffRowId || !UUID_REGEX.test(targetStaffRowId) || (userId && targetStaffRowId === userId)) {
      try {
        let lookupQuery = supabase.from('staff_members').select('id, user_id, staff_id');
        if (staffCode) {
          lookupQuery = lookupQuery.or(`staff_id.eq.${staffCode},staff_code.eq.${staffCode}`);
        } else if (userId) {
          lookupQuery = lookupQuery.eq('user_id', userId);
        }
        const { data: foundRows, error: lookupErr } = await lookupQuery.limit(1);
        if (lookupErr) {
          console.warn('[updateStaffMemberGameAssignmentInSupabase] Lookup notice:', lookupErr);
        }
        if (foundRows && foundRows[0]?.id) {
          targetStaffRowId = foundRows[0].id;
        }
      } catch (lookupEx) {
        console.warn('[updateStaffMemberGameAssignmentInSupabase] Lookup exception:', lookupEx);
      }
    }

    console.log('[updateStaffMemberGameAssignmentInSupabase] Executing update on staff_members:', {
      targetStaffRowId,
      assignedGame,
      staffCode,
      userId
    });

    // Requirement 1: supabase.from('staff_members').update({ assigned_game: selectedGame, updated_at: new Date().toISOString() }).eq('id', staffId)
    const updatePayload = {
      assigned_game: assignedGame,
      updated_at: new Date().toISOString()
    };

    const { data: updateData, error: updateError } = await supabase
      .from('staff_members')
      .update(updatePayload)
      .eq('id', targetStaffRowId)
      .select();

    console.log('[updateStaffMemberGameAssignmentInSupabase] Supabase update response:', {
      targetStaffRowId,
      assignedGame,
      data: updateData,
      error: updateError
    });

    // Requirement 2 & 3: Check returned { data, error }. If error exists, display REAL Supabase error
    if (updateError) {
      console.error('[updateStaffMemberGameAssignmentInSupabase] Database error:', updateError);
      return { success: false, error: updateError.message || updateError.details || 'Supabase error updating staff_members' };
    }

    if (!updateData || updateData.length === 0) {
      console.warn('[updateStaffMemberGameAssignmentInSupabase] 0 rows matched by id:', targetStaffRowId);
      let fallbackSuccess = false;
      let fbData: any = null;

      if (userId) {
        const { data: fbDataUser, error: fbErrUser } = await supabase
          .from('staff_members')
          .update(updatePayload)
          .eq('user_id', userId)
          .select();
        if (!fbErrUser && fbDataUser && fbDataUser.length > 0) {
          fallbackSuccess = true;
          fbData = fbDataUser;
        }
      }

      if (!fallbackSuccess && staffCode) {
        const { data: fbDataCode, error: fbErrCode } = await supabase
          .from('staff_members')
          .update(updatePayload)
          .or(`staff_id.eq.${staffCode},staff_code.eq.${staffCode}`)
          .select();
        if (!fbErrCode && fbDataCode && fbDataCode.length > 0) {
          fallbackSuccess = true;
          fbData = fbDataCode;
        }
      }

      if (!fallbackSuccess) {
        return {
          success: false,
          error: `No staff record found in public.staff_members matching ID "${targetStaffRowId}". Please verify your SUPERADMIN permissions.`
        };
      }

      // Also update profiles for consistency
      if (userId) {
        try {
          await supabase.from('profiles').update({ assigned_game: assignedGame }).eq('id', userId);
        } catch {}
      }

      return { success: true, data: fbData };
    }

    // Also update profiles for consistency
    if (userId) {
      try {
        await supabase.from('profiles').update({ assigned_game: assignedGame }).eq('id', userId);
      } catch {}
    }

    return { success: true, data: updateData };
  } catch (err: any) {
    console.error('[updateStaffMemberGameAssignmentInSupabase] Unexpected error:', err);
    return { success: false, error: err?.message || formatStaffError(err) };
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

  // Trigger ONE WINX7 🏆 result notification to all joined match participants
  try {
    const userIds = Array.isArray(results) ? results.map(r => r.user_id).filter(Boolean) : [];
    sendMatchResultNotification({
      matchId,
      userIds,
      matchTitle: `Match ${matchId}`
    }).catch(err => console.warn('[FCM Result Notification trigger warning]:', err));
  } catch (notifErr) {
    console.warn('[FCM Result Notification trigger error]:', notifErr);
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
  let requests: ResultRequest[] = [];

  // 1. Get authenticated user and profile role for diagnostics and role checks
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let profileRole: string | null = null;
  if (authUser?.id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();
    profileRole = prof?.role || null;
  }

  // 2. Fetch tournaments map for relationship fallback & fast lookups
  let tournamentsMap = new Map<string, any>();
  try {
    const { data: tournsData } = await supabase
      .from('tournaments')
      .select('id, match_id, title, game_category, status, map_name, mode, entry_fee, prize_pool, kill_reward, total_slots, joined_slots, match_time, match_date');
    if (tournsData && Array.isArray(tournsData)) {
      tournsData.forEach((t: any) => {
        if (t.id) tournamentsMap.set(String(t.id).toLowerCase(), t);
        if (t.match_id) tournamentsMap.set(String(t.match_id).toLowerCase(), t);
      });
    }
  } catch (tErr) {
    console.warn('[Supabase] Could not preload tournaments for result request enrichment:', tErr);
  }

  // 3. Fetch all profiles & registrations for real participant data resolution (registrations.user_id = profiles.id)
  let profilesMap = new Map<string, any>();
  try {
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, username, name, email, phone, ff_ign, bgmi_ign, role');
    if (allProfiles && Array.isArray(allProfiles)) {
      allProfiles.forEach((p: any) => {
        if (p.id) profilesMap.set(String(p.id).toLowerCase(), p);
      });
    }
  } catch (pErr) {
    console.warn('[Supabase] Could not preload profiles:', pErr);
  }

  let registrationsMap = new Map<string, any>();
  try {
    const { data: allRegs } = await supabase
      .from('registrations')
      .select('id, tournament_id, user_id, slot_number, rank_position, kills, winnings, status');
    if (allRegs && Array.isArray(allRegs)) {
      allRegs.forEach((r: any) => {
        if (r.tournament_id && r.user_id) {
          registrationsMap.set(`${String(r.tournament_id).toLowerCase()}_${String(r.user_id).toLowerCase()}`, r);
        }
      });
    }
  } catch (rErr) {
    console.warn('[Supabase] Could not preload registrations:', rErr);
  }

  // 4. Query result_requests joining tournament relationship (result_requests.tournament_id -> tournaments.id)
  const queryStr = '*, tournaments!tournament_id(id, match_id, title, game_category, status, map_name, mode, entry_fee, prize_pool, kill_reward, total_slots, joined_slots, match_time, match_date)';
  
  const { data: tableData, error: tableErr } = await supabase
    .from('result_requests')
    .select(queryStr)
    .order('created_at', { ascending: false });

  // 5. Diagnostic Console Logs (as requested by User Requirements)
  console.log('[RESULT VERIFY] current auth user ID:', authUser?.id || 'none');
  console.log('[RESULT VERIFY] current profile role:', profileRole || 'none');
  console.log('[RESULT VERIFY] Supabase query being executed: supabase.from("result_requests").select("' + queryStr + '")');
  console.log('[RESULT VERIFY] raw data returned:', tableData);
  console.log('[RESULT VERIFY] raw error returned:', tableErr);
  console.log('[RESULT VERIFY] returned row count:', tableData?.length ?? 0);

  if (tableErr) {
    console.error('[RESULT VERIFY] Supabase query error:', tableErr);
    throw new Error(`Failed to fetch result requests: ${tableErr.message}`);
  }

  if (tableData && Array.isArray(tableData) && tableData.length > 0) {
    requests = tableData.map((row: any) => {
      const matchKey = String(row.tournament_id || row.match_id || row.matchId || '').toLowerCase();
      const tourn = row.tournaments || tournamentsMap.get(matchKey);
      const staffProfile = profilesMap.get(String(row.submitted_by || row.submitted_by_staff_id || '').toLowerCase());

      const tournamentUuid = tourn?.id || row.tournament_id || row.tournamentId || row.match_id;
      const resolvedMatchId = tourn?.match_id || row.match_id || row.matchId || tournamentUuid;
      const resolvedTitle = tourn?.title || row.match_title || row.matchTitle || 'Match Result';
      const resolvedGame = tourn?.game_category || row.game_category || row.match_category || 'BGMI';
      const resolvedType = tourn?.mode || row.match_type || row.matchType || 'Solo';
      const resolvedMap = tourn?.map_name || row.map || 'Erangel';
      const resolvedEntryFee = Number(tourn?.entry_fee ?? row.entry_fee ?? row.entryFee ?? 0);
      const resolvedPrizePool = Number(tourn?.prize_pool ?? row.prize_pool ?? row.prizePool ?? 0);
      const resolvedStatus = tourn?.status || row.match_status || row.matchStatus || 'LIVE';

      const resolvedStaffName = row.submitted_by_staff_name || staffProfile?.display_name || staffProfile?.full_name || staffProfile?.username || staffProfile?.email || (row.submitted_by ? `Staff (${String(row.submitted_by).slice(0, 8)})` : 'Staff Member');
      const resolvedStaffEmail = row.submitted_by_staff_email || staffProfile?.email;

      // Log required diagnostics per row
      console.log('[RESULT VERIFY] result_request fetched:', row.id);
      console.log('[RESULT VERIFY] result_request status:', row.status);

      // Raw submitted results array
      const rawParticipantResults = Array.isArray(row.submitted_results)
        ? row.submitted_results
        : (Array.isArray(row.participant_results) ? row.participant_results : []);

      console.log('[RESULT VERIFY] submitted_results:', rawParticipantResults);

      const isBgmiGame = Boolean(
        (resolvedGame || resolvedTitle || '').toUpperCase().includes('BGMI') ||
        (resolvedGame || resolvedTitle || '').toUpperCase().includes('BATTLEGROUND') ||
        (resolvedGame || resolvedTitle || '').toUpperCase().includes('PUBG')
      );

      // Map participant results through registrations.user_id = profiles.id
      const enrichedParticipants = rawParticipantResults.map((p: any, idx: number) => {
        const uId = (p.user_id || p.userId || p.userAuthUid || p.uid || p.id || '').toString().trim();
        const prof = profilesMap.get(uId.toLowerCase());
        const regKey = `${String(tournamentUuid).toLowerCase()}_${uId.toLowerCase()}`;
        const reg = registrationsMap.get(regKey);

        console.log('[RESULT VERIFY] resolved participant profile:', prof);

        // Game IGN resolution: BGMI -> profiles.bgmi_ign; Free Fire -> profiles.ff_ign
        // Do NOT use registrations.ff_ign as authoritative current game IGN
        const resolvedGameIgn = isBgmiGame
          ? (prof?.bgmi_ign || p.inGameName || p.gameIgn || p.ign || 'N/A')
          : (prof?.ff_ign || p.inGameName || p.gameIgn || p.ign || 'N/A');

        const resolvedUserName = prof?.name || prof?.full_name || prof?.display_name || prof?.username || p.username || p.name || 'Player';
        const resolvedUserEmail = prof?.email || p.email || 'N/A';
        const resolvedUserPhone = prof?.phone || p.phone || 'N/A';

        return {
          ...p,
          userId: uId,
          user_id: uId,
          username: resolvedUserName,
          displayName: resolvedUserName,
          name: resolvedUserName,
          email: resolvedUserEmail,
          phone: resolvedUserPhone,
          inGameName: resolvedGameIgn,
          gameIgn: resolvedGameIgn,
          rank: Number(p.rank ?? p.rank_position ?? reg?.rank_position ?? (idx + 1)),
          kills: Number(p.kills ?? reg?.kills ?? 0),
          prizeWon: Number(p.prizeWon ?? p.winnings ?? reg?.winnings ?? 0),
          slotNumber: p.slotNumber || p.slot_number || p.slot || reg?.slot_number || (idx + 1)
        };
      });

      return {
        id: row.id,
        tournamentId: tournamentUuid,
        tournament_id: tournamentUuid,
        matchId: resolvedMatchId,
        matchTitle: resolvedTitle,
        matchCategory: resolvedGame,
        matchType: resolvedType,
        map: resolvedMap,
        entryFee: resolvedEntryFee,
        prizePool: resolvedPrizePool,
        matchDateTime: row.match_date_time || row.matchDateTime || tourn?.match_time || tourn?.match_date,
        matchStatus: resolvedStatus,
        submittedByStaffId: row.submitted_by || row.submitted_by_staff_id || row.submittedByStaffId || 'Staff',
        submittedByStaffName: resolvedStaffName,
        submittedByStaffEmail: resolvedStaffEmail,
        submittedAt: row.created_at || row.submitted_at || new Date().toISOString(),
        status: (row.status || 'PENDING').toUpperCase() as ResultRequestStatus,
        participantCount: Number(row.participant_count ?? row.participantCount ?? enrichedParticipants.length),
        participantResults: enrichedParticipants,
        resultSummary: typeof row.result_summary === 'object' && row.result_summary ? row.result_summary : {},
        evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
      proofNotes: row.proof_notes || row.staff_note || row.review_note,
      rejectionReason: row.review_note || row.rejection_reason,
      rejectedAt: row.reviewed_at,
      rejectedBy: row.reviewed_by,
      approvedAt: row.reviewed_at,
      approvedBy: row.reviewed_by,
      updatedAt: row.reviewed_at || row.created_at || new Date().toISOString()
      };
    });
  }

  // Sort descending by submittedAt (created_at)
  const sortedRequests = requests.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  console.log('[RESULT VERIFY] transformed/mapped data:', sortedRequests);
  console.log('[RESULT VERIFY] final data passed to the UI:', sortedRequests);
  return sortedRequests;
}

export async function submitResultRequestToSupabase(
  payload: Omit<ResultRequest, 'id' | 'submittedAt' | 'status' | 'updatedAt'>
): Promise<{ success: boolean; request: ResultRequest }> {
  await ensureSupabaseAuthSession();
  const { matchId } = payload;
  if (!matchId) throw new Error('Match ID is required to submit a result request.');

  // 1. Fetch current requests to enforce Duplicate Prevention Guard
  const existingRequests = await fetchResultRequestsFromSupabase();
  const existingPending = existingRequests.find(r => (r.matchId === matchId || r.tournamentId === matchId) && r.status === 'PENDING');
  if (existingPending) {
    throw new Error(`A result verification request for this match (${payload.matchTitle || matchId}) is already PENDING Admin verification.`);
  }

  // Check if tournament results are already published & fetch game info
  const { data: tourn } = await supabase
    .from('tournaments')
    .select('status, results_published, game, game_category')
    .eq('id', matchId)
    .maybeSingle();

  if (tourn?.results_published || ['completed', 'finished'].includes(String(tourn?.status || '').toLowerCase())) {
    throw new Error('Results for this match are already officially published.');
  }

  const determinedGame = (tourn?.game || tourn?.game_category || (payload.matchCategory?.toUpperCase().includes('BGMI') ? 'BGMI' : 'FREE FIRE')).toUpperCase().includes('BGMI') ? 'BGMI' : 'FREE FIRE';

  const now = new Date().toISOString();
  const requestId = `rr_${matchId}_${Date.now()}`;

  const newRequest: ResultRequest = {
    ...payload,
    id: requestId,
    submittedAt: now,
    status: 'PENDING',
    updatedAt: now,
  };

  // 2. Persist to result_requests in Supabase (Do NOT pass updated_at column as it does not exist)
  const dbPayload = {
    id: requestId,
    tournament_id: matchId,
    match_id: matchId,
    match_title: payload.matchTitle,
    match_category: payload.matchCategory,
    game: determinedGame,
    game_category: determinedGame,
    match_type: payload.matchType,
    map: payload.map,
    entry_fee: payload.entryFee || 0,
    prize_pool: payload.prizePool || 0,
    match_date_time: payload.matchDateTime,
    match_status: payload.matchStatus || 'live',
    submitted_by: payload.submittedByStaffId,
    submitted_by_staff_id: payload.submittedByStaffId,
    submitted_by_staff_name: payload.submittedByStaffName,
    submitted_by_staff_email: payload.submittedByStaffEmail,
    submitted_at: now,
    status: 'PENDING',
    participant_count: payload.participantCount || payload.participantResults.length,
    submitted_results: payload.participantResults,
    participant_results: payload.participantResults,
    result_summary: payload.resultSummary,
    evidence_urls: payload.evidenceUrls || [],
    proof_notes: payload.proofNotes || ''
  };

  const { error: insertErr } = await supabase.from('result_requests').upsert(dbPayload);
  if (insertErr) {
    console.error('[Supabase] submitResultRequestToSupabase error:', insertErr);
    throw new Error(`Failed to submit result request: ${insertErr.message}`);
  }

  // 3. Update tournament state
  await supabase
    .from('tournaments')
    .update({
      result_request_status: 'PENDING',
      result_submitted_at: now,
      result_submitted_by: payload.submittedByStaffName
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

  // 1. Backend Security Check (Requirement #7 & #12)
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
    throw new Error('No valid registered player IDs found in submission. Please verify player accounts.');
  }

  // 4. Call authoritative review_result_request RPC
  const adminNote = 'Approved and published by Admin';
  const { data: revData, error: revErr } = await supabase.rpc('review_result_request', {
    p_request_id: request.id,
    p_approved: true,
    p_review_note: adminNote
  });
  
  console.log('[Supabase] review_result_request approve response:', { data: revData, error: revErr });

  if (revErr) {
    throw new Error(`Approval RPC failed: ${revErr.message}`);
  }

  // 5. Call authoritative publish_match_results RPC
  const { data: pubData, error: pubErr } = await supabase.rpc('publish_match_results', {
    p_request_id: request.id
  });

  console.log('[Supabase] publish_match_results response:', { data: pubData, error: pubErr });
  
  if (pubErr) {
    console.warn(`[Supabase] Publish RPC failed: ${pubErr.message}`);
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
      payload: { matchId: request.matchId, requestId: request.id, status: 'APPROVED' }
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

  // 2. Call review_result_request RPC
  const rejectionNote = rejectionReason.trim();
  const { data: revData, error: revErr } = await supabase.rpc('review_result_request', {
    p_request_id: request.id,
    p_approved: false,
    p_review_note: rejectionNote
  });

  console.log('[Supabase] review_result_request rejection response:', { data: revData, error: revErr });

  if (revErr) {
    throw new Error(`Rejection RPC failed: ${revErr.message}`);
  }

  // 3. Update tournament metadata to allow Staff correction & resubmission
  const now = new Date().toISOString();
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
      payload: { matchId: request.matchId, requestId: request.id, status: 'REJECTED', rejectionReason: rejectionReason.trim() }
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

// =================================================================
// SUPPORT WEB APP ACCESS CONFIGURATION: STAFF & CATEGORIES
// =================================================================

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  } catch {}
  return headers;
}

export async function fetchSupportStaffMembersFromSupabase(): Promise<SupportStaffMember[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/support/staff', { headers });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('[fetchSupportStaffMembersFromSupabase API error]', err);
  }

  // Client-side direct fallback: Query public.support_staff
  try {
    const { data: staffRows, error } = await supabase
      .from('support_staff')
      .select('*');

    if (!error && staffRows && staffRows.length > 0) {
      const uIds = staffRows.map((r: any) => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('*').in('id', uIds);
      const pMap = new Map((profs || []).map((p: any) => [p.id, p]));

      return staffRows.map((r: any) => {
        const p: any = pMap.get(r.user_id) || {};
        const winxIgn = p.in_game_name || p.ff_ign || p.bgmi_ign || p.ign || '';
        const winxUsername = p.username || '';
        const winxName = p.name || p.username || winxIgn || (p.email ? p.email.split('@')[0] : 'Support Staff');
        return {
          id: r.id || `staff_${r.user_id}`,
          userId: r.user_id,
          name: winxName,
          email: p.email || '',
          username: winxUsername,
          inGameName: winxIgn,
          inGameId: p.in_game_id || p.ff_uid || p.bgmi_uid || '',
          avatarUrl: p.avatar_url || '',
          role: 'SUPPORT STAFF' as const,
          status: (r.status || 'ACTIVE').toUpperCase() === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          assignedBy: r.assigned_by || null,
          createdAt: r.assigned_at || r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || new Date().toISOString()
        };
      });
    }
  } catch {}

  // Fallback to app_config
  try {
    const { data: cfg } = await supabase.from('app_config').select('*').eq('id', 'support_staff_list').maybeSingle();
    if (cfg) {
      const raw = cfg.value || cfg.data;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

export async function grantSupportStaffAccess(
  userId: string,
  name?: string,
  email?: string
): Promise<{ success: boolean; message: string; data?: SupportStaffMember; staff?: any }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/support/staff/grant', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, name, email })
    });
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (res.ok && json.success) {
      return {
        success: true,
        message: json.message || 'Support Staff access granted.',
        data: json.data || json.staff,
        staff: json.staff
      };
    }
    return {
      success: false,
      message: json.message || json.error || 'Unable to assign support staff'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Unable to assign support staff. Please try again.'
    };
  }
}

export async function updateSupportStaffStatusInSupabase(
  userId: string,
  status: 'ACTIVE' | 'DISABLED'
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/support/staff/update-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, status })
    });
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (res.ok && json.success) {
      return { success: true, message: json.message || `Support access updated to ${status}.` };
    }
    return { success: false, message: json.message || json.error || 'Failed to update support status.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error updating status.' };
  }
}

export async function removeSupportStaffRoleInSupabase(
  userId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/support/staff/remove', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId })
    });
    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (res.ok && json.success) {
      return { success: true, message: json.message || 'Support staff role removed.' };
    }
    return { success: false, message: json.message || json.error || 'Failed to remove support role.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error removing support role.' };
  }
}

export async function fetchSupportCategoriesFromSupabase(): Promise<SupportCategoryItem[]> {
  // 1. Try backend API (server-side service role - fetches from support_categories ONLY)
  try {
    const res = await fetch('/api/admin/support/categories');
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data)) {
        const cleaned = json.data.filter((c: any) => c && c.id && !c.id.startsWith('cat_'));
        try {
          localStorage.setItem('winx7_support_categories', JSON.stringify(cleaned));
        } catch {}
        return cleaned;
      }
    }
  } catch (err) {
    console.error('[fetchSupportCategoriesFromSupabase API error]', err);
  }

  // 2. Try support_categories dedicated table directly
  try {
    const { data: dbCats, error } = await supabase
      .from('support_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[fetchSupportCategoriesFromSupabase DB error]', error.message || error);
    } else if (dbCats && dbCats.length > 0) {
      const mapped = dbCats.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        isActive: c.is_active !== undefined ? Boolean(c.is_active) : true,
        displayOrder: c.display_order || 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }));
      const cleaned = mapped.filter((c: any) => !c.id.startsWith('cat_'));
      try {
        localStorage.setItem('winx7_support_categories', JSON.stringify(cleaned));
      } catch {}
      return cleaned;
    }
  } catch (err: any) {
    console.error('[fetchSupportCategoriesFromSupabase DB Exception]', err?.message || err);
  }

  // 3. Try localStorage cache ONLY if it contains legitimate support_categories rows (no 'cat_')
  try {
    const cached = localStorage.getItem('winx7_support_categories');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed.filter((c: any) => c && c.id && !c.id.startsWith('cat_'));
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch {}

  return [];
}

export async function createSupportCategoryInSupabase(
  payload: { name: string; description?: string; isActive?: boolean; displayOrder?: number }
): Promise<{ success: boolean; message: string; data?: SupportCategoryItem }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/support/categories', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (res.ok && json.success) {
      const existing = await fetchSupportCategoriesFromSupabase();
      try {
        localStorage.setItem('winx7_support_categories', JSON.stringify(existing));
      } catch {}
      return { success: true, message: json.message || 'Category created.', data: json.data };
    }
    return { success: false, message: json.error || 'Failed to create category.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error creating category.' };
  }
}

export async function updateSupportCategoryInSupabase(
  id: string,
  payload: { name?: string; description?: string; isActive?: boolean; displayOrder?: number }
): Promise<{ success: boolean; message: string; data?: SupportCategoryItem }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/support/categories/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (res.ok && json.success) {
      const existing = await fetchSupportCategoriesFromSupabase();
      try {
        localStorage.setItem('winx7_support_categories', JSON.stringify(existing));
      } catch {}
      return { success: true, message: json.message || 'Category updated.', data: json.data };
    }
    return { success: false, message: json.error || 'Failed to update category.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error updating category.' };
  }
}

export async function deleteSupportCategoryInSupabase(
  id: string
): Promise<{ success: boolean; isReferenced?: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/support/categories/${id}`, {
      method: 'DELETE',
      headers
    });
    const json = await res.json();
    if (res.ok && json.success) {
      const existing = await fetchSupportCategoriesFromSupabase();
      try {
        localStorage.setItem('winx7_support_categories', JSON.stringify(existing));
      } catch {}
      return { success: true, message: json.message || 'Category deleted successfully.' };
    }
    return {
      success: false,
      isReferenced: Boolean(json.isReferenced),
      message: json.error || 'Failed to delete category.'
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error deleting category.' };
  }
}

export function subscribeToSupportCategories(onUpdate: (categories: SupportCategoryItem[]) => void): () => void {
  let isSubscribed = true;

  const loadData = async () => {
    if (!isSubscribed) return;
    const cats = await fetchSupportCategoriesFromSupabase();
    if (isSubscribed) {
      onUpdate(cats);
    }
  };

  loadData();

  const channel = supabase.channel('winx7_support_categories_sub')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_categories' }, () => {
      loadData();
    })
    .on('broadcast', { event: 'SUPPORT_CATEGORIES_UPDATED' }, () => {
      loadData();
    })
    .subscribe();

  return () => {
    isSubscribed = false;
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}

export function subscribeToInbox(onUpdate: (payload: any) => void): () => void {
  const channel = supabase.channel('winx7_support_inbox_global')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'support_conversations'
    }, (payload) => {
      onUpdate(payload);
    })
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}

export function subscribeToConversation(
  conversationId: string,
  onUpdate: (payload: any) => void
): () => void {
  if (!conversationId) return () => {};
  
  const channel = supabase.channel(`winx7_support_conv_${conversationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'support_messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      onUpdate(payload);
    })
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}

// ==========================================
// WINX7 STAFF DAILY TASKS & PERFORMANCE TRACKER
// ==========================================

export async function fetchStaffDailyTasksFromSupabase(staffId: string): Promise<{
  roomReleasesCount: number;
  roomReleasesTarget: number;
  matchesCreatedCount: number;
  matchesCreatedTarget: number;
  resultSubmissionsCount: number;
  resultSubmissionsTarget: number;
  date: string;
}> {
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultTask = {
    roomReleasesCount: 0,
    roomReleasesTarget: 20,
    matchesCreatedCount: 0,
    matchesCreatedTarget: 20,
    resultSubmissionsCount: 0,
    resultSubmissionsTarget: 20,
    date: todayStr
  };

  if (!staffId) return defaultTask;

  try {
    const { data, error } = await supabase
      .from('staff_daily_tasks')
      .select('*')
      .eq('staff_id', staffId)
      .eq('date', todayStr)
      .maybeSingle();

    if (error) {
      console.warn('[fetchStaffDailyTasksFromSupabase] DB notice:', error.message);
    }

    if (data) {
      return {
        roomReleasesCount: Number(data.room_releases_count ?? data.roomReleasesCount ?? 0),
        roomReleasesTarget: Number(data.room_releases_target ?? data.roomReleasesTarget ?? 20),
        matchesCreatedCount: Number(data.matches_created_count ?? data.matchesCreatedCount ?? 0),
        matchesCreatedTarget: Number(data.matches_created_target ?? data.matchesCreatedTarget ?? 20),
        resultSubmissionsCount: Number(data.result_submissions_count ?? data.resultSubmissionsCount ?? 0),
        resultSubmissionsTarget: Number(data.result_submissions_target ?? data.resultSubmissionsTarget ?? 20),
        date: data.date || todayStr
      };
    } else {
      const initialPayload = {
        id: `${staffId}_${todayStr}`,
        staff_id: staffId,
        date: todayStr,
        room_releases_count: 0,
        room_releases_target: 20,
        matches_created_count: 0,
        matches_created_target: 20,
        result_submissions_count: 0,
        result_submissions_target: 20,
        updated_at: new Date().toISOString()
      };
      try {
        await supabase.from('staff_daily_tasks').upsert(initialPayload);
      } catch {}
      return defaultTask;
    }
  } catch (err) {
    console.warn('[fetchStaffDailyTasksFromSupabase] Exception:', err);
    try {
      const saved = localStorage.getItem(`winx7_staff_tasks_${staffId}_${todayStr}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return defaultTask;
  }
}

export async function fetchAllStaffDailyTasksFromSupabase(dateStr?: string, staffIds?: string[]): Promise<any[]> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  try {
    const { data, error } = await supabase
      .from('staff_daily_tasks')
      .select('*')
      .eq('date', targetDate);

    if (error) {
      console.warn('[fetchAllStaffDailyTasksFromSupabase] DB Error:', error);
      return [];
    }
    
    const tasks = data || [];
    
    // Ensure all requested staff IDs have a task record for today
    if (staffIds && staffIds.length > 0) {
      const missingStaffIds = staffIds.filter(id => !tasks.some(t => t.staff_id === id));
      if (missingStaffIds.length > 0) {
        const newRecords = missingStaffIds.map(staffId => ({
          id: `${staffId}_${targetDate}`,
          staff_id: staffId,
          date: targetDate,
          room_releases_target: 20,
          matches_created_target: 20,
          result_submissions_target: 20,
          room_releases_count: 0,
          matches_created_count: 0,
          result_submissions_count: 0,
          updated_at: new Date().toISOString()
        }));
        
        // Use insert with ignore conflicts (supported implicitly by avoiding upsert conflicts if handled correctly, but Supabase standard client can use upsert safely if we only set defaults)
        const { error: insertErr } = await supabase
          .from('staff_daily_tasks')
          .upsert(newRecords, { onConflict: 'id', ignoreDuplicates: true });
          
        if (!insertErr) {
          // Add them to the local tasks array for immediate return
          tasks.push(...newRecords);
        } else {
          console.warn('[fetchAllStaffDailyTasksFromSupabase] Failed to auto-create missing tasks:', insertErr);
        }
      }
    }

    return tasks;
  } catch (err) {
    console.warn('[fetchAllStaffDailyTasksFromSupabase] Exception:', err);
    return [];
  }
}

export async function updateStaffDailyTargetsInSupabase(
  staffId: string, 
  roomReleasesTarget: number, 
  matchesCreatedTarget: number, 
  resultSubmissionsTarget: number,
  dateStr?: string
): Promise<boolean> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  try {
    const payload = {
      id: `${staffId}_${targetDate}`,
      staff_id: staffId,
      date: targetDate,
      room_releases_target: roomReleasesTarget,
      matches_created_target: matchesCreatedTarget,
      result_submissions_target: resultSubmissionsTarget,
      updated_at: new Date().toISOString()
    };
    
    // We can just try to upsert. Because we only specify targets, if it exists, it might overwrite counts to default 0 if we aren't careful.
    // However, Supabase upsert updates whole row unless we do something else. 
    // It's safer to read existing row first, then update or insert.
    const { data: existing, error: fetchErr } = await supabase
      .from('staff_daily_tasks')
      .select('*')
      .eq('staff_id', staffId)
      .eq('date', targetDate)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from('staff_daily_tasks')
        .update({
          room_releases_target: roomReleasesTarget,
          matches_created_target: matchesCreatedTarget,
          result_submissions_target: resultSubmissionsTarget,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      if (updateErr) throw updateErr;
      return true;
    } else {
      const { error: insertErr } = await supabase
        .from('staff_daily_tasks')
        .insert([{
          id: `${staffId}_${targetDate}`,
          staff_id: staffId,
          date: targetDate,
          room_releases_target: roomReleasesTarget,
          matches_created_target: matchesCreatedTarget,
          result_submissions_target: resultSubmissionsTarget,
          room_releases_count: 0,
          matches_created_count: 0,
          result_submissions_count: 0,
          updated_at: new Date().toISOString()
        }]);
      
      if (insertErr) throw insertErr;
      return true;
    }
  } catch (err) {
    console.error('[updateStaffDailyTargetsInSupabase] Exception:', err);
    return false;
  }
}

export async function incrementStaffDailyTaskCount(
  staffId: string,
  taskType: 'room_release' | 'match_create' | 'result_submission'
): Promise<void> {
  if (!staffId) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const current = await fetchStaffDailyTasksFromSupabase(staffId);

  let updated = { ...current };
  if (taskType === 'room_release') {
    updated.roomReleasesCount += 1;
  } else if (taskType === 'match_create') {
    updated.matchesCreatedCount += 1;
  } else if (taskType === 'result_submission') {
    updated.resultSubmissionsCount += 1;
  }

  try {
    const payload = {
      id: `${staffId}_${todayStr}`,
      staff_id: staffId,
      date: todayStr,
      room_releases_count: updated.roomReleasesCount,
      room_releases_target: updated.roomReleasesTarget,
      matches_created_count: updated.matchesCreatedCount,
      matches_created_target: updated.matchesCreatedTarget,
      result_submissions_count: updated.resultSubmissionsCount,
      result_submissions_target: updated.resultSubmissionsTarget,
      updated_at: new Date().toISOString()
    };
    await supabase.from('staff_daily_tasks').upsert(payload);
  } catch (err) {
    console.warn('[incrementStaffDailyTaskCount] Supabase update notice:', err);
  }

  try {
    localStorage.setItem(`winx7_staff_tasks_${staffId}_${todayStr}`, JSON.stringify(updated));
  } catch {}
}

export async function updateStaffDailyTaskTargetsInSupabase(
  staffId: string,
  targets: { roomReleasesTarget?: number; matchesCreatedTarget?: number; resultSubmissionsTarget?: number }
): Promise<void> {
  if (!staffId) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const current = await fetchStaffDailyTasksFromSupabase(staffId);

  const updated = {
    roomReleasesTarget: targets.roomReleasesTarget ?? current.roomReleasesTarget,
    matchesCreatedTarget: targets.matchesCreatedTarget ?? current.matchesCreatedTarget,
    resultSubmissionsTarget: targets.resultSubmissionsTarget ?? current.resultSubmissionsTarget,
    roomReleasesCount: current.roomReleasesCount,
    matchesCreatedCount: current.matchesCreatedCount,
    resultSubmissionsCount: current.resultSubmissionsCount
  };

  try {
    const payload = {
      id: `${staffId}_${todayStr}`,
      staff_id: staffId,
      date: todayStr,
      room_releases_count: updated.roomReleasesCount,
      room_releases_target: updated.roomReleasesTarget,
      matches_created_count: updated.matchesCreatedCount,
      matches_created_target: updated.matchesCreatedTarget,
      result_submissions_count: updated.resultSubmissionsCount,
      result_submissions_target: updated.resultSubmissionsTarget,
      updated_at: new Date().toISOString()
    };
    await supabase.from('staff_daily_tasks').upsert(payload);
  } catch (err) {
    console.warn('[updateStaffDailyTaskTargetsInSupabase] Error:', err);
  }

  try {
    localStorage.setItem(`winx7_staff_tasks_${staffId}_${todayStr}`, JSON.stringify({
      ...current,
      ...updated
    }));
  } catch {}
}

export interface StaffTaskLog {
  id: string;
  staff_id: string;
  staff_name?: string;
  action_type: 'match_creation' | 'room_release' | 'result_submission' | string;
  match_id: string;
  created_at: string;
}

export async function resolveCanonicalStaffId(): Promise<{ canonicalStaffId: string; staffName: string; userUuid: string }> {
  try {
    await ensureSupabaseAuthSession();
    const sessionRes = await supabase.auth.getSession();
    const currentUser = sessionRes.data?.session?.user;
    if (!currentUser) {
      return { canonicalStaffId: 'WX7-STF-00001', staffName: 'Staff Member', userUuid: '' };
    }

    const userUuid = currentUser.id;
    const userEmail = currentUser.email || '';
    const fallbackName = currentUser.user_metadata?.full_name || 
                        currentUser.user_metadata?.displayName || 
                        (userEmail ? userEmail.split('@')[0] : 'Staff Member');

    // Query staff_members table to get canonical staff_id (WX7-STF-XXXXX)
    const { data: staffRows, error: staffErr } = await supabase
      .from('staff_members')
      .select('staff_id, staff_code, id, user_id, email, name, display_name')
      .or(`user_id.eq.${userUuid},email.eq.${userEmail}`)
      .limit(1);

    if (!staffErr && Array.isArray(staffRows) && staffRows.length > 0) {
      const row = staffRows[0];
      const canonicalStaffId = row.staff_id || row.staff_code || row.id || 'WX7-STF-00001';
      const staffName = row.name || row.display_name || fallbackName;
      return { canonicalStaffId, staffName, userUuid };
    }

    const metaStaffId = currentUser.user_metadata?.staff_id || currentUser.user_metadata?.staffId;
    if (metaStaffId) {
      return { canonicalStaffId: metaStaffId, staffName: fallbackName, userUuid };
    }

    return { canonicalStaffId: 'WX7-STF-00001', staffName: fallbackName, userUuid };
  } catch (ex) {
    console.error('[resolveCanonicalStaffId Exception]:', ex);
    return { canonicalStaffId: 'WX7-STF-00001', staffName: 'Staff Member', userUuid: '' };
  }
}

export async function logAndIncrementStaffTaskInSupabase(
  actionType: 'match_creation' | 'room_release' | 'result_submission',
  matchId: string
): Promise<boolean> {
  if (!matchId || !matchId.trim()) {
    console.warn('[logAndIncrementStaffTaskInSupabase] Skipped: matchId is empty');
    return false;
  }

  const rawMatchId = matchId.trim();
  const normalizedMatchId = normalizePublicMatchId(rawMatchId) || rawMatchId;

  try {
    const { canonicalStaffId, staffName, userUuid } = await resolveCanonicalStaffId();

    // 1. Primary: Call RPC log_and_increment_staff_task(p_action_type, p_match_id)
    let rpcSuccess = false;
    let rpcResponseData: any = null;
    try {
      // Standard signature: log_and_increment_staff_task(p_action_type, p_match_id)
      const { data: rpcData, error: rpcError } = await supabase.rpc('log_and_increment_staff_task', {
        p_action_type: actionType,
        p_match_id: normalizedMatchId
      });

      console.log('[log_and_increment_staff_task RPC Primary Execution]:', {
        actionType,
        matchId: normalizedMatchId,
        userUuid,
        canonicalStaffId,
        data: rpcData,
        error: rpcError?.message || null,
        code: rpcError?.code || null
      });

      if (!rpcError) {
        rpcSuccess = true;
        rpcResponseData = rpcData;
      } else {
        // Fallback signature test: log_and_increment_staff_task(p_action_type, p_match_id, p_staff_id)
        const { data: altData, error: altRpcError } = await supabase.rpc('log_and_increment_staff_task', {
          p_action_type: actionType,
          p_match_id: normalizedMatchId,
          p_staff_id: canonicalStaffId
        });

        console.log('[log_and_increment_staff_task RPC Secondary Execution]:', {
          data: altData,
          error: altRpcError?.message || null
        });

        if (!altRpcError) {
          rpcSuccess = true;
          rpcResponseData = altData;
        }
      }
    } catch (rpcEx) {
      console.warn('[logAndIncrementStaffTaskInSupabase] RPC Exception:', rpcEx);
    }

    // 2. ALWAYS insert record into public.staff_action_logs
    try {
      const actionPayload = {
        staff_id: canonicalStaffId,
        action_type: actionType,
        match_id: normalizedMatchId,
        created_at: new Date().toISOString()
      };

      const { data: insData, error: insErr } = await supabase
        .from('staff_action_logs')
        .insert([actionPayload])
        .select();

      console.log('[public.staff_action_logs Direct Insert Result]:', {
        actionType,
        matchId: normalizedMatchId,
        canonicalStaffId,
        insertedCount: insData?.length || 0,
        error: insErr?.message || null,
        code: insErr?.code || null,
        details: insErr?.details || null
      });
    } catch (tblErr) {
      console.error('[public.staff_action_logs Direct Insert Exception]:', tblErr);
    }

    // 3. Fallback counter increment on staff_daily_tasks if RPC failed
    if (!rpcSuccess && canonicalStaffId) {
      const mapTaskType: Record<string, 'room_release' | 'match_create' | 'result_submission'> = {
        'match_creation': 'match_create',
        'room_release': 'room_release',
        'result_submission': 'result_submission'
      };
      if (mapTaskType[actionType]) {
        await incrementStaffDailyTaskCount(canonicalStaffId, mapTaskType[actionType]);
      }
    }

    // Dispatch event for real-time UI refresh
    try {
      window.dispatchEvent(new CustomEvent('winx7_staff_action_logged', {
        detail: { canonicalStaffId, actionType, matchId: normalizedMatchId }
      }));
    } catch {}

    return true;
  } catch (err) {
    console.error('[logAndIncrementStaffTaskInSupabase] Unexpected error:', err);
    return false;
  }
}

export async function fetchStaffTaskLogsFromSupabase(): Promise<StaffTaskLog[]> {
  try {
    await ensureSupabaseAuthSession();

    // 1. Query public.staff_action_logs exclusively
    const { data: actionLogs, error: actionErr } = await supabase
      .from('staff_action_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (actionErr) {
      console.error('[public.staff_action_logs Query Error]:', actionErr);
      return [];
    }

    if (!Array.isArray(actionLogs) || actionLogs.length === 0) {
      return [];
    }

    // 2. Fetch staff_members and tournaments to join staff_name and tournament_title
    const [{ data: staffMembers }, { data: tournaments }] = await Promise.all([
      supabase.from('staff_members').select('*'),
      supabase.from('tournaments').select('*')
    ]);

    const staffMap = new Map<string, string>();
    if (Array.isArray(staffMembers)) {
      staffMembers.forEach((s: any) => {
        const name = s.name || s.displayName || s.email || 'Staff Member';
        if (s.staff_id) staffMap.set(String(s.staff_id).toLowerCase(), name);
        if (s.staffId) staffMap.set(String(s.staffId).toLowerCase(), name);
        if (s.staff_code) staffMap.set(String(s.staff_code).toLowerCase(), name);
        if (s.user_id) staffMap.set(String(s.user_id).toLowerCase(), name);
        if (s.userId) staffMap.set(String(s.userId).toLowerCase(), name);
        if (s.id) staffMap.set(String(s.id).toLowerCase(), name);
        if (s.email) staffMap.set(String(s.email).toLowerCase(), name);
      });
    }

    const tournMap = new Map<string, { title: string; game: string }>();
    if (Array.isArray(tournaments)) {
      tournaments.forEach((t: any) => {
        const matchId = t.match_id || t.matchId || t.id;
        if (matchId) {
          tournMap.set(String(matchId).trim().toUpperCase(), {
            title: t.title || 'Tournament Match',
            game: t.game || t.game_category || 'Free Fire'
          });
        }
      });
    }

    return actionLogs.map((row: any) => {
      const sKey = String(row.staff_id || '').toLowerCase().trim();
      const resolvedStaffName = row.staff_name || staffMap.get(sKey) || 'Staff Member';
      const mKey = String(row.match_id || '').trim().toUpperCase();
      const tourInfo = tournMap.get(mKey);

      return {
        id: String(row.id || `${row.staff_id}_${row.action_type}_${row.match_id}_${row.created_at}`),
        staff_id: String(row.staff_id || ''),
        staff_name: resolvedStaffName,
        action_type: row.action_type || 'task',
        match_id: row.match_id || '',
        created_at: row.created_at || row.timestamp || new Date().toISOString(),
        tournament_title: tourInfo?.title,
        game: tourInfo?.game
      };
    });
  } catch (err) {
    console.error('[fetchStaffTaskLogsFromSupabase Exception]:', err);
    return [];
  }
}




