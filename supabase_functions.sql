-- ==========================================
-- SUPABASE ATOMIC RPC TRANSACTION FUNCTIONS
-- ==========================================
-- Execute this entire script inside the Supabase SQL Editor (Dashboard -> SQL Editor)
-- to create the robust, secure, and atomic RPC functions for processing deposits.

-- ------------------------------------------
-- 1. APPROVE DEPOSIT RPC FUNCTION
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_deposit(
  p_transaction_id UUID,
  p_admin_note TEXT DEFAULT 'Approved by Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_tx_user_id UUID;
  v_tx_amount NUMERIC;
  v_tx_status TEXT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_has_profile_deposit_col BOOLEAN;
  v_has_profile_wallet_col BOOLEAN;
  v_notify_id UUID;
  v_now TIMESTAMP WITH TIME ZONE;
  v_updated_desc TEXT;
  
  -- Dynamic Notification Schema Detection
  v_has_target_user_id_col BOOLEAN;
  v_has_targetUserId_col BOOLEAN;
  v_has_user_id_col BOOLEAN;
  v_has_message_col BOOLEAN;
  v_has_sent_at_col BOOLEAN;
  v_has_is_read_col BOOLEAN;
  
  v_notif_query TEXT;
  v_notif_values TEXT;
BEGIN
  v_now := NOW();
  
  -- 1. Verify the authenticated caller is an authorized ADMIN, STAFF, or SUPERADMIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No active session. Please log in as an administrator.' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) NOT IN ('superadmin', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Forbidden: Only authorized Admin or Staff accounts can approve deposits. Current role: %', COALESCE(v_caller_role, 'none') USING ERRCODE = '42501';
  END IF;

  -- 2. Find the deposit request by its exact ID & lock it for update
  SELECT user_id, amount, status, type, description
  INTO v_tx_user_id, v_tx_amount, v_tx_status, v_tx_type, v_tx_desc
  FROM public.wallet_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_tx_user_id IS NULL THEN
    RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Verify its status is PENDING to prevent duplicate approval/double crediting
  IF LOWER(v_tx_status) != 'pending' THEN
    RAISE EXCEPTION 'Invalid State: Transaction % is already processed. Current status: %', p_transaction_id, v_tx_status USING ERRCODE = '55000';
  END IF;

  -- Verify it is a valid deposit transaction type
  IF LOWER(v_tx_type) NOT IN ('deposit', 'recharge', 'add_money') AND LOWER(v_tx_type) NOT LIKE '%deposit%' THEN
    RAISE EXCEPTION 'Invalid Type: Transaction % is of type "%". Only deposits can be approved here.', p_transaction_id, v_tx_type USING ERRCODE = '22023';
  END IF;

  IF v_tx_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid Amount: Deposit amount must be greater than zero. Amount: %', v_tx_amount USING ERRCODE = '22023';
  END IF;

  -- 4. Atomic PostgreSQL UPSERT based on user_id to prevent concurrency race conditions
  -- Note: We use user_id directly as the primary key as there is no id column.
  -- CRITICAL SCHEMA FIX: total_balance is a postgres GENERATED column, so we must NEVER 
  -- insert into or update total_balance. PostgreSQL computes it automatically.
  INSERT INTO public.wallets (
    user_id,
    deposit_balance,
    winning_balance,
    bonus_balance,
    created_at,
    updated_at
  ) VALUES (
    v_tx_user_id,
    v_tx_amount,
    0,
    0,
    v_now,
    v_now
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    deposit_balance = wallets.deposit_balance + EXCLUDED.deposit_balance,
    updated_at = v_now;

  -- Check if profiles has deposit_balance and wallet_balance columns dynamically
  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'deposit_balance'
      AND NOT attisdropped
  ) INTO v_has_profile_deposit_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'wallet_balance'
      AND NOT attisdropped
  ) INTO v_has_profile_wallet_col;

  -- 5. Synchronize profiles table mirror fields for full backward compatibility only if columns exist
  IF v_has_profile_deposit_col AND v_has_profile_wallet_col THEN
    UPDATE public.profiles
    SET
      deposit_balance = COALESCE(deposit_balance, 0) + v_tx_amount,
      wallet_balance = COALESCE(wallet_balance, 0) + v_tx_amount,
      updated_at = v_now
    WHERE id = v_tx_user_id;
  ELSIF v_has_profile_deposit_col THEN
    UPDATE public.profiles
    SET
      deposit_balance = COALESCE(deposit_balance, 0) + v_tx_amount,
      updated_at = v_now
    WHERE id = v_tx_user_id;
  ELSIF v_has_profile_wallet_col THEN
    UPDATE public.profiles
    SET
      wallet_balance = COALESCE(wallet_balance, 0) + v_tx_amount,
      updated_at = v_now
    WHERE id = v_tx_user_id;
  END IF;

  -- 6. Mark transaction as APPROVED in wallet_transactions
  v_updated_desc := COALESCE(v_tx_desc, '') || ' | Approved: ' || p_admin_note;
  UPDATE public.wallet_transactions
  SET
    status = 'approved',
    description = v_updated_desc
  WHERE id = p_transaction_id;

  -- 7. Insert Notification dynamically with schema-agnostic column mapping
  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'target_user_id'
      AND NOT attisdropped
  ) INTO v_has_target_user_id_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'targetUserId'
      AND NOT attisdropped
  ) INTO v_has_targetUserId_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'user_id'
      AND NOT attisdropped
  ) INTO v_has_user_id_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'message'
      AND NOT attisdropped
  ) INTO v_has_message_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'sent_at'
      AND NOT attisdropped
  ) INTO v_has_sent_at_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'is_read'
      AND NOT attisdropped
  ) INTO v_has_is_read_col;

  -- Build dynamic INSERT for notifications
  v_notif_query := 'INSERT INTO public.notifications (id, title';
  v_notif_values := 'VALUES ($1, $2';

  IF v_has_target_user_id_col THEN
    v_notif_query := v_notif_query || ', target_user_id';
    v_notif_values := v_notif_values || ', $3';
  ELSIF v_has_targetUserId_col THEN
    v_notif_query := v_notif_query || ', "targetUserId"';
    v_notif_values := v_notif_values || ', $3';
  ELSIF v_has_user_id_col THEN
    v_notif_query := v_notif_query || ', user_id';
    v_notif_values := v_notif_values || ', $3';
  END IF;

  IF v_has_message_col THEN
    v_notif_query := v_notif_query || ', message';
    v_notif_values := v_notif_values || ', $4';
  ELSE
    v_notif_query := v_notif_query || ', body';
    v_notif_values := v_notif_values || ', $4';
  END IF;

  v_notif_query := v_notif_query || ', type';
  v_notif_values := v_notif_values || ', $5';

  IF v_has_sent_at_col THEN
    v_notif_query := v_notif_query || ', sent_at';
    v_notif_values := v_notif_values || ', $6';
  ELSE
    v_notif_query := v_notif_query || ', created_at';
    v_notif_values := v_notif_values || ', $6';
  END IF;

  v_notif_query := v_notif_query || ', sent_by';
  v_notif_values := v_notif_values || ', $7';

  IF v_has_is_read_col THEN
    v_notif_query := v_notif_query || ', is_read';
    v_notif_values := v_notif_values || ', $8';
  ELSE
    v_notif_query := v_notif_query || ', read';
    v_notif_values := v_notif_values || ', $8';
  END IF;

  v_notif_query := v_notif_query || ') ' || v_notif_values || ')';

  v_notify_id := gen_random_uuid();
  EXECUTE v_notif_query USING 
    v_notify_id, 
    'Deposit Approved! 💰', 
    v_tx_user_id, 
    'Your deposit request of ₹' || v_tx_amount || ' has been approved and credited to your deposit wallet.',
    'deposit',
    v_now,
    'WinX7 Admin',
    false;

  RETURN jsonb_build_object(
    'success', true,
    'credited', true,
    'message', 'Deposit approved and credited successfully.',
    'amount', v_tx_amount,
    'user_id', v_tx_user_id
  );
END;
$$;


-- ------------------------------------------
-- 2. REJECT DEPOSIT RPC FUNCTION
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_deposit(
  p_transaction_id UUID,
  p_rejection_reason TEXT DEFAULT 'Rejected by Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_tx_user_id UUID;
  v_tx_amount NUMERIC;
  v_tx_status TEXT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_notify_id UUID;
  v_now TIMESTAMP WITH TIME ZONE;
  v_updated_desc TEXT;

  -- Dynamic Notification Schema Detection
  v_has_target_user_id_col BOOLEAN;
  v_has_targetUserId_col BOOLEAN;
  v_has_user_id_col BOOLEAN;
  v_has_message_col BOOLEAN;
  v_has_sent_at_col BOOLEAN;
  v_has_is_read_col BOOLEAN;
  
  v_notif_query TEXT;
  v_notif_values TEXT;
BEGIN
  v_now := NOW();

  -- 1. Verify caller role
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No active session.' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR LOWER(v_caller_role) NOT IN ('superadmin', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Forbidden: Only authorized Admin or Staff accounts can reject deposits.' USING ERRCODE = '42501';
  END IF;

  -- 2. Find transaction & lock
  SELECT user_id, amount, status, type, description
  INTO v_tx_user_id, v_tx_amount, v_tx_status, v_tx_type, v_tx_desc
  FROM public.wallet_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_tx_user_id IS NULL THEN
    RAISE EXCEPTION 'Transaction with ID % not found.', p_transaction_id USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(v_tx_status) != 'pending' THEN
    RAISE EXCEPTION 'Invalid State: Transaction % is already processed. Current status: %', p_transaction_id, v_tx_status USING ERRCODE = '55000';
  END IF;

  -- 3. Mark transaction as rejected (updating only status and description)
  v_updated_desc := COALESCE(v_tx_desc, '') || ' | Rejected: ' || p_rejection_reason;
  UPDATE public.wallet_transactions
  SET
    status = 'rejected',
    description = v_updated_desc
  WHERE id = p_transaction_id;

  -- 4. Send Notification dynamically with schema-agnostic column mapping
  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'target_user_id'
      AND NOT attisdropped
  ) INTO v_has_target_user_id_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'targetUserId'
      AND NOT attisdropped
  ) INTO v_has_targetUserId_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'user_id'
      AND NOT attisdropped
  ) INTO v_has_user_id_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'message'
      AND NOT attisdropped
  ) INTO v_has_message_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'sent_at'
      AND NOT attisdropped
  ) INTO v_has_sent_at_col;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.notifications'::regclass
      AND attname = 'is_read'
      AND NOT attisdropped
  ) INTO v_has_is_read_col;

  -- Build dynamic INSERT for notifications
  v_notif_query := 'INSERT INTO public.notifications (id, title';
  v_notif_values := 'VALUES ($1, $2';

  IF v_has_target_user_id_col THEN
    v_notif_query := v_notif_query || ', target_user_id';
    v_notif_values := v_notif_values || ', $3';
  ELSIF v_has_targetUserId_col THEN
    v_notif_query := v_notif_query || ', "targetUserId"';
    v_notif_values := v_notif_values || ', $3';
  ELSIF v_has_user_id_col THEN
    v_notif_query := v_notif_query || ', user_id';
    v_notif_values := v_notif_values || ', $3';
  END IF;

  IF v_has_message_col THEN
    v_notif_query := v_notif_query || ', message';
    v_notif_values := v_notif_values || ', $4';
  ELSE
    v_notif_query := v_notif_query || ', body';
    v_notif_values := v_notif_values || ', $4';
  END IF;

  v_notif_query := v_notif_query || ', type';
  v_notif_values := v_notif_values || ', $5';

  IF v_has_sent_at_col THEN
    v_notif_query := v_notif_query || ', sent_at';
    v_notif_values := v_notif_values || ', $6';
  ELSE
    v_notif_query := v_notif_query || ', created_at';
    v_notif_values := v_notif_values || ', $6';
  END IF;

  v_notif_query := v_notif_query || ', sent_by';
  v_notif_values := v_notif_values || ', $7';

  IF v_has_is_read_col THEN
    v_notif_query := v_notif_query || ', is_read';
    v_notif_values := v_notif_values || ', $8';
  ELSE
    v_notif_query := v_notif_query || ', read';
    v_notif_values := v_notif_values || ', $8';
  END IF;

  v_notif_query := v_notif_query || ') ' || v_notif_values || ')';

  v_notify_id := gen_random_uuid();
  EXECUTE v_notif_query USING 
    v_notify_id, 
    'Payment Request Rejected ❌', 
    v_tx_user_id, 
    'Your deposit request of ₹' || v_tx_amount || ' was rejected: ' || p_rejection_reason,
    'deposit',
    v_now,
    'WinX7 Admin',
    false;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Transaction rejected successfully.',
    'amount', v_tx_amount,
    'user_id', v_tx_user_id
  );
END;
$$;


-- ------------------------------------------
-- 3. REVOKE & GRANT PRIVILEGES (EXCLUDE PUBLIC)
-- ------------------------------------------
REVOKE EXECUTE ON FUNCTION public.approve_deposit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_deposit(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_deposit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_deposit(UUID, TEXT) TO authenticated;

-- ------------------------------------------
-- 4. REJECT WITHDRAWAL WITH REFUND RPC FUNCTION
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_withdrawal_with_refund(
  p_transaction_id UUID,
  p_rejection_reason TEXT,
  p_refund_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_tx_user_id UUID;
  v_tx_amount NUMERIC;
  v_tx_status TEXT;
  v_tx_type TEXT;
  v_tx_desc TEXT;
  v_now TIMESTAMP WITH TIME ZONE;
  v_refund_tx_id UUID;
  v_exists BOOLEAN;
BEGIN
  v_now := NOW();
  
  -- 1. Authorization check (simplified for brevity)
  v_caller_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND LOWER(role) IN ('superadmin', 'admin', 'staff')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Lock & Verify transaction
  SELECT user_id, amount, status, type, description
  INTO v_tx_user_id, v_tx_amount, v_tx_status, v_tx_type, v_tx_desc
  FROM public.wallet_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_tx_user_id IS NULL OR LOWER(v_tx_status) != 'pending' THEN
    RAISE EXCEPTION 'Invalid transaction or already processed.';
  END IF;

  -- 3. Reject withdrawal
  UPDATE public.wallet_transactions
  SET status = 'rejected', description = COALESCE(description, '') || ' | Rejected: ' || p_rejection_reason
  WHERE id = p_transaction_id;

  -- 4. Refund if enabled
  IF p_refund_enabled THEN
    -- Check for existing refund
    SELECT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_id = p_transaction_id::text AND type = 'refund') INTO v_exists;
    IF NOT v_exists THEN
      -- Credit Wallet
      UPDATE public.wallets
      SET deposit_balance = deposit_balance + v_tx_amount, updated_at = v_now
      WHERE user_id = v_tx_user_id;

      -- Audit Record
      INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
      VALUES (gen_random_uuid(), v_tx_user_id, v_tx_amount, 'refund', 'approved', 'Refund for withdrawal: ' || p_transaction_id, p_transaction_id::text, v_now);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------
-- 5. PUBLISH MATCH RESULTS RPC FUNCTION
-- ------------------------------------------
-- CORRECTED PUBLISH RESULTS RPC
-- ------------------------------------------
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.publish_match_results(
  p_match_id UUID,
  p_results JSONB -- Array of {user_id, rank, kills, prize_won}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
  v_prize NUMERIC;
  v_ref_id TEXT;
  v_count INTEGER := 0;
BEGIN
  -- 1. Authorization check: Admin, Superadmin, or Staff
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('superadmin', 'admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can publish match results.';
  END IF;

  -- 2. Prevent duplicate publishing
  IF EXISTS (
    SELECT 1 FROM public.tournaments 
    WHERE id = p_match_id AND (results_published = true OR status = 'COMPLETED')
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Results already published for this tournament.');
  END IF;

  -- 3. Process results
  FOR v_result IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_result->>'user_id')::UUID;
    v_prize := COALESCE((v_result->>'prize_won')::NUMERIC, 0);
    
    -- Idempotent Reference ID: TournamentID_UserID
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- 4. Update registration record (The authoritative source for players in this match)
    UPDATE public.registrations
    SET rank = (v_result->>'rank')::INTEGER, 
        kills = (v_result->>'kills')::INTEGER, 
        winnings = v_prize, 
        status = 'COMPLETED',
        updated_at = NOW()
    WHERE tournament_id = p_match_id 
      AND user_id = v_user_id;

    -- Only credit winnings if they were actually registered in this tournament
    IF FOUND THEN
      -- 5. Idempotent Prize Credit
      IF v_prize > 0 AND NOT EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE reference_id = v_ref_id AND user_id = v_user_id AND type = 'WINNING_PRIZE'
      ) THEN
        
        -- Update profiles (authoritative balance for this schema)
        UPDATE public.profiles
        SET winning_balance = COALESCE(winning_balance, 0) + v_prize,
            updated_at = NOW()
        WHERE id = v_user_id;

        -- Insert into transactions for audit and idempotency
        INSERT INTO public.transactions (
          id, user_id, amount, type, status, description, reference_id, created_at
        )
        VALUES (
          gen_random_uuid(), 
          v_user_id, 
          v_prize, 
          'WINNING_PRIZE', 
          'SUCCESS', 
          'Tournament Prize for Match: ' || p_match_id, 
          v_ref_id, 
          NOW()
        );
      END IF;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- 6. Mark tournament as finalized
  UPDATE public.tournaments 
  SET results_published = true, 
      completed_at = NOW(), 
      status = 'COMPLETED',
      updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Results published successfully. Winnings credited to profiles.',
    'processed_count', v_count
  );
END;
$$;


-- ------------------------------------------
-- 6. SYNC APP_CONFIG TO GENERAL TRIGGER
-- ------------------------------------------
DROP TRIGGER IF EXISTS tr_sync_app_config_to_general ON public.app_config;
DROP TRIGGER IF EXISTS sync_app_config_to_general_trigger ON public.app_config;
DROP TRIGGER IF EXISTS sync_app_config_trigger ON public.app_config;
DROP TRIGGER IF EXISTS app_config_sync_trigger ON public.app_config;
DROP TRIGGER IF EXISTS trigger_sync_app_config ON public.app_config;

DROP FUNCTION IF EXISTS public.sync_app_config_to_general() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_app_config_to_general()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_json JSONB;
  v_general_exists BOOLEAN;
  v_general_cols TEXT[];
  v_app_config_cols TEXT[];
  v_common_cols TEXT[];
  v_col TEXT;
  v_id_val TEXT;
  v_target_col TEXT;
  
  v_has_general_id BOOLEAN;
  v_has_general_key BOOLEAN;
  v_has_general_value BOOLEAN;
  v_has_general_data BOOLEAN;
  v_has_general_config BOOLEAN;
  v_has_general_settings BOOLEAN;
  v_has_general_content BOOLEAN;
  v_has_general_payload BOOLEAN;
  v_has_general_json_data BOOLEAN;
  v_has_general_updated_at BOOLEAN;
  
  v_json_content JSONB;
  v_sync_sql TEXT;
  v_set_clauses TEXT[];
  v_col_names TEXT[];
  v_col_placeholders TEXT[];
BEGIN
  -- 1. Safely convert NEW to JSONB
  v_new_json := to_jsonb(NEW);
  IF v_new_json IS NULL THEN
    RETURN NEW;
  END IF;

  v_id_val := COALESCE(
    v_new_json->>'id',
    v_new_json->>'key',
    v_new_json->>'config_id',
    v_new_json->>'name',
    'global'
  );

  v_json_content := COALESCE(
    CASE WHEN v_new_json ? 'data' THEN v_new_json->'data' ELSE NULL END,
    CASE WHEN v_new_json ? 'config' THEN v_new_json->'config' ELSE NULL END,
    CASE WHEN v_new_json ? 'settings' THEN v_new_json->'settings' ELSE NULL END,
    CASE WHEN v_new_json ? 'content' THEN v_new_json->'content' ELSE NULL END,
    CASE WHEN v_new_json ? 'payload' THEN v_new_json->'payload' ELSE NULL END,
    CASE WHEN v_new_json ? 'json_data' THEN v_new_json->'json_data' ELSE NULL END,
    CASE WHEN v_new_json ? 'value' THEN v_new_json->'value' ELSE NULL END,
    v_new_json
  );

  IF jsonb_typeof(v_json_content) = 'string' THEN
    BEGIN
      v_json_content := (v_json_content #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      -- ignore parsing error
    END;
  END IF;

  -- 2. Check if general table exists
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'general'
  ) INTO v_general_exists;

  IF NOT v_general_exists THEN
    RETURN NEW;
  END IF;

  -- 3. Introspect columns in public.general
  SELECT array_agg(column_name::text)
  INTO v_general_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'general';

  IF v_general_cols IS NULL OR array_length(v_general_cols, 1) = 0 THEN
    RETURN NEW;
  END IF;

  v_has_general_id := 'id' = ANY(v_general_cols);
  v_has_general_key := 'key' = ANY(v_general_cols);
  v_has_general_value := 'value' = ANY(v_general_cols);
  v_has_general_data := 'data' = ANY(v_general_cols);
  v_has_general_config := 'config' = ANY(v_general_cols);
  v_has_general_settings := 'settings' = ANY(v_general_cols);
  v_has_general_content := 'content' = ANY(v_general_cols);
  v_has_general_payload := 'payload' = ANY(v_general_cols);
  v_has_general_json_data := 'json_data' = ANY(v_general_cols);
  v_has_general_updated_at := 'updated_at' = ANY(v_general_cols);

  -- 4. Introspect columns in public.app_config
  SELECT array_agg(column_name::text)
  INTO v_app_config_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'app_config';

  SELECT array_agg(c)
  INTO v_common_cols
  FROM unnest(v_app_config_cols) AS c
  WHERE c = ANY(v_general_cols) AND c NOT IN ('id', 'key', 'created_at');

  -- 5. Dynamic Sync
  IF v_common_cols IS NOT NULL AND array_length(v_common_cols, 1) > 0 THEN
    v_set_clauses := ARRAY[]::TEXT[];
    v_col_names := ARRAY[]::TEXT[];
    v_col_placeholders := ARRAY[]::TEXT[];

    IF v_has_general_id THEN
      v_col_names := array_append(v_col_names, 'id');
      v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_id_val));
    ELSIF v_has_general_key THEN
      v_col_names := array_append(v_col_names, 'key');
      v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_id_val));
    END IF;

    FOREACH v_col IN ARRAY v_common_cols
    LOOP
      IF v_new_json ? v_col THEN
        v_col_names := array_append(v_col_names, quote_ident(v_col));
        v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_new_json->>v_col));
        v_set_clauses := array_append(v_set_clauses, quote_ident(v_col) || ' = ' || quote_literal(v_new_json->>v_col));
      END IF;
    END LOOP;

    IF v_has_general_updated_at AND NOT ('updated_at' = ANY(v_common_cols)) THEN
      v_col_names := array_append(v_col_names, 'updated_at');
      v_col_placeholders := array_append(v_col_placeholders, 'NOW()');
      v_set_clauses := array_append(v_set_clauses, 'updated_at = NOW()');
    END IF;

    IF array_length(v_col_names, 1) > 0 THEN
      IF v_has_general_id THEN
        v_sync_sql := 'INSERT INTO public.general (' || array_to_string(v_col_names, ', ') || ') ' ||
                      'VALUES (' || array_to_string(v_col_placeholders, ', ') || ') ' ||
                      'ON CONFLICT (id) DO UPDATE SET ' || array_to_string(v_set_clauses, ', ');
      ELSIF v_has_general_key THEN
        v_sync_sql := 'INSERT INTO public.general (' || array_to_string(v_col_names, ', ') || ') ' ||
                      'VALUES (' || array_to_string(v_col_placeholders, ', ') || ') ' ||
                      'ON CONFLICT (key) DO UPDATE SET ' || array_to_string(v_set_clauses, ', ');
      ELSE
        v_sync_sql := 'UPDATE public.general SET ' || array_to_string(v_set_clauses, ', ');
      END IF;

      BEGIN
        EXECUTE v_sync_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'sync_app_config_to_general column sync notice: %', SQLERRM;
      END;
    END IF;
  ELSE
    v_target_col := CASE 
      WHEN v_has_general_value THEN 'value'
      WHEN v_has_general_data THEN 'data'
      WHEN v_has_general_config THEN 'config'
      WHEN v_has_general_settings THEN 'settings'
      WHEN v_has_general_content THEN 'content'
      WHEN v_has_general_payload THEN 'payload'
      WHEN v_has_general_json_data THEN 'json_data'
      ELSE NULL
    END;

    IF v_target_col IS NOT NULL THEN
      IF v_has_general_id THEN
        v_sync_sql := 'INSERT INTO public.general (id, ' || quote_ident(v_target_col) || CASE WHEN v_has_general_updated_at THEN ', updated_at' ELSE '' END || ') ' ||
                      'VALUES ($1, $2' || CASE WHEN v_has_general_updated_at THEN ', NOW()' ELSE '' END || ') ' ||
                      'ON CONFLICT (id) DO UPDATE SET ' || quote_ident(v_target_col) || ' = EXCLUDED.' || quote_ident(v_target_col) ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_id_val, v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general json sync notice: %', SQLERRM;
        END;
      ELSIF v_has_general_key THEN
        v_sync_sql := 'INSERT INTO public.general (key, ' || quote_ident(v_target_col) || CASE WHEN v_has_general_updated_at THEN ', updated_at' ELSE '' END || ') ' ||
                      'VALUES ($1, $2' || CASE WHEN v_has_general_updated_at THEN ', NOW()' ELSE '' END || ') ' ||
                      'ON CONFLICT (key) DO UPDATE SET ' || quote_ident(v_target_col) || ' = EXCLUDED.' || quote_ident(v_target_col) ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_id_val, v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general json sync notice: %', SQLERRM;
        END;
      ELSE
        v_sync_sql := 'UPDATE public.general SET ' || quote_ident(v_target_col) || ' = $1' ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general update notice: %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_app_config_to_general warning: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_sync_app_config_to_general
AFTER INSERT OR UPDATE ON public.app_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_app_config_to_general();

GRANT EXECUTE ON FUNCTION public.sync_app_config_to_general() TO authenticated, service_role, anon;

