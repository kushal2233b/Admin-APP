import { supabase } from './supabase';

/**
 * WINX7 Notification Sender Client Service
 * 
 * Securely communicates with the trusted backend notification endpoint.
 * Never exposes Firebase Admin private keys or credentials to the browser.
 */

// In-memory duplicate prevention set on client
const sentEventIds = new Set<string>();

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

export interface WithdrawalNotificationParams {
  userId: string;
  transactionId?: string;
  amount?: number;
  token?: string;
  eventId?: string;
}

export interface MatchResultNotificationParams {
  matchId: string;
  userIds?: string[];
  matchTitle?: string;
  force?: boolean;
  eventId?: string;
}

export interface CustomNotificationParams {
  eventId?: string;
  targetType: 'all' | 'user' | 'match';
  targetUserId?: string;
  targetMatchId?: string;
  title: string;
  message: string;
  imageUrl?: string;
  link?: string;
  force?: boolean;
}

export interface FcmResponse {
  success: boolean;
  skipped?: boolean;
  noTokens?: boolean;
  totalTokens?: number;
  successCount?: number;
  failureCount?: number;
  eventId?: string;
  recipientSummary?: string;
  message?: string;
  error?: string;
}

/**
 * Checks if the backend FCM service is initialized and ready.
 */
export async function checkFcmBackendStatus(): Promise<{ configured: boolean; error: string | null }> {
  try {
    const res = await fetch('/api/notifications/status');
    if (!res.ok) return { configured: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err: any) {
    return { configured: false, error: err?.message || 'Network error' };
  }
}

/**
 * Trigger ONE targeted FCM notification for an approved withdrawal.
 * 
 * Title: WINX7 💸
 * Body: Your withdrawal request is successfully processed.
 * Type: WITHDRAWAL_SUCCESS
 */
export async function sendWithdrawalNotification(
  params: WithdrawalNotificationParams
): Promise<FcmResponse> {
  const { userId, transactionId, amount, token, eventId } = params;
  if (!userId) {
    console.warn('[FCM Sender] sendWithdrawalNotification called without userId.');
    return { success: false, error: 'userId is required' };
  }

  const cleanEventId = eventId || (transactionId ? `withdrawal_${transactionId}` : `withdrawal_${userId}_${Date.now()}`);

  if (sentEventIds.has(cleanEventId)) {
    console.log(`[FCM Sender] Duplicate prevented for event ${cleanEventId}`);
    return {
      success: true,
      skipped: true,
      eventId: cleanEventId,
      message: 'Withdrawal notification already sent for this transaction.'
    };
  }

  try {
    console.log(`[FCM Sender] Triggering withdrawal notification for user: ${userId}, tx: ${transactionId}`);
    
    const headers = await getAuthHeaders();
    const response = await fetch('/api/notifications/send-withdrawal', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId,
        transactionId,
        amount,
        token,
        eventId: cleanEventId
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[FCM Sender Warning] Backend returned ${response.status}:`, errText);
      return { success: false, error: `Backend HTTP ${response.status}: ${errText}` };
    }

    const data: FcmResponse = await response.json();
    sentEventIds.add(cleanEventId);
    console.log('[FCM Sender] Withdrawal notification response:', data);
    return data;
  } catch (err: any) {
    console.warn('[FCM Sender Exception] Failed to send withdrawal notification:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Trigger ONE RESULT notification to all users who joined a match.
 * 
 * Title: WINX7 🏆
 * Body: Result is out! Open the app to see your winnings.
 * Type: RESULT
 * 
 * Duplicate Protection: Checks eventId + backend tracking.
 */
export async function sendMatchResultNotification(
  params: MatchResultNotificationParams
): Promise<FcmResponse> {
  const { matchId, userIds, force = false, eventId } = params;
  if (!matchId) {
    console.warn('[FCM Sender] sendMatchResultNotification called without matchId.');
    return { success: false, error: 'matchId is required' };
  }

  const cleanMatchId = String(matchId).trim();
  const cleanEventId = eventId || `result_${cleanMatchId}`;

  // 1. Client-side duplicate check
  if (!force && sentEventIds.has(cleanEventId)) {
    console.log(`[FCM Sender] Client duplicate prevented for match ${cleanMatchId}. Already triggered.`);
    return {
      success: true,
      skipped: true,
      eventId: cleanEventId,
      message: 'Result notification already triggered for this match.'
    };
  }

  try {
    console.log(`[FCM Sender] Triggering match result notification for match: ${cleanMatchId}, users: ${userIds?.length || 'all participants'}`);

    const headers = await getAuthHeaders();
    const response = await fetch('/api/notifications/send-match-result', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        matchId: cleanMatchId,
        userIds,
        force,
        eventId: cleanEventId
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[FCM Sender Warning] Backend returned ${response.status}:`, errText);
      return { success: false, error: `Backend HTTP ${response.status}: ${errText}` };
    }

    const data: FcmResponse = await response.json();
    console.log('[FCM Sender] Match result notification response:', data);

    sentEventIds.add(cleanEventId);
    return data;
  } catch (err: any) {
    console.warn('[FCM Sender Exception] Failed to send match result notification:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Trigger a CUSTOM push notification to:
 * - All users
 * - A specific user
 * - Match participants
 * 
 * With title, message, optional image/deep link, and event ID duplicate prevention.
 * Type: CUSTOM
 */
export async function sendCustomNotification(
  params: CustomNotificationParams
): Promise<FcmResponse> {
  const {
    eventId,
    targetType,
    targetUserId,
    targetMatchId,
    title,
    message,
    imageUrl,
    link,
    force = false
  } = params;

  if (!title || !title.trim()) {
    return { success: false, error: 'Title is required' };
  }
  if (!message || !message.trim()) {
    return { success: false, error: 'Message is required' };
  }

  const cleanEventId = eventId || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (!force && sentEventIds.has(cleanEventId)) {
    console.log(`[FCM Sender] Duplicate prevented for event ${cleanEventId}`);
    return {
      success: true,
      skipped: true,
      eventId: cleanEventId,
      message: 'Notification with this event ID has already been sent.'
    };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/notifications/send-custom', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventId: cleanEventId,
        targetType,
        targetUserId,
        targetMatchId,
        title,
        message,
        imageUrl,
        link,
        force
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Backend HTTP ${response.status}: ${errText}` };
    }

    const data: FcmResponse = await response.json();
    sentEventIds.add(cleanEventId);
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
