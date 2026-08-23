-- =========================================================================
-- WINX7 PRODUCTION-SAFE MATCH RESULTS PUBLISHING & RECONCILIATION MIGRATION
-- Copy and run this entire script in your Supabase SQL Editor
-- =========================================================================

-- STEP 1: Ensure unique indexes on reference_id for wallet_transactions and user_id for leaderboard
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_ref_id 
ON public.wallet_transactions (reference_id) 
WHERE reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_user_id 
ON public.leaderboard (user_id);

-- STEP 2: Drop existing function signatures to prevent overloading conflicts
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

-- STEP 3: Create the final production-safe publish_match_results RPC
CREATE OR REPLACE FUNCTION public.publish_match_results(
  p_match_id UUID,
  p_results JSONB -- Array of objects: [{"user_id": "...", "rank": 1, "kills": 5, "prize_won": 100}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_match_status TEXT;
  v_results_published BOOLEAN := FALSE;
  v_is_reconciliation BOOLEAN := FALSE;
  
  v_item JSONB;
  v_user_id UUID;
  v_rank INTEGER;
  v_kills INTEGER;
  v_prize NUMERIC;
  v_ref_id TEXT;
  
  v_user_exists BOOLEAN;
  v_is_registered BOOLEAN;
  v_tx_inserted INTEGER := 0;
  v_unprocessed_count INTEGER := 0;
  
  v_processed_count INTEGER := 0;
  v_total_prize_credited NUMERIC := 0;

  v_username TEXT;
  v_ign TEXT;
  v_avatar TEXT;
  v_is_win INTEGER;
  v_points INTEGER;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. AUTHORIZATION CHECK (Superadmin, Admin, or Staff required)
  -- -----------------------------------------------------------------------
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: No active user session detected.' USING ERRCODE = '42501';
  END IF;

  SELECT LOWER(role) INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superadmin', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Forbidden: Only authorized Admin or Staff accounts can publish match results. Current role: %', COALESCE(v_caller_role, 'none') USING ERRCODE = '42501';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. ROW-LEVEL LOCKING & TOURNAMENT VERIFICATION
  -- -----------------------------------------------------------------------
  SELECT status, COALESCE(results_published, FALSE)
  INTO v_match_status, v_results_published
  FROM public.tournaments
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Tournament with ID % not found.', p_match_id USING ERRCODE = 'P0002';
  END IF;

  IF UPPER(v_match_status) IN ('CANCELLED', 'CANCELED') THEN
    RAISE EXCEPTION 'Cannot publish results for a cancelled match (Status: %).', v_match_status USING ERRCODE = '55000';
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. PHASE 1: INPUT VALIDATION & UNPROCESSED PRE-CHECK
  -- -----------------------------------------------------------------------
  IF p_results IS NULL OR jsonb_typeof(p_results) != 'array' THEN
    RAISE EXCEPTION 'Invalid Input: p_results must be a JSON array of participant result objects.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_results) = 0 THEN
    RAISE EXCEPTION 'Invalid Input: p_results array cannot be empty.' USING ERRCODE = '22023';
  END IF;

  -- Validate every submitted player and check how many results are missing transactions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Invalid Input: Every result object must contain a valid user_id UUID.' USING ERRCODE = '22023';
    END IF;

    -- A) Verify user exists in public.profiles
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_user_id
    ) INTO v_user_exists;

    IF NOT v_user_exists THEN
      RAISE EXCEPTION 'Validation Error: User % does not exist in profiles. Aborting publication.', v_user_id USING ERRCODE = 'P0002';
    END IF;

    -- B) Verify user is registered for this tournament in public.registrations
    SELECT EXISTS (
      SELECT 1 FROM public.registrations
      WHERE tournament_id = p_match_id AND user_id = v_user_id
    ) INTO v_is_registered;

    IF NOT v_is_registered THEN
      RAISE EXCEPTION 'Validation Error: User % is not registered for tournament %. Aborting publication.', v_user_id, p_match_id USING ERRCODE = 'P0002';
    END IF;

    -- C) Validate numeric bounds
    v_rank := (v_item->>'rank')::INTEGER;
    v_kills := (v_item->>'kills')::INTEGER;
    v_prize := COALESCE((v_item->>'prize_won')::NUMERIC, (v_item->>'winnings')::NUMERIC, 0);

    IF v_rank IS NULL OR v_rank < 0 THEN
      RAISE EXCEPTION 'Validation Error: Invalid rank % for user %.', v_rank, v_user_id USING ERRCODE = '22023';
    END IF;

    IF v_kills IS NULL OR v_kills < 0 THEN
      RAISE EXCEPTION 'Validation Error: Invalid kills % for user %.', v_kills, v_user_id USING ERRCODE = '22023';
    END IF;

    IF v_prize IS NULL OR v_prize < 0 THEN
      RAISE EXCEPTION 'Validation Error: Invalid prize amount % for user %.', v_prize, v_user_id USING ERRCODE = '22023';
    END IF;

    -- D) Check if transaction already exists for this match & user
    v_ref_id := p_match_id::text || '_' || v_user_id::text;
    IF NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions WHERE reference_id = v_ref_id
    ) THEN
      v_unprocessed_count := v_unprocessed_count + 1;
    END IF;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- 4. IDEMPOTENCY EVALUATION
  --    If the tournament is already marked finished AND all submitted player
  --    results already have a transaction recorded, return immediately.
  -- -----------------------------------------------------------------------
  IF (v_results_published OR UPPER(v_match_status) IN ('COMPLETED', 'FINISHED')) THEN
    IF v_unprocessed_count = 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_published', true,
        'reconciliation_performed', false,
        'processed_count', 0,
        'total_prize_credited', 0,
        'message', 'Match results are already published and fully processed. Duplicate request ignored.'
      );
    ELSE
      -- Legacy or interrupted match: tournament status was completed, but some player transactions were missed.
      v_is_reconciliation := TRUE;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. PHASE 2: ATOMIC RESULT PROCESSING & IDEMPOTENT PRIZE CREDITING
  -- -----------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    v_rank := COALESCE((v_item->>'rank')::INTEGER, 0);
    v_kills := COALESCE((v_item->>'kills')::INTEGER, 0);
    v_prize := COALESCE((v_item->>'prize_won')::NUMERIC, (v_item->>'winnings')::NUMERIC, 0);
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- 5.1 Attempt atomic insert into wallet_transactions using unique reference_id.
    -- PostgreSQL's UNIQUE index on reference_id guarantees database-level race protection.
    INSERT INTO public.wallet_transactions (
      id, user_id, amount, type, status, description, reference_id, created_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_prize,
      CASE WHEN v_prize > 0 THEN 'WINNING_PRIZE' ELSE 'MATCH_RESULT' END,
      'approved',
      'Tournament Result for Match: ' || p_match_id::text,
      v_ref_id,
      NOW()
    )
    ON CONFLICT (reference_id) DO NOTHING;

    GET DIAGNOSTICS v_tx_inserted = ROW_COUNT;

    -- 5.2 If row was successfully inserted, this is the FIRST time processing this result.
    IF v_tx_inserted > 0 THEN
      -- A) Update player registration record
      UPDATE public.registrations
      SET 
        rank = v_rank,
        kills = v_kills,
        winnings = v_prize,
        prize_won = v_prize,
        status = 'COMPLETED',
        updated_at = NOW()
      WHERE tournament_id = p_match_id AND user_id = v_user_id;

      -- B) Credit Prize Winnings (ONLY if prize > 0)
      IF v_prize > 0 THEN
        -- 1. Authoritative Wallet Table (public.wallets)
        -- Note: total_balance is a PostgreSQL GENERATED column and is NOT updated directly.
        INSERT INTO public.wallets (
          user_id, deposit_balance, winning_balance, bonus_balance, created_at, updated_at
        ) VALUES (
          v_user_id, 0, v_prize, 0, NOW(), NOW()
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          winning_balance = COALESCE(wallets.winning_balance, 0) + EXCLUDED.winning_balance,
          updated_at = NOW();

        -- 2. Synchronize Mirror/Cache Fields in public.profiles
        UPDATE public.profiles
        SET
          winning_balance = COALESCE(winning_balance, 0) + v_prize,
          total_earnings = COALESCE(total_earnings, 0) + v_prize,
          updated_at = NOW()
        WHERE id = v_user_id;

        v_total_prize_credited := v_total_prize_credited + v_prize;
      END IF;

      -- C) Update Leaderboard (idempotently using UPSERT ON CONFLICT user_id)
      v_is_win := CASE WHEN v_rank = 1 THEN 1 ELSE 0 END;
      v_points := (v_is_win * 100) + (v_kills * 10);

      SELECT username, COALESCE(in_game_name, username), avatar_url
      INTO v_username, v_ign, v_avatar
      FROM public.profiles
      WHERE id = v_user_id;

      INSERT INTO public.leaderboard (
        id,
        user_id,
        username,
        in_game_name,
        avatar_url,
        matches_played,
        matches_won,
        total_kills,
        total_earnings,
        points,
        updated_at
      ) VALUES (
        'lb-' || v_user_id::text,
        v_user_id,
        COALESCE(v_username, 'Player'),
        COALESCE(v_ign, v_username, 'Player'),
        v_avatar,
        1,
        v_is_win,
        v_kills,
        v_prize,
        v_points,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, leaderboard.username),
        in_game_name = COALESCE(EXCLUDED.in_game_name, leaderboard.in_game_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, leaderboard.avatar_url),
        matches_played = COALESCE(leaderboard.matches_played, 0) + 1,
        matches_won = COALESCE(leaderboard.matches_won, 0) + EXCLUDED.matches_won,
        total_kills = COALESCE(leaderboard.total_kills, 0) + EXCLUDED.total_kills,
        total_earnings = COALESCE(leaderboard.total_earnings, 0) + EXCLUDED.total_earnings,
        points = COALESCE(leaderboard.points, 0) + EXCLUDED.points,
        updated_at = NOW();

      v_processed_count := v_processed_count + 1;
    END IF;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- 6. FINALIZE TOURNAMENT STATUS TO COMPLETED
  -- -----------------------------------------------------------------------
  UPDATE public.tournaments
  SET 
    status = 'COMPLETED',
    results_published = TRUE,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_match_id;

  -- -----------------------------------------------------------------------
  -- 7. RETURN SUCCESS RESPONSE PAYLOAD
  -- -----------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'already_published', COALESCE(v_results_published, false),
    'reconciliation_performed', v_is_reconciliation,
    'processed_count', v_processed_count,
    'total_prize_credited', v_total_prize_credited,
    'message', CASE 
      WHEN v_is_reconciliation THEN 'Match results reconciled successfully. Missing player prizes credited.'
      ELSE 'Match results published and player winnings credited successfully.'
    END
  );
END;
$$;

-- STEP 4: Grant execution permissions (Restrict anon)
REVOKE EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) TO authenticated, service_role;
