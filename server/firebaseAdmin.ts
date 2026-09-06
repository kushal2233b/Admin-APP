import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

// Supabase fallback client for backend token queries
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://phuduaampsjenkreufmz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_Y6DY8s-Cph3gIbEMRqWNLg_fodyJPrj';

let backendSupabase: any = null;
export function getBackendSupabase() {
  if (!backendSupabase && SUPABASE_URL && SUPABASE_KEY) {
    try {
      backendSupabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false }
      });
    } catch (e) {
      console.warn('[Backend Supabase Init Notice]:', e);
    }
  }
  return backendSupabase;
}

let firebaseApp: App | null = null;
let initAttempted = false;
let initError: string | null = null;
let isFirestoreAvailable: boolean | null = null;

/**
 * Lazily initialize Firebase Admin SDK using available environment credentials
 */
export function getFirebaseAdminApp(): App | null {
  if (firebaseApp) return firebaseApp;
  if (initAttempted && !firebaseApp) return null;

  initAttempted = true;

  try {
    const existingApps = getApps();
    if (existingApps.length > 0 && existingApps[0]) {
      firebaseApp = existingApps[0];
      return firebaseApp;
    }

    // 1. Check for whole JSON service account in FIREBASE_SERVICE_ACCOUNT env var
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      let parsedCreds: any;
      try {
        parsedCreds = JSON.parse(serviceAccountJson);
      } catch {
        // Try base64 decoding if not raw JSON
        const decoded = Buffer.from(serviceAccountJson, 'base64').toString('utf8');
        parsedCreds = JSON.parse(decoded);
      }

      firebaseApp = initializeApp({
        credential: cert(parsedCreds)
      });
      console.log('[Firebase Admin] Successfully initialized with service account.');
      return firebaseApp;
    }

    // 2. Check for individual env vars
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      // Clean private key escaped newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      firebaseApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log('[Firebase Admin] Successfully initialized with individual credentials.');
      return firebaseApp;
    }

    // 3. Fallback to application default credentials (e.g. if running in GCP Cloud Run / Google Cloud)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseApp = initializeApp({
        credential: applicationDefault()
      });
      console.log('[Firebase Admin] Successfully initialized with applicationDefault().');
      return firebaseApp;
    }

    // 4. Default initialize if projectId is present
    if (projectId) {
      try {
        firebaseApp = initializeApp({
          projectId
        });
        console.log(`[Firebase Admin] Initialized with projectId: ${projectId}`);
        return firebaseApp;
      } catch (err: any) {
        initError = err?.message || String(err);
      }
    }

    initError = 'No Firebase Admin credentials found in environment variables.';
    console.warn('[Firebase Admin]', initError);
    return null;
  } catch (err: any) {
    initError = err?.message || String(err);
    console.error('[Firebase Admin Init Error]:', initError);
    return null;
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return getFirebaseAdminApp() !== null;
}

export function getFirebaseAdminInitStatus(): { configured: boolean; error: string | null } {
  const app = getFirebaseAdminApp();
  return {
    configured: app !== null,
    error: app ? null : (initError || 'Firebase credentials not configured.')
  };
}

// =================================================================
// DEVICE TOKEN REGISTRY (Live App & Mobile Device Ingestion)
// =================================================================
export interface RegisteredDevice {
  token: string;
  userId?: string;
  deviceModel?: string;
  updatedAt: number;
}

const registeredDevices = new Map<string, RegisteredDevice>();

/**
 * Strict validator for FCM device registration tokens.
 * Valid FCM tokens:
 * - Are typically between 80 and 400 characters (standard Android/iOS tokens are ~140-165 chars, Web push ~180-250 chars).
 * - Contain only valid Base64 / URL-safe characters: [A-Za-z0-9_\-:=]
 * - Contain no whitespace, line breaks, or dummy prefixes (e.g. 'test_token', 'mock', 'dummy', 'fake').
 */
export function isValidFcmRegistrationToken(token: any): boolean {
  if (!token || typeof token !== 'string') return false;
  const t = token.trim();
  if (t.length < 64 || t.length > 500) return false;
  if (/\s/.test(t)) return false;
  const lower = t.toLowerCase();
  if (
    lower.includes('test_token') ||
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('fake') ||
    lower.includes('undefined') ||
    lower.includes('null')
  ) {
    return false;
  }
  return /^[A-Za-z0-9_\-:=]+$/.test(t);
}

/**
 * Automatically purges dead, expired, or invalid FCM registration tokens from memory and Supabase store
 */
export async function pruneInvalidFcmToken(token: string): Promise<void> {
  const clean = String(token || '').trim();
  if (!clean) return;
  registeredDevices.delete(clean);

  try {
    const sb = getBackendSupabase();
    if (sb?.auth?.admin) {
      const { data: userList } = await sb.auth.admin.listUsers({ perPage: 1000 });
      if (userList?.users) {
        for (const u of userList.users) {
          const meta = u.user_metadata || {};
          if (meta.fcm_token === clean) {
            await sb.auth.admin.updateUserById(u.id, {
              user_metadata: {
                ...meta,
                fcm_token: null,
                device_model: null,
                fcm_updated_at: null
              }
            });
            console.log(`[FCM Token Pruner] Purged invalid/unregistered token from Supabase Auth user ${u.id}`);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[FCM Token Pruner] Notice during token pruning:', err?.message || err);
  }
}

export async function registerDeviceToken(
  token: string,
  userId?: string,
  deviceModel?: string
): Promise<{ success: boolean; total: number; error?: string }> {
  const cleanToken = String(token || '').trim();
  if (!isValidFcmRegistrationToken(cleanToken)) {
    return {
      success: false,
      total: registeredDevices.size,
      error: 'The registration token is not a valid FCM registration token'
    };
  }
  const cleanUserId = userId ? String(userId).trim() : undefined;
  registeredDevices.set(cleanToken, {
    token: cleanToken,
    userId: cleanUserId,
    deviceModel: deviceModel ? String(deviceModel).trim() : undefined,
    updatedAt: Date.now()
  });

  // Automatically persist to Supabase Auth token store
  if (cleanUserId) {
    try {
      const sb = getBackendSupabase();
      if (sb?.auth?.admin) {
        await sb.auth.admin.updateUserById(cleanUserId, {
          user_metadata: {
            fcm_token: cleanToken,
            device_model: deviceModel || 'Android Device',
            fcm_updated_at: new Date().toISOString()
          }
        });
        console.log(`[Supabase Token Store] Persisted FCM token in Supabase user_metadata for user ${cleanUserId}`);
      }
    } catch (e: any) {
      console.warn('[Supabase Token Store] Persistence notice:', e?.message || e);
    }
  }

  return { success: true, total: registeredDevices.size };
}

export function unregisterDeviceToken(token: string): boolean {
  return registeredDevices.delete(String(token || '').trim());
}

export function getRegisteredDevicesList(): RegisteredDevice[] {
  return Array.from(registeredDevices.values());
}

/**
 * Retrieve all FCM registration tokens across all users (for broadcast notifications)
 */
export async function getAllFCMTokens(): Promise<string[]> {
  const tokens = new Set<string>();

  // 0. Include registered device tokens from active app clients
  for (const dev of registeredDevices.values()) {
    tokens.add(dev.token);
  }

  // 1. Supabase profiles
  try {
    const sb = getBackendSupabase();
    if (sb) {
      const { data: profiles } = await sb.from('profiles').select('*');
      if (profiles && Array.isArray(profiles)) {
        for (const p of profiles) {
          const candidateKeys = [
            'fcm_token', 'fcmToken', 'fcmtoken', 'push_token', 'pushToken',
            'device_token', 'deviceToken', 'notification_token', 'token'
          ];
          for (const k of candidateKeys) {
            if (p[k] && typeof p[k] === 'string' && p[k].trim().length > 15) {
              tokens.add(p[k].trim());
            }
          }
          if (Array.isArray(p.fcm_tokens)) {
            p.fcm_tokens.forEach((t: any) => {
              if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
            });
          }
          if (p.device_info?.fcm_token) {
            tokens.add(String(p.device_info.fcm_token).trim());
          }
        }
      }

      // Check Supabase Auth user_metadata (persistent token store)
      if (sb.auth?.admin) {
        try {
          const { data: userList } = await sb.auth.admin.listUsers({ perPage: 1000 });
          if (userList?.users) {
            for (const u of userList.users) {
              const meta = u.user_metadata || {};
              const candidateKeys = [
                'fcm_token', 'fcmToken', 'fcmtoken', 'push_token', 'pushToken',
                'device_token', 'deviceToken', 'notification_token', 'token'
              ];
              for (const k of candidateKeys) {
                if (meta[k] && typeof meta[k] === 'string' && meta[k].trim().length > 15) {
                  tokens.add(meta[k].trim());
                }
              }
              if (Array.isArray(meta.fcm_tokens)) {
                meta.fcm_tokens.forEach((t: any) => {
                  if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
                });
              }
            }
          }
        } catch (authErr) {
          console.warn('[getAllFCMTokens Supabase Auth notice]:', authErr);
        }
      }
    }
  } catch (err) {
    console.warn('[getAllFCMTokens Supabase warning]:', err);
  }

  // 2. Firestore users (only if Cloud Firestore API is enabled on this project)
  if (isFirestoreAvailable !== false) {
    try {
      const app = getFirebaseAdminApp();
      if (app) {
        const db = getFirestore(app);
        const snapshot = await db.collection('users').get();
        isFirestoreAvailable = true;
        snapshot.forEach(doc => {
          const data = doc.data();
          const candidateKeys = [
            'fcmToken', 'fcm_token', 'fcmtoken', 'pushToken', 'push_token',
            'deviceToken', 'device_token', 'token', 'notificationToken'
          ];
          for (const k of candidateKeys) {
            if (data[k] && typeof data[k] === 'string' && data[k].trim().length > 15) {
              tokens.add(data[k].trim());
            }
          }
          if (Array.isArray(data.tokens)) {
            data.tokens.forEach((t: any) => {
              if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
            });
          }
        });
      }
    } catch (err: any) {
      const msg = String(err?.message || err?.details || err);
      if (msg.includes('Cloud Firestore API has not been used') || msg.includes('PERMISSION_DENIED') || err?.code === 7) {
        isFirestoreAvailable = false;
        console.log('[FCM Gateway] Cloud Firestore API is disabled for project winx7-notty; relying on Supabase token store.');
      } else {
        console.warn('[getAllFCMTokens Firestore warning]:', msg);
      }
    }
  }

  return Array.from(tokens).filter(t => isValidFcmRegistrationToken(t));
}

/**
 * Retrieve FCM registration tokens for a given User ID from all authoritative sources:
 * 1. Supabase profiles (fcm_token, fcmToken, push_token, device_token, etc.)
 * 2. Supabase user_tokens / fcm_tokens / registrations tables
 * 3. Firestore users/{userId} (fcmToken, fcm_token, tokens subcollection)
 */
export async function getFCMTokensForUser(userId: string): Promise<string[]> {
  const tokens = new Set<string>();
  if (!userId) return [];

  const cleanUserId = String(userId).trim();

  // 0. Include registered device tokens matching this user
  for (const dev of registeredDevices.values()) {
    if (dev.userId && dev.userId.toLowerCase() === cleanUserId.toLowerCase()) {
      tokens.add(dev.token);
    }
  }

  // 1. Search in Supabase profiles & token tables
  try {
    const sb = getBackendSupabase();
    if (sb) {
      const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('id', cleanUserId)
        .maybeSingle();

      if (profile) {
        const candidateKeys = [
          'fcm_token', 'fcmToken', 'fcmtoken', 'push_token', 'pushToken',
          'device_token', 'deviceToken', 'notification_token', 'notificationToken', 'token'
        ];
        for (const k of candidateKeys) {
          if (profile[k] && typeof profile[k] === 'string' && profile[k].trim().length > 15) {
            tokens.add(profile[k].trim());
          }
        }
        if (Array.isArray(profile.fcm_tokens)) {
          profile.fcm_tokens.forEach((t: any) => {
            if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
          });
        }
        if (profile.device_info?.fcm_token) {
          tokens.add(String(profile.device_info.fcm_token).trim());
        }
      }

      // Check registrations table for any device/fcm tokens
      try {
        const { data: regData } = await sb
          .from('registrations')
          .select('*')
          .eq('user_id', cleanUserId)
          .limit(5);

        if (regData && Array.isArray(regData)) {
          for (const r of regData) {
            if (r.fcm_token && typeof r.fcm_token === 'string') tokens.add(r.fcm_token.trim());
            if (r.fcmToken && typeof r.fcmToken === 'string') tokens.add(r.fcmToken.trim());
          }
        }
      } catch {}

      // Check Supabase Auth user_metadata (persistent user profile store)
      if (sb.auth?.admin) {
        try {
          const { data: userData } = await sb.auth.admin.getUserById(cleanUserId);
          const meta = userData?.user?.user_metadata || {};
          const candidateKeys = [
            'fcm_token', 'fcmToken', 'fcmtoken', 'push_token', 'pushToken',
            'device_token', 'deviceToken', 'notification_token', 'token'
          ];
          for (const k of candidateKeys) {
            if (meta[k] && typeof meta[k] === 'string' && meta[k].trim().length > 15) {
              tokens.add(meta[k].trim());
            }
          }
          if (Array.isArray(meta.fcm_tokens)) {
            meta.fcm_tokens.forEach((t: any) => {
              if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
            });
          }
        } catch (authErr) {
          console.warn(`[getFCMTokensForUser Supabase Auth notice for ${cleanUserId}]:`, authErr);
        }
      }
    }
  } catch (err) {
    console.warn(`[getFCMTokensForUser Supabase warning for ${cleanUserId}]:`, err);
  }

  // 2. Search in Firestore if Firebase Admin and Firestore API are available
  if (isFirestoreAvailable !== false) {
    try {
      const app = getFirebaseAdminApp();
      if (app) {
        const db = getFirestore(app);
        
        // Check users/{userId} doc
        const userDoc = await db.collection('users').doc(cleanUserId).get();
        isFirestoreAvailable = true;
        if (userDoc.exists) {
          const data = userDoc.data() || {};
          const candidateKeys = [
            'fcmToken', 'fcm_token', 'fcmtoken', 'pushToken', 'push_token',
            'deviceToken', 'device_token', 'token', 'notificationToken'
          ];
          for (const k of candidateKeys) {
            if (data[k] && typeof data[k] === 'string' && data[k].trim().length > 15) {
              tokens.add(data[k].trim());
            }
          }
          if (Array.isArray(data.tokens)) {
            data.tokens.forEach((t: any) => {
              if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
            });
          }
        }

        // Check subcollection users/{userId}/tokens or fcm_tokens
        try {
          const tokensSub = await db.collection('users').doc(cleanUserId).collection('tokens').get();
          tokensSub.forEach((doc) => {
            const d = doc.data();
            if (d.token && typeof d.token === 'string') tokens.add(d.token.trim());
            if (d.fcmToken && typeof d.fcmToken === 'string') tokens.add(d.fcmToken.trim());
          });
        } catch {}

        // Check standalone fcm_tokens/{userId} or user_tokens/{userId}
        try {
          const directTokenDoc = await db.collection('fcm_tokens').doc(cleanUserId).get();
          if (directTokenDoc.exists) {
            const d = directTokenDoc.data() || {};
            if (d.token && typeof d.token === 'string') tokens.add(d.token.trim());
            if (d.fcmToken && typeof d.fcmToken === 'string') tokens.add(d.fcmToken.trim());
            if (Array.isArray(d.tokens)) {
              d.tokens.forEach((t: any) => {
                if (typeof t === 'string' && t.trim().length > 15) tokens.add(t.trim());
              });
            }
          }
        } catch {}
      }
    } catch (err: any) {
      const msg = String(err?.message || err?.details || err);
      if (msg.includes('Cloud Firestore API has not been used') || msg.includes('PERMISSION_DENIED') || err?.code === 7) {
        isFirestoreAvailable = false;
        console.log('[FCM Gateway] Cloud Firestore API is disabled for project winx7-notty; relying on Supabase token store.');
      } else {
        console.warn(`[getFCMTokensForUser Firestore warning for ${cleanUserId}]:`, msg);
      }
    }
  }

  return Array.from(tokens).filter(t => isValidFcmRegistrationToken(t));
}

/**
 * Retrieve all FCM registration tokens for participants of a tournament match.
 */
export async function getFCMTokensForMatchParticipants(
  matchId: string,
  fallbackUserIds?: string[]
): Promise<{ userIds: string[]; tokens: string[] }> {
  const userIds = new Set<string>(fallbackUserIds || []);
  const tokens = new Set<string>();

  if (!matchId) {
    for (const uid of Array.from(userIds)) {
      const uTokens = await getFCMTokensForUser(uid);
      uTokens.forEach(t => tokens.add(t));
    }
    return { userIds: Array.from(userIds), tokens: Array.from(tokens).filter(t => isValidFcmRegistrationToken(t)) };
  }

  // 1. Fetch from Supabase registrations & tournaments
  try {
    const sb = getBackendSupabase();
    if (sb) {
      const [regsRes, tournRes] = await Promise.all([
        sb.from('registrations').select('*').eq('tournament_id', matchId),
        sb.from('tournaments').select('*').eq('id', matchId).maybeSingle()
      ]);

      if (regsRes.data && Array.isArray(regsRes.data)) {
        for (const reg of regsRes.data) {
          const uid = reg.user_id || reg.userId;
          if (uid) userIds.add(String(uid).trim());
          if (reg.fcm_token) tokens.add(String(reg.fcm_token).trim());
          if (reg.fcmToken) tokens.add(String(reg.fcmToken).trim());
        }
      }

      if (tournRes.data) {
        const parts = tournRes.data.participants;
        let pArray: any[] = [];
        if (Array.isArray(parts)) pArray = parts;
        else if (typeof parts === 'string') {
          try { pArray = JSON.parse(parts); } catch {}
        }
        for (const p of pArray) {
          const uid = p.userId || p.user_id || p.uid || p.id;
          if (uid) userIds.add(String(uid).trim());
          if (p.fcmToken) tokens.add(String(p.fcmToken).trim());
          if (p.fcm_token) tokens.add(String(p.fcm_token).trim());
        }
      }
    }
  } catch (err) {
    console.warn(`[getFCMTokensForMatchParticipants Supabase warning for ${matchId}]:`, err);
  }

  // 2. Fetch from Firestore tournaments/{matchId} if available
  if (isFirestoreAvailable !== false) {
    try {
      const app = getFirebaseAdminApp();
      if (app) {
        const db = getFirestore(app);
        const doc = await db.collection('tournaments').doc(matchId).get();
        isFirestoreAvailable = true;
        if (doc.exists) {
          const data = doc.data() || {};
          const parts = data.participants || [];
          if (Array.isArray(parts)) {
            for (const p of parts) {
              const uid = p.userId || p.user_id || p.uid || p.id;
              if (uid) userIds.add(String(uid).trim());
              if (p.fcmToken) tokens.add(String(p.fcmToken).trim());
            }
          }
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err?.details || err);
      if (msg.includes('Cloud Firestore API has not been used') || msg.includes('PERMISSION_DENIED') || err?.code === 7) {
        isFirestoreAvailable = false;
        console.log('[FCM Gateway] Cloud Firestore API is disabled for project winx7-notty; relying on Supabase token store.');
      } else {
        console.warn(`[getFCMTokensForMatchParticipants Firestore warning for ${matchId}]:`, msg);
      }
    }
  }

  // 3. Resolve user tokens for any userIds whose tokens weren't found inline
  for (const uid of Array.from(userIds)) {
    const userTokens = await getFCMTokensForUser(uid);
    userTokens.forEach(t => tokens.add(t));
  }

  return {
    userIds: Array.from(userIds),
    tokens: Array.from(tokens).filter(t => isValidFcmRegistrationToken(t))
  };
}

export interface FcmSendPayload {
  tokens: string[];
  title: string;
  body: string;
  imageUrl?: string;
  link?: string;
  data?: Record<string, string>;
}

export interface FcmSendResult {
  success: boolean;
  totalTokens: number;
  successCount: number;
  failureCount: number;
  message?: string;
  invalidTokens?: string[];
  messageIds?: string[];
}

/**
 * Sends direct targeted push notification to specific FCM registration tokens
 * Uses direct registration tokens, NOT topics.
 */
export async function sendFcmNotificationToTokens(payload: FcmSendPayload): Promise<FcmSendResult> {
  const { tokens, title, body, imageUrl, link, data = {} } = payload;
  
  // Filter out any invalid / dummy tokens and asynchronously prune them
  const validTokens: string[] = [];
  const rejectedTokens: string[] = [];

  for (const t of tokens) {
    const clean = String(t || '').trim();
    if (isValidFcmRegistrationToken(clean)) {
      validTokens.push(clean);
    } else if (clean) {
      rejectedTokens.push(clean);
      pruneInvalidFcmToken(clean).catch(() => {});
    }
  }

  const uniqueTokens = Array.from(new Set(validTokens));

  if (uniqueTokens.length === 0) {
    return {
      success: false,
      totalTokens: tokens.length,
      successCount: 0,
      failureCount: tokens.length,
      message: rejectedTokens.length > 0
        ? 'No valid FCM device registration tokens found. Invalid/mock tokens were pruned.'
        : 'No active FCM registration tokens found for target user(s).',
      invalidTokens: rejectedTokens
    };
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    const status = getFirebaseAdminInitStatus();
    return {
      success: false,
      totalTokens: uniqueTokens.length,
      successCount: 0,
      failureCount: uniqueTokens.length,
      message: `Firebase Admin SDK not initialized: ${status.error || 'Missing credentials in environment variables.'}`
    };
  }

  const messaging = getMessaging(app);

  try {
    const finalData: Record<string, string> = {
      ...data,
      click_action: data.click_action || 'FLUTTER_NOTIFICATION_CLICK',
      title,
      body
    };

    if (imageUrl) finalData.image_url = imageUrl;
    if (link) finalData.deep_link = link;

    const notificationConfig: any = {
      title,
      body
    };
    if (imageUrl) {
      notificationConfig.imageUrl = imageUrl;
    }

    const multicastMessage: MulticastMessage = {
      tokens: uniqueTokens,
      notification: notificationConfig,
      data: finalData,
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          sound: 'default',
          channelId: 'winx7_notifications',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
          ...(imageUrl ? { imageUrl } : {})
        }
      }
    };

    const response = await messaging.sendEachForMulticast(multicastMessage);

    const invalidTokens: string[] = [...rejectedTokens];
    const messageIds: string[] = [];

    response.responses.forEach((resp, idx) => {
      const targetToken = uniqueTokens[idx];
      if (resp.success) {
        if (resp.messageId) messageIds.push(resp.messageId);
      } else {
        const errCode = resp.error?.code;
        const errMsg = resp.error?.message || errCode;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(targetToken);
          // Automatically prune invalid token from memory and Supabase so subsequent dispatches are clean
          pruneInvalidFcmToken(targetToken).catch(() => {});
          console.log(`[FCM Token Lifecycle] Automatically pruned inactive/invalid token: ${targetToken.slice(0, 15)}... (${errMsg})`);
        } else {
          console.warn(`[FCM Send Notice for Token ${idx}]:`, errMsg);
        }
      }
    });

    console.log(`[FCM Notification Sent] Title: "${title}", Success: ${response.successCount}/${uniqueTokens.length}`);

    return {
      success: response.successCount > 0,
      totalTokens: uniqueTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      message: response.successCount > 0 
        ? `Successfully delivered notification to ${response.successCount} device(s).`
        : `Failed to deliver notification to any devices.`,
      invalidTokens,
      messageIds
    };
  } catch (err: any) {
    console.error('[sendFcmNotificationToTokens Exception]:', err);
    return {
      success: false,
      totalTokens: uniqueTokens.length,
      successCount: 0,
      failureCount: uniqueTokens.length,
      message: `FCM messaging error: ${err?.message || String(err)}`
    };
  }
}
