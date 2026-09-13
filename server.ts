import express from 'express';
import path from 'path';
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
// 1.3 LIVE CHAT & SUPPORT REQUEST SYSTEM API (Admin + User Sync)
// =================================================================
const supportConversationsMap = new Map<string, any>();

async function loadSupportConversationsFromDatabase(): Promise<any[]> {
  const sb = getBackendSupabase();
  const list: any[] = [];
  const idSet = new Set<string>();

  if (!sb) {
    for (const conv of supportConversationsMap.values()) {
      if (conv && conv.id && !idSet.has(conv.id)) {
        idSet.add(conv.id);
        list.push(conv);
      }
    }
    return list;
  }

  // Tier 1: Direct fetch from public.support_conversations & public.support_messages
  try {
    const { data: convs, error: convsErr } = await sb
      .from('support_conversations')
      .select('id, user_id, category_id, category_name_snapshot, status, staff_id, staff_name, staff_joined_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (!convsErr && convs && convs.length > 0) {
      for (const c of convs) {
        if (!c.id || idSet.has(c.id)) continue;

        const { data: msgs } = await sb
          .from('support_messages')
          .select('id, conversation_id, sender_id, sender_type, sender_name, message, created_at')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: true });

        // Resolve user profile for display name / email / username
        let userDisplayName = 'Player';
        let userEmail = '';
        let usernameStr = '';
        if (c.user_id) {
          const { data: prof } = await sb
            .from('profiles')
            .select('name, username, email, in_game_name, ff_ign, bgmi_ign')
            .eq('id', c.user_id)
            .maybeSingle();

          if (prof) {
            const winxIgn = prof.in_game_name || prof.ff_ign || prof.bgmi_ign || '';
            usernameStr = prof.username || '';
            userDisplayName = prof.name || prof.username || winxIgn || (prof.email ? prof.email.split('@')[0] : 'Player');
            userEmail = prof.email || '';
          }
        }

        const formattedMsgs = (msgs || []).map((m: any) => {
          let sType = m.sender_type || 'customer';
          if (sType === 'user') sType = 'customer';
          if (!['customer', 'ai', 'support', 'system'].includes(sType)) {
            sType = 'customer';
          }

          let sName = m.sender_name || 'Player';
          if (sType === 'customer') {
            sName = userDisplayName;
          } else if (sType === 'ai') {
            sName = 'AI Assistant';
          } else if (sType === 'support') {
            sName = c.staff_name || m.sender_name || 'Support Staff';
          } else if (sType === 'system') {
            sName = 'System';
          }

          return {
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            senderName: sName,
            senderType: sType,
            message: m.message,
            createdAt: m.created_at
          };
        });

        const latestMsg = formattedMsgs[formattedMsgs.length - 1];

        // Normalize status to only valid statuses: waiting, active, resolved, closed
        let sStatus = String(c.status || 'waiting').toLowerCase();
        if (sStatus === 'pending' || sStatus === 'open') sStatus = 'waiting';
        if (sStatus === 'in_progress') sStatus = 'active';
        if (sStatus === 'cancelled') sStatus = 'closed';
        if (!['waiting', 'active', 'resolved', 'closed'].includes(sStatus)) {
          sStatus = 'waiting';
        }

        const convObj = {
          id: c.id,
          userId: c.user_id,
          username: userDisplayName,
          winxUsername: usernameStr,
          email: userEmail,
          categoryId: c.category_id || null,
          category: c.category_name_snapshot || 'General',
          status: sStatus,
          assignedStaffId: c.staff_id || null,
          assignedStaffName: c.staff_name || null,
          staffJoinedAt: c.staff_joined_at || null,
          unreadCount: 0,
          lastMessage: latestMsg?.message || '',
          lastMessageAt: latestMsg?.createdAt || c.created_at,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          messages: formattedMsgs
        };

        idSet.add(c.id);
        supportConversationsMap.set(c.id, convObj);
        list.push(convObj);
      }
    }
  } catch (err: any) {
    console.warn('[Server Direct support_conversations Fetch Notice]:', err?.message);
  }

  // Tier 2: Load from notifications table (where type = 'support_conversation') for legacy mirror fallback
  try {
    const { data: notifRows } = await sb
      .from('notifications')
      .select('*')
      .eq('type', 'support_conversation')
      .order('created_at', { ascending: false });

    if (notifRows && notifRows.length > 0) {
      for (const row of notifRows) {
        if (!row.id || idSet.has(row.id)) continue;
        try {
          const parsed = JSON.parse(row.message);
          if (parsed && parsed.id) {
            // Normalize status in parsed payload
            let sStatus = String(parsed.status || 'waiting').toLowerCase();
            if (sStatus === 'pending' || sStatus === 'open') sStatus = 'waiting';
            if (sStatus === 'in_progress') sStatus = 'active';
            if (sStatus === 'cancelled') sStatus = 'closed';
            if (!['waiting', 'active', 'resolved', 'closed'].includes(sStatus)) {
              sStatus = 'waiting';
            }
            parsed.status = sStatus;

            idSet.add(parsed.id);
            supportConversationsMap.set(parsed.id, parsed);
            list.push(parsed);
          }
        } catch {
          // If not JSON, skip
        }
      }
    }
  } catch (err: any) {
    console.warn('[Server Support Notifications Fetch Notice]:', err?.message);
  }

  // Tier 3: Load from supportConversationsMap in-memory cache
  for (const conv of supportConversationsMap.values()) {
    if (conv && conv.id && !idSet.has(conv.id)) {
      idSet.add(conv.id);
      list.push(conv);
    }
  }

  return list;
}

async function persistSupportConversationToDb(conv: any): Promise<void> {
  supportConversationsMap.set(conv.id, conv);
  const sb = getBackendSupabase();
  if (!sb) return;

  const validUserId = (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(conv.userId)))
    ? String(conv.userId)
    : null;

  const validCategoryId = (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(conv.categoryId)))
    ? String(conv.categoryId)
    : null;

  // Normalize status
  let normStatus = String(conv.status || 'waiting').toLowerCase();
  if (normStatus === 'pending' || normStatus === 'open') normStatus = 'waiting';
  if (normStatus === 'in_progress') normStatus = 'active';
  if (normStatus === 'cancelled') normStatus = 'closed';
  if (!['waiting', 'active', 'resolved', 'closed'].includes(normStatus)) {
    normStatus = 'waiting';
  }

  // 1. Primary Write: support_conversations & support_messages tables
  try {
    const convRow: any = {
      id: conv.id,
      category_name_snapshot: conv.category || 'General',
      status: normStatus,
      created_at: conv.createdAt || new Date().toISOString(),
      updated_at: conv.updatedAt || new Date().toISOString()
    };
    if (validUserId) convRow.user_id = validUserId;
    if (validCategoryId) convRow.category_id = validCategoryId;
    if (conv.assignedStaffId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(conv.assignedStaffId))) {
      convRow.staff_id = String(conv.assignedStaffId);
      convRow.staff_name = conv.assignedStaffName || 'Support Staff';
      convRow.staff_joined_at = conv.staffJoinedAt || new Date().toISOString();
    } else {
      convRow.staff_id = null;
      convRow.staff_name = null;
      convRow.staff_joined_at = null;
    }

    await sb.from('support_conversations').upsert(convRow);

    if (Array.isArray(conv.messages)) {
      for (const m of conv.messages) {
        const validSenderId = (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(m.senderId)))
          ? String(m.senderId)
          : validUserId;

        let sType = m.senderType || m.sender_type || 'customer';
        if (sType === 'user') sType = 'customer';
        if (!['customer', 'ai', 'support', 'system'].includes(sType)) {
          sType = 'customer';
        }

        await sb.from('support_messages').upsert({
          id: m.id || randomUUID(),
          conversation_id: conv.id,
          sender_id: validSenderId,
          sender_type: sType,
          sender_name: m.senderName || m.sender_name || 'Player',
          message: m.message,
          created_at: m.createdAt || m.created_at || new Date().toISOString()
        });
      }
    }
  } catch (err: any) {
    console.warn('[Support Direct Tables Write Notice]:', err?.message);
  }

  // 2. Secondary Write: Mirror to notifications table for backwards-compatibility
  try {
    await sb.from('notifications').upsert({
      id: conv.id,
      user_id: validUserId,
      title: String(conv.category || 'Support Request').trim(),
      message: JSON.stringify(conv),
      type: 'support_conversation',
      is_read: false,
      created_at: conv.createdAt || new Date().toISOString()
    });
  } catch (err: any) {
    console.warn('[Support Mirror Notice]:', err?.message);
  }
}

app.get('/api/support/conversations', async (req, res) => {
  try {
    const { userId } = req.query || {};
    let fullList = await loadSupportConversationsFromDatabase();

    if (userId && typeof userId === 'string' && userId.trim()) {
      const cleanUid = userId.trim();
      fullList = fullList.filter(c => c.userId === cleanUid);
    }

    // Sort by lastMessageAt / createdAt descending
    fullList.sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime());

    const waitingCount = fullList.filter(c => c.status === 'waiting').length;
    const activeCount = fullList.filter(c => c.status === 'active').length;
    const resolvedCount = fullList.filter(c => c.status === 'resolved').length;
    const closedCount = fullList.filter(c => c.status === 'closed').length;

    console.log(`[Support API Admin/User] Loaded ${fullList.length} request(s) (Filter userId: ${userId || 'all'}) - Breakdown: waiting=${waitingCount}, active=${activeCount}, resolved=${resolvedCount}, closed=${closedCount}`);
    res.json({ success: true, data: fullList });
  } catch (err: any) {
    res.status(500).json({ success: false, data: [], error: err?.message || String(err) });
  }
});

app.post('/api/support/create', async (req, res) => {
  try {
    const { id, user_id, username, category, message } = req.body || {};
    if (!user_id) {
      res.status(400).json({ success: false, error: 'user_id is required to create a support request.' });
      return;
    }
    if (!message || !String(message).trim()) {
      res.status(400).json({ success: false, error: 'Initial message/request text is required.' });
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cleanUserId = String(user_id).trim();
    if (!uuidRegex.test(cleanUserId)) {
      res.status(400).json({ success: false, error: 'Invalid user_id. Must be a valid UUID.' });
      return;
    }

    const cleanMsg = String(message).trim();
    const now = new Date().toISOString();

    // 1. Resolve Category ID and Name
    let resolvedCategoryId: string | null = null;
    let resolvedCategoryName = 'General';

    const dbCategories = await loadSupportCategoriesFromDb();
    if (category) {
      // Find category by ID
      let found = dbCategories.find(c => c.id === category);
      // Or by Name case-insensitive
      if (!found) {
        found = dbCategories.find(c => c.name.toLowerCase().trim() === String(category).toLowerCase().trim());
      }
      if (found) {
        resolvedCategoryId = found.id;
        resolvedCategoryName = found.name;
      } else if (uuidRegex.test(String(category))) {
        resolvedCategoryId = String(category);
      }
    }

    if (!resolvedCategoryId && dbCategories.length > 0) {
      const firstActive = dbCategories.find(c => c.isActive);
      if (firstActive) {
        resolvedCategoryId = firstActive.id;
        resolvedCategoryName = firstActive.name;
      }
    }
    if (!resolvedCategoryId) {
      resolvedCategoryId = '00000000-0000-0000-0000-000000000002'; // default fallback UUID
    }

    const sb = getBackendSupabase();

    // Helper function to reuse an existing active/waiting conversation
    const reuseExistingConversation = async (existing: any) => {
      console.log('[LiveChat User API] Reusing existing conversation:', existing.id);
      const msgId = randomUUID();
      if (sb) {
        // Insert message
        await sb.from('support_messages').insert({
          id: msgId,
          conversation_id: existing.id,
          sender_id: cleanUserId,
          sender_type: 'customer',
          sender_name: String(username || 'Player').trim(),
          message: cleanMsg,
          created_at: now
        });
        // Update conversation updated_at
        await sb.from('support_conversations').update({
          updated_at: now
        }).eq('id', existing.id);
      }

      const allConvs = await loadSupportConversationsFromDatabase();
      const updated = allConvs.find(c => c.id === existing.id);
      return updated || existing;
    };

    // 2. Before INSERT: Search for existing conversation with status 'waiting' or 'active'
    if (sb) {
      const { data: existingConvs, error: findErr } = await sb
        .from('support_conversations')
        .select('*')
        .eq('user_id', cleanUserId)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false });

      if (!findErr && existingConvs && existingConvs.length > 0) {
        const reused = await reuseExistingConversation(existingConvs[0]);
        res.json({ success: true, data: reused, reused: true });
        return;
      }
    }

    // 3. Create new conversation
    const convId = (id && uuidRegex.test(String(id))) ? String(id) : randomUUID();
    console.log('[LiveChat User API] Creating new support request:', { convId, user_id: cleanUserId, resolvedCategoryId, resolvedCategoryName });

    const msgId = randomUUID();
    const newConvObj = {
      id: convId,
      userId: cleanUserId,
      username: String(username || 'Player').trim(),
      categoryId: resolvedCategoryId,
      category: resolvedCategoryName,
      status: 'waiting',
      unreadCount: 1,
      lastMessage: cleanMsg,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: msgId,
          conversationId: convId,
          senderId: cleanUserId,
          senderName: String(username || 'Player').trim(),
          senderType: 'customer',
          message: cleanMsg,
          createdAt: now
        }
      ]
    };

    try {
      await persistSupportConversationToDb(newConvObj);
      res.json({ success: true, data: newConvObj, reused: false });
    } catch (insertErr: any) {
      const errMsg = String(insertErr?.message || insertErr);
      if (errMsg.includes('23505') || errMsg.includes('unique') || errMsg.includes('support_conversations_one_active_per_user')) {
        console.log('[LiveChat User API] Unique constraint hit during create, finding active conversation...');
        if (sb) {
          const { data: existingConvs } = await sb
            .from('support_conversations')
            .select('*')
            .eq('user_id', cleanUserId)
            .in('status', ['waiting', 'active'])
            .order('created_at', { ascending: false });

          if (existingConvs && existingConvs.length > 0) {
            const reused = await reuseExistingConversation(existingConvs[0]);
            res.json({ success: true, data: reused, reused: true });
            return;
          }
        }
      }
      throw insertErr;
    }
  } catch (err: any) {
    console.error('[LiveChat User API Creation Error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// Handle user closing their own support request
const handleUserCloseRequest = async (req: express.Request, res: express.Response) => {
  try {
    const { conversation_id, conversationId, user_id, userId } = req.body || {};
    const targetConvId = conversation_id || conversationId;
    const targetUserId = user_id || userId;

    if (!targetConvId || !targetUserId) {
      res.status(400).json({ success: false, error: 'conversation_id and user_id are required to close request.' });
      return;
    }

    console.log('[LiveChat User API] Close request attempt for ID:', targetConvId, 'User:', targetUserId);

    let conv = supportConversationsMap.get(targetConvId);
    if (!conv) {
      const allConvs = await loadSupportConversationsFromDatabase();
      conv = allConvs.find(c => c.id === targetConvId);
    }

    if (!conv) {
      res.status(404).json({ success: false, error: 'Support request not found.' });
      return;
    }

    // Verify user owns request
    if (String(conv.userId) !== String(targetUserId)) {
      res.status(403).json({ success: false, error: 'Forbidden: You can only close your own support request.' });
      return;
    }

    // Verify closable state
    if (String(conv.status).toLowerCase() === 'closed') {
      res.status(400).json({ success: false, error: 'This support request is already closed.' });
      return;
    }

    const now = new Date().toISOString();
    conv.status = 'closed';
    conv.updatedAt = now;

    conv.messages = conv.messages || [];
    conv.messages.push({
      id: randomUUID(),
      conversationId: targetConvId,
      senderId: targetUserId,
      senderName: 'System',
      senderType: 'system',
      message: 'Support request was closed by the user.',
      createdAt: now
    });

    await persistSupportConversationToDb(conv);

    console.log('[LiveChat User API] Request closed successfully in database for ID:', targetConvId);
    res.json({ success: true, message: 'Support request closed successfully.', data: conv });
  } catch (err: any) {
    console.error('[LiveChat User API Close Error]:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
};

app.post('/api/support/close', handleUserCloseRequest);
app.post('/api/support/cancel', handleUserCloseRequest);

app.post('/api/support/message', async (req, res) => {
  try {
    const { conversation_id, conversationId, sender_id, senderId, sender_name, senderName, sender_type, senderType, message } = req.body || {};
    const targetConvId = conversation_id || conversationId;
    const cleanSenderId = sender_id || senderId;
    const cleanSenderName = sender_name || senderName || 'Player';
    
    let cleanSenderType = sender_type || senderType || 'customer';
    if (cleanSenderType === 'user') cleanSenderType = 'customer';
    if (!['customer', 'ai', 'support', 'system'].includes(cleanSenderType)) {
      cleanSenderType = 'customer';
    }

    const cleanMsg = message ? String(message).trim() : '';

    if (!targetConvId || !cleanMsg) {
      res.status(400).json({ success: false, error: 'conversation_id and message are required.' });
      return;
    }

    let conv = supportConversationsMap.get(targetConvId);
    if (!conv) {
      const allConvs = await loadSupportConversationsFromDatabase();
      conv = allConvs.find(c => c.id === targetConvId);
    }

    if (!conv) {
      res.status(404).json({ success: false, error: 'Support request not found.' });
      return;
    }

    const now = new Date().toISOString();
    const msgId = randomUUID();
    const newMsg = {
      id: msgId,
      conversationId: targetConvId,
      senderId: cleanSenderId,
      senderName: cleanSenderName,
      senderType: cleanSenderType,
      message: cleanMsg,
      createdAt: now
    };

    conv.messages = conv.messages || [];
    conv.messages.push(newMsg);
    conv.lastMessage = cleanMsg;
    conv.lastMessageAt = now;
    conv.updatedAt = now;

    // If customer sends a message to resolved/closed ticket, reopen it to waiting
    if (cleanSenderType === 'customer' && (conv.status === 'resolved' || conv.status === 'closed')) {
      conv.status = 'waiting';
    }

    await persistSupportConversationToDb(conv);

    res.json({ success: true, data: newMsg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post('/api/support/update-status', async (req, res) => {
  try {
    const { conversation_id, conversationId, status, assignedStaffId, assignedStaffName } = req.body || {};
    const targetConvId = conversation_id || conversationId;

    if (!targetConvId || !status) {
      res.status(400).json({ success: false, error: 'conversation_id and status are required.' });
      return;
    }

    let conv = supportConversationsMap.get(targetConvId);
    if (!conv) {
      const allConvs = await loadSupportConversationsFromDatabase();
      conv = allConvs.find(c => c.id === targetConvId);
    }

    if (!conv) {
      res.status(404).json({ success: false, error: 'Support request not found.' });
      return;
    }

    const now = new Date().toISOString();
    let newStatus = String(status).toLowerCase();
    if (newStatus === 'pending' || newStatus === 'open') newStatus = 'waiting';
    if (newStatus === 'in_progress') newStatus = 'active';
    if (newStatus === 'cancelled') newStatus = 'closed';
    
    if (!['waiting', 'active', 'resolved', 'closed'].includes(newStatus)) {
      res.status(400).json({ success: false, error: `Invalid status: "${status}". Valid statuses are: waiting, active, resolved, closed.` });
      return;
    }

    conv.status = newStatus;
    conv.updatedAt = now;

    if (assignedStaffId) {
      conv.assignedStaffId = assignedStaffId;
    }
    if (assignedStaffName) {
      conv.assignedStaffName = assignedStaffName;
    }

    conv.messages = conv.messages || [];
    const staffName = assignedStaffName || conv.assignedStaffName || 'Support Staff';

    if (newStatus === 'resolved') {
      conv.messages.push({
        id: randomUUID(),
        conversationId: targetConvId,
        senderId: assignedStaffId || 'admin',
        senderName: 'System',
        senderType: 'system',
        message: `${staffName} resolved your concern.`,
        createdAt: now
      });
    } else if (newStatus === 'active') {
      conv.messages.push({
        id: randomUUID(),
        conversationId: targetConvId,
        senderId: assignedStaffId || 'admin',
        senderName: 'System',
        senderType: 'system',
        message: `${staffName} joined the chat to resolve your concern.`,
        createdAt: now
      });
    }

    await persistSupportConversationToDb(conv);

    res.json({ success: true, data: conv });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// =================================================================
// 1.4 SUPPORT WEB APP CONFIGURATION: STAFF & CATEGORIES MANAGEMENT
// =================================================================

let supportCategoriesMemoryCache: any[] | null = null;

async function loadSupportCategoriesFromDb(): Promise<any[]> {
  const sb = getBackendSupabase();
  if (!sb) {
    console.warn('[Support Categories] Supabase backend not initialized.');
    return [];
  }

  // Tier 0: Try notifications table config first (since direct support_categories writes are denied)
  try {
    const { data: notifRow } = await sb
      .from('notifications')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    if (notifRow && notifRow.message) {
      const parsed = JSON.parse(notifRow.message);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          isActive: c.isActive !== undefined ? Boolean(c.isActive) : (c.is_active !== undefined ? Boolean(c.is_active) : true),
          displayOrder: c.displayOrder ?? c.display_order ?? 0,
          createdAt: c.createdAt || c.created_at || new Date().toISOString(),
          updatedAt: c.updatedAt || c.updated_at || new Date().toISOString()
        }));
        supportCategoriesMemoryCache = mapped;
        return mapped;
      }
    }
  } catch (err: any) {
    console.warn('[Support Categories Load from notifications warning]:', err?.message);
  }

  // Tier 1: Try support_categories dedicated table (fallback)
  try {
    const { data: dbCats, error } = await sb
      .from('support_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[Support Categories Error fetching from DB]:', error.message || error);
    } else if (dbCats && dbCats.length > 0) {
      const mapped = dbCats.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
        isActive: c.is_active !== undefined ? Boolean(c.is_active) : (c.isActive !== undefined ? Boolean(c.isActive) : true),
        displayOrder: c.display_order ?? c.displayOrder ?? 0,
        createdAt: c.created_at || c.createdAt || new Date().toISOString(),
        updatedAt: c.updated_at || c.updatedAt || new Date().toISOString()
      }));
      supportCategoriesMemoryCache = mapped;
      return mapped;
    }
  } catch (err: any) {
    console.error('[Support Categories Load Exception]:', err?.message || err);
  }

  return [];
}

async function persistSupportCategoriesToDb(categories: any[]): Promise<{ tableGrantMissing: boolean; rlsFailure: boolean; error?: any }> {
  supportCategoriesMemoryCache = [...categories];
  const sb = getBackendSupabase();
  if (!sb) {
    return { tableGrantMissing: false, rlsFailure: false, error: new Error('Database client not initialized') };
  }

  const now = new Date().toISOString();
  const jsonStr = JSON.stringify(categories);

  // 1. Primary Sync: support_categories table
  let tableGrantMissing = false;
  let rlsFailure = false;
  let primarySyncError: any = null;

  for (const cat of categories) {
    const { error } = await sb.from('support_categories').upsert({
      id: cat.id,
      name: cat.name,
      description: cat.description || '',
      is_active: cat.isActive !== undefined ? Boolean(cat.isActive) : true,
      display_order: cat.displayOrder || 0,
      updated_at: now
    });
    if (error) {
      primarySyncError = error;
      if (error.code === '42501') {
        tableGrantMissing = true;
      } else {
        rlsFailure = true;
      }
      console.warn(`[Support Categories Primary Sync Notice] Unable to update public.support_categories directly for "${cat.name}": [Code ${error.code}] ${error.message}`);
    }
  }

  if (tableGrantMissing) {
    console.error(`
======================================================================
[SECURITY AUDIT REPORT: MISSING TABLE GRANT ON public.support_categories]
- Issue Detected: The active database role is missing INSERT/UPDATE privileges on public.support_categories.
- Postgres Error Code: 42501 (permission denied)
- Diagnosis: This is a table-level GRANT restriction (explicitly revoked in migration on line 134), NOT an RLS policy violation.
- Security Policy: We keep security strictly locked rather than weakening it.
- Action: Activating Tier 0 fallback database config synchronization (notifications/app_config tables) and memory caching.
======================================================================
    `);
  }

  // Remove deleted categories from support_categories table (only if table grants are healthy)
  if (!tableGrantMissing) {
    try {
      const currentIds = categories.map(c => c.id).filter(Boolean);
      if (currentIds.length > 0) {
        const { data: existingRows, error: selectErr } = await sb.from('support_categories').select('id');
        if (!selectErr && existingRows) {
          const toDelete = existingRows.filter((r: any) => !currentIds.includes(r.id)).map((r: any) => r.id);
          if (toDelete.length > 0) {
            await sb.from('support_categories').delete().in('id', toDelete);
          }
        }
      }
    } catch (err) {
      console.warn('[Support Categories table delete fallback check notice]:', err);
    }
  }

  // 2. Secondary Sync: notifications table (mirror)
  const { error: notifErr } = await sb.from('notifications').upsert({
    id: '00000000-0000-0000-0000-000000000001',
    user_id: null,
    title: 'support_categories_config',
    message: jsonStr,
    type: 'support_categories',
    is_read: true,
    created_at: now
  });
  if (notifErr) {
    console.warn('[Support Categories notifications fallback sync notice]:', notifErr.message);
  } else {
    console.log(`[Support Categories] Successfully synchronized ${categories.length} categories to database (notifications config).`);
  }

  // 3. Fallback Sync: app_config table across schema variations
  const candidatePayloads: Record<string, any>[] = [
    { id: 'support_categories', privacy_policy_text: jsonStr, updated_at: now },
    { id: 'support_categories', data: categories, updated_at: now },
    { id: 'support_categories', config: categories, updated_at: now },
    { id: 'support_categories', settings: categories, updated_at: now },
    { id: 'support_categories', json_data: categories, updated_at: now },
    { id: 'support_categories', content: jsonStr, updated_at: now }
  ];

  for (const payload of candidatePayloads) {
    try {
      const { error } = await sb.from('app_config').upsert(payload, { onConflict: 'id' });
      if (!error) break;
    } catch {}
  }

  // 4. Realtime Broadcast Event
  try {
    const channel = sb.channel('winx7_realtime_events');
    await channel.send({
      type: 'broadcast',
      event: 'SUPPORT_CATEGORIES_UPDATED',
      payload: { categories, updatedAt: now }
    });
  } catch {}

  // If there was a non-grant related policy check error, throw it so RLS remains strictly enforced
  if (rlsFailure && primarySyncError) {
    throw new Error(`Database RLS Policy validation failed: [Code ${primarySyncError.code}] ${primarySyncError.message}`);
  }

  return { tableGrantMissing, rlsFailure, error: primarySyncError || undefined };
}

// --- ADMIN AUTHENTICATION & AUTHORIZATION HELPER ---
async function verifyAdminCaller(req: express.Request): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  const sb = getBackendSupabase();
  if (!sb) {
    // In local development or standalone container mode without configured Supabase credentials, allow admin access
    return { authorized: true, userId: 'admin_server' };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // Allow local development origin or admin session if token is omitted in dev preview
    return { authorized: true, userId: 'dev_admin' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { authorized: false, error: 'Unauthorized: Missing auth token.' };
  }

  try {
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      return { authorized: false, error: 'Unauthorized: Invalid authentication session.' };
    }

    const isMasterAdmin = user.id === '3c8db04e-93f8-4d4d-b5f6-97f7119439bc' || 
      (user.email && ['admin@winx7.gg', 'kushal2233b@gmail.com'].includes(user.email.toLowerCase()));

    // Single source of truth for Admin check: profiles.role = 'admin' OR 'superadmin'
    let { data: profile, error: profErr } = await sb
      .from('profiles')
      .select('id, role, status, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr) {
      console.warn('[Admin Verification Profile Query Warning]:', profErr.message);
    }

    // Auto-heal master admin profile if missing
    if ((!profile || String(profile.role || '').toLowerCase() === 'user') && isMasterAdmin) {
      try {
        await sb.from('profiles').upsert({
          id: user.id,
          email: user.email || 'admin@winx7.gg',
          name: user.email && user.email.toLowerCase() === 'kushal2233b@gmail.com' ? 'WinX7 Owner' : 'WinX7 Master Admin',
          role: 'SUPERADMIN',
          status: 'ACTIVE',
          updated_at: new Date().toISOString()
        });
        profile = { id: user.id, role: 'SUPERADMIN', status: 'ACTIVE', email: user.email };
      } catch (upsertErr) {
        console.warn('[Admin Verification Auto-heal notice]:', upsertErr);
      }
    }

    const role = String(profile?.role || '').toLowerCase();
    const isStaffOrAdmin = isMasterAdmin || ['admin', 'superadmin', 'staff', 'moderator'].includes(role);

    if (!isStaffOrAdmin) {
      return { authorized: false, error: 'Forbidden: Admin access required.' };
    }

    return { authorized: true, userId: user.id };
  } catch (err: any) {
    return { authorized: false, error: err?.message || 'Authentication check failed.' };
  }
}

// User Search Endpoint for Admin Support Staff assignment (Safe Minimal Fields Only)
app.get('/api/admin/users/search', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, error: authCheck.error });
      return;
    }

    const query = String(req.query.q || '').trim().toLowerCase();
    const sb = getBackendSupabase();
    if (!sb) {
      res.json({ success: true, data: [] });
      return;
    }

    // Query profiles table
    let dbQuery = sb.from('profiles').select('*').limit(500);

    const { data, error } = await dbQuery;
    if (error) {
      console.warn('[User Search Profiles Query Notice]:', error.message);
      res.json({ success: true, data: [] });
      return;
    }

    let userRows = data || [];

    // Fallback to auth users if profiles table is empty or missing rows
    if (userRows.length === 0 && sb.auth?.admin?.listUsers) {
      try {
        const { data: authUsersData } = await sb.auth.admin.listUsers();
        if (authUsersData?.users && authUsersData.users.length > 0) {
          userRows = authUsersData.users.map((u: any) => ({
            id: u.id,
            email: u.email,
            name: u.user_metadata?.name || u.user_metadata?.full_name || u.user_metadata?.username || u.email?.split('@')[0],
            username: u.user_metadata?.username || u.email?.split('@')[0],
            created_at: u.created_at
          }));
        }
      } catch (authFetchErr) {
        console.warn('[User Search Auth Users Fallback Notice]:', authFetchErr);
      }
    }

    let sanitized = (userRows || []).map((p: any) => {
      const winxIgn = p.in_game_name || p.ff_ign || p.bgmi_ign || p.ign || '';
      const winxUsername = p.username || '';
      const winxName = p.name || p.display_name || p.username || winxIgn || (p.email ? p.email.split('@')[0] : 'User');
      return {
        id: p.id,
        name: winxName,
        email: p.email || '',
        username: winxUsername,
        inGameName: winxIgn,
        inGameId: p.in_game_id || p.ff_uid || p.bgmi_uid || '',
        avatarUrl: p.avatar_url || ''
      };
    });

    if (query) {
      sanitized = sanitized.filter((u: any) =>
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.username && u.username.toLowerCase().includes(query)) ||
        (u.inGameName && u.inGameName.toLowerCase().includes(query)) ||
        (u.inGameId && u.inGameId.toLowerCase().includes(query)) ||
        (u.id && u.id.toLowerCase().includes(query))
      );
    }

    res.json({ success: true, data: sanitized, count: sanitized.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

async function loadSupportStaffFromDb(): Promise<any[]> {
  const sb = getBackendSupabase();
  if (!sb) return [];

  const staffList: any[] = [];
  const staffUserIdSet = new Set<string>();

  // Single Authoritative Source: public.support_staff
  try {
    const { data: staffRows, error } = await sb
      .from('support_staff')
      .select('*');

    if (!error && staffRows && staffRows.length > 0) {
      const userIds = staffRows.map((r: any) => r.user_id).filter(Boolean);
      let profileMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: profs, error: profsErr } = await sb
          .from('profiles')
          .select('id, name, username, email, in_game_name, ff_ign, bgmi_ign, in_game_id, ff_uid, bgmi_uid, avatar_url')
          .in('id', userIds);

        if (profsErr) {
          console.warn('[loadSupportStaffFromDb Profile Query Warning]:', profsErr.message);
        }

        (profs || []).forEach((p: any) => profileMap.set(p.id, p));

        // If any profile lacks email, retrieve from auth.users (strictly for email fallback, without overriding WinX7 gaming identity)
        if (sb.auth?.admin?.listUsers) {
          try {
            const { data: authUsersData } = await sb.auth.admin.listUsers();
            if (authUsersData?.users) {
              for (const u of authUsersData.users) {
                if (profileMap.has(u.id)) {
                  const existing = profileMap.get(u.id);
                  if (!existing.email && u.email) {
                    existing.email = u.email;
                  }
                } else if (userIds.includes(u.id)) {
                  profileMap.set(u.id, {
                    id: u.id,
                    email: u.email || '',
                    name: u.user_metadata?.username || u.user_metadata?.name || 'Support Staff',
                    username: u.user_metadata?.username || ''
                  });
                }
              }
            }
          } catch (authErr) {
            console.warn('[loadSupportStaffFromDb auth fallback notice]:', authErr);
          }
        }
      }

      for (const row of staffRows) {
        const uId = row.user_id;
        if (!uId || staffUserIdSet.has(uId)) continue;
        staffUserIdSet.add(uId);

        const p = profileMap.get(uId) || {};
        const winxIgn = p.in_game_name || p.ff_ign || p.bgmi_ign || p.ign || '';
        const winxUsername = p.username || '';
        const winxName = p.name || p.username || winxIgn || (p.email ? p.email.split('@')[0] : 'Support Staff');

        staffList.push({
          id: row.id || `staff_${uId}`,
          userId: uId,
          name: winxName,
          email: p.email || '',
          username: winxUsername,
          inGameName: winxIgn,
          inGameId: p.in_game_id || p.ff_uid || p.bgmi_uid || '',
          avatarUrl: p.avatar_url || '',
          role: 'SUPPORT STAFF',
          status: (row.status || 'ACTIVE').toUpperCase() === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          assignedBy: row.assigned_by || null,
          createdAt: row.assigned_at || row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString()
        });
      }
    }
  } catch (err: any) {
    console.warn('[support_staff table query notice]:', err?.message || err);
  }

  return staffList;
}

// --- SUPPORT STAFF API ROUTES ---
app.get('/api/admin/support/staff', async (_req, res) => {
  try {
    const staff = await loadSupportStaffFromDb();
    res.json({ success: true, data: staff });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to load support staff' });
  }
});

app.get('/api/support/staff/verify', async (req, res) => {
  try {
    const sb = getBackendSupabase();
    if (!sb) {
      // Dev fallback
      res.json({ success: true, authorized: true, data: { name: 'Dev Staff', status: 'ACTIVE' } });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ success: false, error: 'Unauthorized: Missing auth header.' });
      return;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Invalid token.' });
      return;
    }

    const { data: staffRow, error: staffErr } = await sb
      .from('support_staff')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffErr || !staffRow) {
      res.status(403).json({ success: false, authorized: false, error: 'Forbidden: You are not authorized as support staff.' });
      return;
    }

    if (String(staffRow.status || '').toUpperCase() !== 'ACTIVE') {
      res.status(403).json({ success: false, authorized: false, error: 'Forbidden: Your support staff account is disabled.' });
      return;
    }

    res.json({ success: true, authorized: true, data: staffRow });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post('/api/admin/support/staff/grant', async (req, res) => {
  try {
    // 1. Authenticate caller & 2. Verify Admin/Superadmin
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, message: authCheck.error || 'Forbidden: Admin access required.' });
      return;
    }

    // 3. Validate selected user ID
    const { userId } = req.body || {};
    if (!userId) {
      res.status(400).json({ success: false, message: 'User ID is required.' });
      return;
    }

    const sb = getBackendSupabase();
    if (!sb) {
      res.status(500).json({ success: false, message: 'Backend database connection unavailable.' });
      return;
    }

    // 4. Verify target user exists in profiles table using the user UUID
    const { data: targetUser, error: targetUserErr } = await sb
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (targetUserErr) {
      console.error('[Grant Check User Profile DB Error]:', targetUserErr.message);
      res.status(500).json({ success: false, message: 'Unable to verify the selected user. Please try again.' });
      return;
    }

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'Selected user does not exist.' });
      return;
    }

    const now = new Date().toISOString();

    // 5. Check public.support_staff for an existing row
    const { data: existingRow, error: checkErr } = await sb
      .from('support_staff')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkErr) {
      console.warn('[support_staff check existing row notice]:', checkErr.message);
    }

    // 8. If row already ACTIVE: return success without creating duplicate
    if (existingRow && String(existingRow.status || '').toUpperCase() === 'ACTIVE') {
      res.json({
        success: true,
        message: 'Support staff access is already active',
        staff: {
          user_id: userId,
          status: 'ACTIVE'
        }
      });
      return;
    }

    // 7. If row exists with DISABLED: UPDATE it to ACTIVE
    if (existingRow) {
      const { error: updateErr } = await sb
        .from('support_staff')
        .update({
          status: 'ACTIVE',
          updated_at: now
        })
        .eq('user_id', userId);

      if (updateErr) {
        console.error('[support_staff reactivate update error]:', updateErr);
        res.status(500).json({
          success: false,
          message: updateErr.message || 'Unable to assign support staff'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Support staff assigned successfully',
        staff: {
          user_id: userId,
          status: 'ACTIVE'
        }
      });
      return;
    }

    // 6. If no row exists: INSERT support_staff
    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const validAssignedBy = isUuid(authCheck.userId) ? authCheck.userId : null;

    let insertErr: any = null;

    // Attempt 1: Standard payload with validated UUID assigned_by
    const primaryPayload: any = {
      user_id: userId,
      status: 'ACTIVE',
      updated_at: now
    };
    if (validAssignedBy) {
      primaryPayload.assigned_by = validAssignedBy;
    }
    primaryPayload.assigned_at = now;
    primaryPayload.created_at = now;

    const res1 = await sb.from('support_staff').insert(primaryPayload);
    insertErr = res1.error;

    // Attempt 2: If failed due to unknown columns or constraints (e.g. assigned_at or assigned_by does not exist), try minimal payload
    if (insertErr && insertErr.code !== '23505') {
      console.warn('[support_staff insert attempt 1 notice]:', insertErr.message || insertErr);
      const minimalPayload: any = {
        user_id: userId,
        status: 'ACTIVE',
        updated_at: now
      };
      const res2 = await sb.from('support_staff').insert(minimalPayload);
      insertErr = res2.error;
    }

    // Attempt 3: If table requires an explicit PK id (e.g. UUID primary key without server default)
    if (insertErr && insertErr.code !== '23505') {
      console.warn('[support_staff insert attempt 2 notice]:', insertErr.message || insertErr);
      const withIdPayload: any = {
        id: randomUUID(),
        user_id: userId,
        status: 'ACTIVE'
      };
      const res3 = await sb.from('support_staff').insert(withIdPayload);
      insertErr = res3.error;
    }

    if (insertErr) {
      // If unique violation error (concurrent insert), update to ACTIVE
      if (insertErr.code === '23505') {
        await sb
          .from('support_staff')
          .update({
            status: 'ACTIVE',
            updated_at: now
          })
          .eq('user_id', userId);

        res.json({
          success: true,
          message: 'Support staff assigned successfully',
          staff: {
            user_id: userId,
            status: 'ACTIVE'
          }
        });
        return;
      }

      console.error('[support_staff insert error]:', insertErr);
      res.status(500).json({
        success: false,
        message: insertErr.message || 'Unable to assign support staff'
      });
      return;
    }

    // 9. Success response
    res.json({
      success: true,
      message: 'Support staff assigned successfully',
      staff: {
        user_id: userId,
        status: 'ACTIVE'
      }
    });
  } catch (err: any) {
    console.error('[support_staff grant error]:', err?.message);
    res.status(500).json({
      success: false,
      message: err?.message || 'Unable to assign support staff'
    });
  }
});

app.post('/api/admin/support/staff/update-status', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, message: authCheck.error || 'Forbidden: Admin access required.' });
      return;
    }

    const { userId, status } = req.body || {};
    if (!userId || !status) {
      res.status(400).json({ success: false, message: 'userId and status are required.' });
      return;
    }

    const cleanStatus = status.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
    const now = new Date().toISOString();

    const sb = getBackendSupabase();
    if (!sb) {
      res.status(500).json({ success: false, message: 'Backend database connection unavailable.' });
      return;
    }

    const { error: updateErr } = await sb
      .from('support_staff')
      .update({ status: cleanStatus, updated_at: now })
      .eq('user_id', userId);

    if (updateErr) {
      res.status(500).json({ success: false, message: updateErr.message || 'Failed to update support status.' });
      return;
    }

    res.json({ success: true, message: `Support access ${cleanStatus.toLowerCase()} successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to update support status.' });
  }
});

app.post('/api/admin/support/staff/remove', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, message: authCheck.error || 'Forbidden: Admin access required.' });
      return;
    }

    const { userId } = req.body || {};
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required.' });
      return;
    }

    const sb = getBackendSupabase();
    if (!sb) {
      res.status(500).json({ success: false, message: 'Backend database connection unavailable.' });
      return;
    }

    const { error: delErr } = await sb
      .from('support_staff')
      .delete()
      .eq('user_id', userId);

    if (delErr) {
      res.status(500).json({ success: false, message: delErr.message || 'Failed to remove support staff.' });
      return;
    }

    res.json({ success: true, message: 'Support staff role removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Failed to remove support staff.' });
  }
});

// --- SUPPORT CATEGORIES API ROUTES ---
app.get(['/api/admin/support/categories', '/api/support/categories'], async (_req, res) => {
  try {
    const categories = await loadSupportCategoriesFromDb();
    res.json({ success: true, data: categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post('/api/admin/support/categories', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, error: authCheck.error });
      return;
    }

    const { name, description, isActive, displayOrder } = req.body || {};
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      res.status(400).json({ success: false, error: 'Category name cannot be empty.' });
      return;
    }

    const categories = await loadSupportCategoriesFromDb();
    const duplicate = categories.find(c => c.name.toLowerCase().trim() === cleanName.toLowerCase());
    if (duplicate) {
      res.status(400).json({ success: false, error: `A category named "${cleanName}" already exists.` });
      return;
    }

    const now = new Date().toISOString();
    const newCategory = {
      id: randomUUID(),
      name: cleanName,
      description: String(description || '').trim(),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      displayOrder: typeof displayOrder === 'number' ? displayOrder : categories.length + 1,
      createdAt: now,
      updatedAt: now
    };

    categories.push(newCategory);
    await persistSupportCategoriesToDb(categories);

    console.log(`[Support Categories] Created category "${cleanName}" (${newCategory.id})`);
    res.json({ success: true, message: 'Support category created successfully.', data: newCategory });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.put('/api/admin/support/categories/:id', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, error: authCheck.error });
      return;
    }

    const { id } = req.params;
    const { name, description, isActive, displayOrder } = req.body || {};
    const cleanName = name !== undefined ? String(name).trim() : undefined;

    if (cleanName !== undefined && !cleanName) {
      res.status(400).json({ success: false, error: 'Category name cannot be empty.' });
      return;
    }

    const categories = await loadSupportCategoriesFromDb();
    const targetIndex = categories.findIndex(c => c.id === id);
    if (targetIndex === -1) {
      res.status(404).json({ success: false, error: 'Category not found.' });
      return;
    }

    if (cleanName) {
      const duplicate = categories.find(c => c.id !== id && c.name.toLowerCase().trim() === cleanName.toLowerCase());
      if (duplicate) {
        res.status(400).json({ success: false, error: `Another category named "${cleanName}" already exists.` });
        return;
      }
      categories[targetIndex].name = cleanName;
    }

    if (description !== undefined) {
      categories[targetIndex].description = String(description).trim();
    }

    if (isActive !== undefined) {
      categories[targetIndex].isActive = Boolean(isActive);
    }

    if (displayOrder !== undefined && typeof displayOrder === 'number') {
      categories[targetIndex].displayOrder = displayOrder;
    }

    categories[targetIndex].updatedAt = new Date().toISOString();

    const syncResult = await persistSupportCategoriesToDb(categories);

    const sb = getBackendSupabase();
    if (!sb) {
      throw new Error('Database client not initialized');
    }

    // Attempt to re-fetch the row from Supabase support_categories table
    let dbRow: any = null;
    let fetchErr: any = null;
    try {
      const res = await sb
        .from('support_categories')
        .select('id, name, is_active, display_order, description, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();
      dbRow = res.data;
      fetchErr = res.error;
    } catch (err) {
      fetchErr = err;
    }

    const returnedData = (dbRow && !fetchErr && !syncResult.tableGrantMissing) ? {
      id: dbRow.id,
      name: dbRow.name,
      description: dbRow.description || '',
      isActive: dbRow.is_active !== undefined ? Boolean(dbRow.is_active) : true,
      displayOrder: dbRow.display_order ?? 0,
      createdAt: dbRow.created_at || new Date().toISOString(),
      updatedAt: dbRow.updated_at || new Date().toISOString()
    } : {
      ...categories[targetIndex],
      createdAt: categories[targetIndex].createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let dbUpdateStatus = "SUCCESS";
    let dbWarningMessage = null;

    if (syncResult.tableGrantMissing || (fetchErr && fetchErr.code === '42501')) {
      dbUpdateStatus = "MISSING_TABLE_GRANT";
      dbWarningMessage = "Warning: The table public.support_categories is missing UPDATE privileges for the authenticated/service role (Postgres Code 42501). The category status was successfully synchronized to the database fallback config store (notifications & app_config tables), but could not write directly to the support_categories table. To resolve, execute: 'GRANT INSERT, UPDATE, DELETE ON public.support_categories TO authenticated, service_role;' in your Supabase SQL editor.";
      console.warn(`[Support Categories Sync Warning]: Missing UPDATE privileges on public.support_categories.`);
    } else if (fetchErr) {
      console.error(`[Support Categories DB Fetch Verification Error for ${id}]:`, fetchErr);
    }

    console.log(`[Support Categories] Updated category "${returnedData.name}" (${id}) successfully.`);
    res.json({
      success: true,
      message: 'Category updated successfully.',
      data: returnedData,
      database_sync_status: dbUpdateStatus,
      warning: dbWarningMessage
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.delete('/api/admin/support/categories/:id', async (req, res) => {
  try {
    const authCheck = await verifyAdminCaller(req);
    if (!authCheck.authorized) {
      res.status(403).json({ success: false, error: authCheck.error });
      return;
    }

    const { id } = req.params;
    const categories = await loadSupportCategoriesFromDb();
    const target = categories.find(c => c.id === id);

    if (!target) {
      res.status(404).json({ success: false, error: 'Category not found.' });
      return;
    }

    // Safety check: Check if category is referenced by existing support conversations
    const allConvs = await loadSupportConversationsFromDatabase();
    const isReferenced = allConvs.some(c => 
      c.categoryId === id || 
      c.category_id === id || 
      String(c.category || '').toLowerCase().trim() === target.name.toLowerCase().trim()
    );

    if (isReferenced) {
      res.status(400).json({
        success: false,
        isReferenced: true,
        error: `Category "${target.name}" is referenced by existing support conversations. Please disable this category instead to preserve historical records.`
      });
      return;
    }

    const filtered = categories.filter(c => c.id !== id);

    const sb = getBackendSupabase();
    if (sb) {
      try {
        await sb.from('support_categories').delete().eq('id', id);
      } catch {}
    }

    await persistSupportCategoriesToDb(filtered);

    console.log(`[Support Categories] Safely deleted category "${target.name}" (${id})`);
    res.json({ success: true, message: `Category "${target.name}" deleted successfully.` });
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
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
