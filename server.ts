import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  getFirebaseAdminInitStatus,
  getAllFCMTokens,
  getFCMTokensForUser,
  getFCMTokensForMatchParticipants,
  sendFcmNotificationToTokens,
  getBackendSupabase,
  registerDeviceToken,
  unregisterDeviceToken,
  getRegisteredDevicesList
} from './server/firebaseAdmin';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Idempotency cache for event IDs to prevent duplicate sends
const processedEventIds = new Map<string, { timestamp: number; type: string; count: number }>();

// Clean old event IDs older than 24 hours periodically
setInterval(() => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, record] of processedEventIds.entries()) {
    if (record.timestamp < oneDayAgo) {
      processedEventIds.delete(id);
    }
  }
}, 60 * 60 * 1000);

// =================================================================
// 1. HEALTH & FCM STATUS API
// =================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    fcm: getFirebaseAdminInitStatus()
  });
});

app.get('/api/notifications/status', (_req, res) => {
  res.json(getFirebaseAdminInitStatus());
});

// =================================================================
// 1.1 NOTIFICATIONS DATA ENDPOINTS (Admin Portal Supabase Gateway)
// =================================================================
app.get('/api/notifications', async (_req, res) => {
  try {
    const sb = getBackendSupabase();
    if (!sb) {
      res.json({ success: false, data: [] });
      return;
    }
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('[Server Notifications Fetch Notice]:', error.message);
      res.json({ success: false, data: [], error: error.message });
      return;
    }
    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, data: [], error: err?.message || String(err) });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const sb = getBackendSupabase();
    if (!sb) {
      res.status(500).json({ success: false, error: 'Backend database connection not available.' });
      return;
    }
    const { id, user_id, targetUserId, title, message, type, is_read, created_at, sentAt } = req.body || {};
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const validId = (id && uuidRegex.test(String(id))) ? String(id) : randomUUID();
    const candidateUser = user_id || targetUserId;
    const validUserId = (candidateUser && uuidRegex.test(String(candidateUser))) ? String(candidateUser) : null;

    // Strict mapping to actual Supabase notifications schema:
    // [id, user_id, title, message, type, is_read, created_at]
    const record = {
      id: validId,
      user_id: validUserId,
      title: String(title || 'Notification').trim(),
      message: String(message || '').trim(),
      type: String(type || 'system').trim(),
      is_read: Boolean(is_read),
      created_at: created_at || sentAt || new Date().toISOString()
    };

    const { data, error } = await sb.from('notifications').upsert(record).select();
    if (error) {
      console.warn('[Server Notifications Save Notice]:', error.message);
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data: data?.[0] || record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 1.2 DEVICE FCM TOKEN REGISTRATION (User App & Client Sync Gateway)
// =================================================================
app.post(['/api/notifications/register-token', '/api/notifications/register-device-token'], async (req, res) => {
  try {
    const { token, fcmToken, userId, user_id, deviceModel, device_model } = req.body || {};
    const rawToken = token || fcmToken;
    const cleanUserId = userId || user_id;
    const cleanDeviceModel = deviceModel || device_model;

    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 15) {
      res.status(400).json({ success: false, error: 'A valid FCM device registration token is required.' });
      return;
    }

    const regResult = await registerDeviceToken(rawToken, cleanUserId, cleanDeviceModel);
    console.log(`[FCM Device Registry] Device registered (User: ${cleanUserId || 'anonymous'}, Total active: ${regResult.total})`);
    
    res.json({
      success: true,
      message: 'FCM device registration token successfully registered in Supabase.',
      activeDeviceCount: regResult.total
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post(['/api/notifications/unregister-token', '/api/notifications/unregister-device-token'], (req, res) => {
  try {
    const { token, fcmToken } = req.body || {};
    const rawToken = token || fcmToken;
    if (rawToken && typeof rawToken === 'string') {
      unregisterDeviceToken(rawToken);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.get('/api/notifications/registered-devices', (_req, res) => {
  try {
    const list = getRegisteredDevicesList().map(d => ({
      tokenPreview: `${d.token.substring(0, 10)}...${d.token.substring(d.token.length - 6)}`,
      userId: d.userId || null,
      deviceModel: d.deviceModel || 'Unknown Device',
      updatedAt: new Date(d.updatedAt).toISOString()
    }));
    res.json({ success: true, count: list.length, devices: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 2. WITHDRAWAL NOTIFICATION SENDER (WITHDRAWAL_SUCCESS)
// =================================================================
/**
 * Triggers ONE targeted notification to the user's FCM token upon approved withdrawal.
 * Title: WINX7 💸
 * Body: Your withdrawal request is successfully processed.
 * Type: WITHDRAWAL_SUCCESS
 */
app.post('/api/notifications/send-withdrawal', async (req, res) => {
  try {
    const { userId, transactionId, amount, token, eventId } = req.body || {};

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required.' });
      return;
    }

    const cleanUserId = String(userId).trim();
    const cleanTxId = transactionId ? String(transactionId).trim() : '';
    const cleanEventId = eventId ? String(eventId).trim() : (cleanTxId ? `withdrawal_${cleanTxId}` : `withdrawal_${cleanUserId}_${Date.now()}`);

    // Idempotency check
    if (processedEventIds.has(cleanEventId)) {
      const prev = processedEventIds.get(cleanEventId);
      console.log(`[Withdrawal Notification] Duplicate prevented for event ${cleanEventId}`);
      res.json({
        success: true,
        skipped: true,
        eventId: cleanEventId,
        message: 'Withdrawal notification already processed for this event ID.'
      });
      return;
    }

    // Collect tokens for user
    const tokens = new Set<string>();
    if (token && typeof token === 'string' && token.trim().length > 15) {
      tokens.add(token.trim());
    }

    const fetchedTokens = await getFCMTokensForUser(cleanUserId);
    fetchedTokens.forEach(t => tokens.add(t));

    const tokenList = Array.from(tokens);

    if (tokenList.length === 0) {
      console.warn(`[Withdrawal Notification] No FCM tokens found for user ${cleanUserId}`);
      // Mark as processed so repetitive clicks do not retry
      processedEventIds.set(cleanEventId, { timestamp: Date.now(), type: 'WITHDRAWAL_SUCCESS', count: 0 });
      res.json({
        success: false,
        noTokens: true,
        eventId: cleanEventId,
        message: `No active FCM device token found for user ${cleanUserId}.`
      });
      return;
    }

    // EXACT REQUIRED TITLE & BODY
    const title = 'WINX7 💸';
    const body = 'Your withdrawal request is successfully processed.';

    const result = await sendFcmNotificationToTokens({
      tokens: tokenList,
      title,
      body,
      data: {
        type: 'WITHDRAWAL_SUCCESS',
        eventId: cleanEventId,
        userId: cleanUserId,
        transactionId: cleanTxId,
        amount: amount ? String(amount) : '',
        timestamp: new Date().toISOString()
      }
    });

    processedEventIds.set(cleanEventId, {
      timestamp: Date.now(),
      type: 'WITHDRAWAL_SUCCESS',
      count: result.successCount
    });

    res.json({
      ...result,
      eventId: cleanEventId
    });
  } catch (err: any) {
    console.error('[send-withdrawal error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 3. MATCH RESULT NOTIFICATION SENDER (RESULT)
// =================================================================
/**
 * Triggers ONE RESULT notification to users who joined that match.
 * Title: WINX7 🏆
 * Body: Result is out! Open the app to see your winnings.
 * Type: RESULT
 * Duplicate protection: Idempotency event ID
 */
app.post('/api/notifications/send-match-result', async (req, res) => {
  try {
    const { matchId, userIds, eventId, force } = req.body || {};

    if (!matchId) {
      res.status(400).json({ success: false, error: 'matchId is required.' });
      return;
    }

    const cleanMatchId = String(matchId).trim();
    const cleanEventId = eventId ? String(eventId).trim() : `result_${cleanMatchId}`;

    // 1. IDEMPOTENCY CHECK
    if (!force && processedEventIds.has(cleanEventId)) {
      console.log(`[Result Notification] Duplicate prevented for event ${cleanEventId}`);
      res.json({
        success: true,
        skipped: true,
        eventId: cleanEventId,
        message: `Result notification already sent for match ${cleanMatchId}. Duplicate skipped.`
      });
      return;
    }

    // 2. Fetch all joined users and their FCM tokens
    const { userIds: participants, tokens } = await getFCMTokensForMatchParticipants(
      cleanMatchId,
      Array.isArray(userIds) ? userIds : undefined
    );

    if (tokens.length === 0) {
      console.warn(`[Result Notification] No FCM tokens found for match ${cleanMatchId} (${participants.length} users)`);
      processedEventIds.set(cleanEventId, { timestamp: Date.now(), type: 'RESULT', count: 0 });
      res.json({
        success: false,
        noTokens: true,
        eventId: cleanEventId,
        participantsCount: participants.length,
        message: `No active FCM tokens found for ${participants.length} match participant(s).`
      });
      return;
    }

    // EXACT REQUIRED TITLE & BODY
    const title = 'WINX7 🏆';
    const body = 'Result is out! Open the app to see your winnings.';

    const result = await sendFcmNotificationToTokens({
      tokens,
      title,
      body,
      data: {
        type: 'RESULT',
        eventId: cleanEventId,
        matchId: cleanMatchId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        timestamp: new Date().toISOString()
      }
    });

    processedEventIds.set(cleanEventId, {
      timestamp: Date.now(),
      type: 'RESULT',
      count: result.successCount
    });

    res.json({
      ...result,
      eventId: cleanEventId,
      matchId: cleanMatchId,
      participantsCount: participants.length
    });
  } catch (err: any) {
    console.error('[send-match-result error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 4. CUSTOM NOTIFICATION SENDER (CUSTOM)
// =================================================================
/**
 * Supports:
 * - All users (broadcast)
 * - Specific user (targeted)
 * - Match participants (tournament players)
 * - title, message, optional image/deep link
 * - Idempotency event ID
 * - Type: CUSTOM
 */
app.post('/api/notifications/send-custom', async (req, res) => {
  try {
    const {
      eventId,
      targetType = 'all', // 'all' | 'user' | 'match'
      targetUserId,
      targetMatchId,
      title,
      message,
      imageUrl,
      link,
      force
    } = req.body || {};

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, error: 'Notification title is required.' });
      return;
    }
    if (!message || !message.trim()) {
      res.status(400).json({ success: false, error: 'Notification message is required.' });
      return;
    }

    const cleanTitle = String(title).trim();
    const cleanMessage = String(message).trim();
    const cleanEventId = eventId ? String(eventId).trim() : `custom_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Idempotency check
    if (!force && processedEventIds.has(cleanEventId)) {
      console.log(`[Custom Notification] Duplicate prevented for event ${cleanEventId}`);
      res.json({
        success: true,
        skipped: true,
        eventId: cleanEventId,
        message: 'Notification with this event ID has already been sent.'
      });
      return;
    }

    // Resolve tokens based on targetType
    let targetTokens: string[] = [];
    let recipientSummary = '';

    if (targetType === 'user') {
      if (!targetUserId) {
        res.status(400).json({ success: false, error: 'targetUserId is required when targetType is user.' });
        return;
      }
      const uid = String(targetUserId).trim();
      targetTokens = await getFCMTokensForUser(uid);
      recipientSummary = `User ${uid}`;
    } else if (targetType === 'match') {
      if (!targetMatchId) {
        res.status(400).json({ success: false, error: 'targetMatchId is required when targetType is match.' });
        return;
      }
      const mid = String(targetMatchId).trim();
      const matchData = await getFCMTokensForMatchParticipants(mid);
      targetTokens = matchData.tokens;
      recipientSummary = `Match ${mid} (${matchData.userIds.length} participants)`;
    } else {
      // 'all'
      targetTokens = await getAllFCMTokens();
      recipientSummary = 'All active app users';
    }

    if (targetTokens.length === 0) {
      processedEventIds.set(cleanEventId, { timestamp: Date.now(), type: 'CUSTOM', count: 0 });
      res.json({
        success: false,
        noTokens: true,
        eventId: cleanEventId,
        recipientSummary,
        message: `No active FCM device tokens found for ${recipientSummary}.`
      });
      return;
    }

    const result = await sendFcmNotificationToTokens({
      tokens: targetTokens,
      title: cleanTitle,
      body: cleanMessage,
      imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
      link: link ? String(link).trim() : undefined,
      data: {
        type: 'CUSTOM',
        eventId: cleanEventId,
        targetType,
        targetUserId: targetUserId ? String(targetUserId) : '',
        targetMatchId: targetMatchId ? String(targetMatchId) : '',
        timestamp: new Date().toISOString()
      }
    });

    processedEventIds.set(cleanEventId, {
      timestamp: Date.now(),
      type: 'CUSTOM',
      count: result.successCount
    });

    res.json({
      ...result,
      eventId: cleanEventId,
      recipientSummary
    });
  } catch (err: any) {
    console.error('[send-custom error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 5. VITE & STATIC FILE SERVING
// =================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WINX7 Backend Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
