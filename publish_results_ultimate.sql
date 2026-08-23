-- =========================================================================
-- ULTIMATE SCHEMAS-ADAPTIVE RESULT PUBLISHING & REPAIR SCRIPT
-- Copy and run this entire script inside your Supabase SQL Editor
-- (Supabase Dashboard -> SQL Editor -> New Query -> paste & click Run)
-- =========================================================================

-- STEP 1: DROP the old function signatures to prevent duplication conflicts
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

-- STEP 2: CREATE the ultimate, dynamically-adaptive RPC function
CREATE OR REPLACE FUNCTION public.publish_match_results(
  p_match_id UUID,
  p_results JSONB -- Expected Array of {user_id, rank, kills, prize_won}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_status TEXT;
  v_is_published BOOLEAN := FALSE;
  v_item JSONB;
  v_user_id UUID;
  v_rank INTEGER;
  v_kills INTEGER;
  v_prize NUMERIC;
  v_ref_id TEXT;
  v_count INTEGER := 0;
  v_total_prize_credited NUMERIC := 0;
  
  -- Time variants for database compatibility
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  
  -- Schema checks
  v_tourn_completed_at_type TEXT;
  v_tourn_updated_at_type TEXT;
  v_regs_updated_at_type TEXT;
  v_prof_updated_at_type TEXT;
  v_tx_created_at_type TEXT;
  
  -- registrations table columns detection
  v_reg_tourn_col TEXT;
  v_reg_rank_col TEXT;
  v_reg_kills_col TEXT;
  v_reg_winnings_col TEXT;
  
  -- profiles table columns detection
  v_prof_winning_bal_col BOOLEAN;
  v_prof_wallet_bal_col BOOLEAN;
  v_prof_total_bal_col BOOLEAN;
  v_prof_total_win_col BOOLEAN;
  v_prof_username_col TEXT;
  v_prof_ign_col TEXT;
  
  -- wallet_transactions vs transactions table detection
  v_tx_table_name TEXT;
  v_tx_has_ref_id BOOLEAN;
  
  -- leaderboard detection
  v_has_leaderboard BOOLEAN;
  v_lb_username_col TEXT;
  v_lb_ign_col TEXT;
  
  -- wallets table detection
  v_has_wallets BOOLEAN;
  
  -- Query holders
  v_update_query TEXT;
  v_prof_update_query TEXT;
  v_tx_query TEXT;
  v_lb_query TEXT;
  
  -- Loop/Status variables
  v_user_exists BOOLEAN;
  v_is_registered BOOLEAN;
  v_tx_inserted BOOLEAN;
  v_is_win INTEGER;
  v_points INTEGER;
  v_username TEXT;
  v_ign TEXT;
  v_avatar TEXT;
  
  v_is_reconciliation BOOLEAN := FALSE;
  v_unprocessed_count INTEGER := 0;
BEGIN
  -- 1. Authorization check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('superadmin', 'admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can publish results.';
  END IF;

  -- 2. Verify tournament existence and status
  SELECT status, COALESCE(results_published, FALSE)
  INTO v_match_status, v_is_published
  FROM public.tournaments
  WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Tournament with ID % not found.', p_match_id USING ERRCODE = 'P0002';
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. RUNTIME SCHEMA DISCOVERY (Introspect table structures dynamically)
  -- -----------------------------------------------------------------------
  
  -- 3.1 Inspect registrations table
  SELECT column_name INTO v_reg_tourn_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('tournament_id', 'match_id') 
  LIMIT 1;
  
  SELECT column_name INTO v_reg_rank_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('rank_position', 'rank') 
  LIMIT 1;
  
  SELECT column_name INTO v_reg_kills_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'kills' 
  LIMIT 1;
  
  SELECT column_name INTO v_reg_winnings_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('winnings', 'prize_won') 
  LIMIT 1;
  
  -- 3.2 Inspect profiles table
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'winning_balance') INTO v_prof_winning_bal_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'wallet_balance') INTO v_prof_wallet_bal_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_balance') INTO v_prof_total_bal_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_earnings') INTO v_prof_total_win_col;

  SELECT column_name INTO v_prof_username_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('username', 'name', 'display_name') 
  LIMIT 1;

  SELECT column_name INTO v_prof_ign_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('ff_ign', 'in_game_name', 'player_name') 
  LIMIT 1;

  -- 3.3 Inspect transactions tables
  SELECT table_name INTO v_tx_table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('wallet_transactions', 'transactions')
  ORDER BY (CASE WHEN table_name = 'wallet_transactions' THEN 1 ELSE 2 END) LIMIT 1;
  
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_tx_table_name AND column_name = 'reference_id') INTO v_tx_has_ref_id;

  -- 3.4 Inspect leaderboard & wallets tables
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leaderboard') INTO v_has_leaderboard;
  
  SELECT column_name INTO v_lb_username_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name IN ('username', 'name') 
  LIMIT 1;

  SELECT column_name INTO v_lb_ign_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name IN ('in_game_name', 'ff_ign') 
  LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallets') INTO v_has_wallets;

  -- 3.5 Inspect date/time types
  SELECT data_type INTO v_tourn_completed_at_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'completed_at';
  SELECT data_type INTO v_tourn_updated_at_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'updated_at';
  SELECT data_type INTO v_regs_updated_at_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'updated_at';
  SELECT data_type INTO v_prof_updated_at_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at';
  SELECT data_type INTO v_tx_created_at_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = v_tx_table_name AND column_name = 'created_at';

  -- -----------------------------------------------------------------------
  -- 4. VALIDATION & PRE-FLIGHT LOOP (Verify accounts & registration)
  -- -----------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Invalid Input: Every result object must contain a valid user_id UUID.' USING ERRCODE = '22023';
    END IF;

    -- A) Verify user exists in profiles
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
      RAISE EXCEPTION 'Validation Error: User % does not exist in profiles. Aborting publication.', v_user_id USING ERRCODE = 'P0002';
    END IF;

    -- B) Verify user is registered for this tournament in registrations using the detected column name
    IF v_reg_tourn_col IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.registrations WHERE %I = $1 AND user_id = $2)', v_reg_tourn_col)
      USING p_match_id, v_user_id
      INTO v_is_registered;
      
      IF NOT v_is_registered THEN
        RAISE EXCEPTION 'Validation Error: User % is not registered for tournament %. Aborting publication.', v_user_id, p_match_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    -- C) Count remaining unprocessed prizes
    v_ref_id := p_match_id::text || '_' || v_user_id::text;
    IF v_tx_table_name IS NOT NULL THEN
      IF v_tx_has_ref_id THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE reference_id = $1)', v_tx_table_name)
        USING v_ref_id
        INTO v_tx_inserted;
      ELSE
        v_tx_inserted := FALSE;
      END IF;
      
      IF NOT v_tx_inserted THEN
        v_unprocessed_count := v_unprocessed_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- 5. IDEMPOTENCY EVALUATION
  -- -----------------------------------------------------------------------
  IF (v_is_published OR UPPER(v_match_status) IN ('COMPLETED', 'FINISHED')) THEN
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
      -- Interrupted or incomplete publication: perform reconciliation
      v_is_reconciliation := TRUE;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. DYNAMIC RESULT PROCESSING & ATOMIC TRANSACTIONS
  -- -----------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    v_rank := COALESCE((v_item->>'rank')::INTEGER, 0);
    v_kills := COALESCE((v_item->>'kills')::INTEGER, 0);
    v_prize := COALESCE((v_item->>'prize_won')::NUMERIC, (v_item->>'winnings')::NUMERIC, 0);
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- 6.1 Check if transaction record already exists
    v_tx_inserted := FALSE;
    IF v_tx_table_name IS NOT NULL AND v_tx_has_ref_id THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE reference_id = $1)', v_tx_table_name)
      USING v_ref_id
      INTO v_tx_inserted;
    END IF;

    -- 6.2 Process only if transaction doesn't exist
    IF NOT v_tx_inserted THEN
      
      -- A) Write transaction audit record dynamically
      IF v_tx_table_name IS NOT NULL THEN
        v_tx_query := format('INSERT INTO public.%I (id, user_id, amount, type, status, description', v_tx_table_name);
        
        IF v_tx_has_ref_id THEN
          v_tx_query := v_tx_query || ', reference_id';
        END IF;
        
        v_tx_query := v_tx_query || ', created_at) VALUES ($1, $2, $3, $4, $5, $6';
        
        IF v_tx_has_ref_id THEN
          v_tx_query := v_tx_query || ', $7';
        END IF;
        
        IF v_tx_created_at_type IN ('bigint', 'integer', 'numeric') THEN
          v_tx_query := v_tx_query || ', $8)';
        ELSE
          v_tx_query := v_tx_query || ', $9)';
        END IF;
        
        EXECUTE v_tx_query
        USING gen_random_uuid(), 
              v_user_id, 
              v_prize, 
              CASE WHEN v_prize > 0 THEN 'WINNING_PRIZE' ELSE 'MATCH_RESULT' END,
              'approved',
              'Tournament Result for Match: ' || p_match_id::text,
              v_ref_id,
              v_now_ms,
              v_now_ts;
      END IF;

      -- B) Update registrations table dynamically
      IF v_reg_tourn_col IS NOT NULL THEN
        v_update_query := 'UPDATE public.registrations SET status = ''COMPLETED''';
        
        IF v_regs_updated_at_type IN ('bigint', 'integer', 'numeric') THEN
          v_update_query := v_update_query || ', updated_at = ' || v_now_ms;
        ELSE
          v_update_query := v_update_query || ', updated_at = NOW()';
        END IF;
        
        IF v_reg_rank_col IS NOT NULL THEN
          v_update_query := v_update_query || format(', %I = %L', v_reg_rank_col, v_rank);
        END IF;
        
        IF v_reg_kills_col IS NOT NULL THEN
          v_update_query := v_update_query || format(', %I = %L', v_reg_kills_col, v_kills);
        END IF;
        
        IF v_reg_winnings_col IS NOT NULL THEN
          v_update_query := v_update_query || format(', %I = %L', v_reg_winnings_col, v_prize);
        END IF;
        
        v_update_query := v_update_query || format(' WHERE %I = $1 AND user_id = $2', v_reg_tourn_col);
        
        EXECUTE v_update_query USING p_match_id, v_user_id;
      END IF;

      -- C) Credit Prize Winnings to Player Balances (ONLY if prize > 0)
      IF v_prize > 0 THEN
        
        -- 1. wallets Table
        IF v_has_wallets THEN
          INSERT INTO public.wallets (
            user_id, deposit_balance, winning_balance, bonus_balance, created_at, updated_at
          ) VALUES (
            v_user_id, 0, v_prize, 0, NOW(), NOW()
          )
          ON CONFLICT (user_id)
          DO UPDATE SET
            winning_balance = COALESCE(wallets.winning_balance, 0) + EXCLUDED.winning_balance,
            updated_at = NOW();
        END IF;

        -- 2. profiles Table Balances dynamically
        v_prof_update_query := 'UPDATE public.profiles SET ';
        
        IF v_prof_winning_bal_col THEN v_prof_update_query := v_prof_update_query || format('winning_balance = COALESCE(winning_balance, 0) + %L, ', v_prize); END IF;
        IF v_prof_wallet_bal_col THEN v_prof_update_query := v_prof_update_query || format('wallet_balance = COALESCE(wallet_balance, 0) + %L, ', v_prize); END IF;
        IF v_prof_total_bal_col THEN v_prof_update_query := v_prof_update_query || format('total_balance = COALESCE(total_balance, 0) + %L, ', v_prize); END IF;
        IF v_prof_total_win_col THEN v_prof_update_query := v_prof_update_query || format('total_earnings = COALESCE(total_earnings, 0) + %L, ', v_prize); END IF;

        IF v_prof_updated_at_type IN ('bigint', 'integer', 'numeric') THEN
          v_prof_update_query := v_prof_update_query || 'updated_at = ' || v_now_ms;
        ELSE
          v_prof_update_query := v_prof_update_query || 'updated_at = NOW()';
        END IF;

        v_prof_update_query := v_prof_update_query || format(' WHERE id = %L', v_user_id);
        EXECUTE v_prof_update_query;

        v_total_prize_credited := v_total_prize_credited + v_prize;
      END IF;

      -- D) Update Leaderboard dynamically (Only if table exists)
      IF v_has_leaderboard THEN
        v_is_win := CASE WHEN v_rank = 1 THEN 1 ELSE 0 END;
        v_points := (v_is_win * 100) + (v_kills * 10);

        v_username := 'Player';
        v_ign := 'Player';
        v_avatar := NULL;

        IF v_prof_username_col IS NOT NULL THEN
          EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1', v_prof_username_col) USING v_user_id INTO v_username;
        END IF;

        IF v_prof_ign_col IS NOT NULL THEN
          EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1', v_prof_ign_col) USING v_user_id INTO v_ign;
        END IF;

        SELECT avatar_url INTO v_avatar FROM public.profiles WHERE id = v_user_id;

        v_lb_query := format('INSERT INTO public.leaderboard (id, user_id, matches_played, matches_won, total_kills, total_earnings, points, updated_at');
        IF v_lb_username_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %I', v_lb_username_col);
        END IF;
        IF v_lb_ign_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %I', v_lb_ign_col);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name = 'avatar_url') THEN
          v_lb_query := v_lb_query || ', avatar_url';
        END IF;
        
        v_lb_query := v_lb_query || format(') VALUES (%L, %L, 1, %L, %L, %L, %L, NOW()', 'lb-' || v_user_id::text, v_user_id, v_is_win, v_kills, v_prize, v_points);
        IF v_lb_username_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %L', COALESCE(v_username, 'Player'));
        END IF;
        IF v_lb_ign_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %L', COALESCE(v_ign, v_username, 'Player'));
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name = 'avatar_url') THEN
          v_lb_query := v_lb_query || format(', %L', v_avatar);
        END IF;
        
        v_lb_query := v_lb_query || ') ON CONFLICT (user_id) DO UPDATE SET ';
        v_lb_query := v_lb_query || 'matches_played = COALESCE(leaderboard.matches_played, 0) + 1, ';
        v_lb_query := v_lb_query || 'matches_won = COALESCE(leaderboard.matches_won, 0) + EXCLUDED.matches_won, ';
        v_lb_query := v_lb_query || 'total_kills = COALESCE(leaderboard.total_kills, 0) + EXCLUDED.total_kills, ';
        v_lb_query := v_lb_query || 'total_earnings = COALESCE(leaderboard.total_earnings, 0) + EXCLUDED.total_earnings, ';
        v_lb_query := v_lb_query || 'points = COALESCE(leaderboard.points, 0) + EXCLUDED.points, ';
        v_lb_query := v_lb_query || 'updated_at = NOW()';
        
        IF v_lb_username_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %I = COALESCE(EXCLUDED.%I, leaderboard.%I)', v_lb_username_col, v_lb_username_col, v_lb_username_col);
        END IF;
        IF v_lb_ign_col IS NOT NULL THEN
          v_lb_query := v_lb_query || format(', %I = COALESCE(EXCLUDED.%I, leaderboard.%I)', v_lb_ign_col, v_lb_ign_col, v_lb_ign_col);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leaderboard' AND column_name = 'avatar_url') THEN
          v_lb_query := v_lb_query || ', avatar_url = COALESCE(EXCLUDED.avatar_url, leaderboard.avatar_url)';
        END IF;

        EXECUTE v_lb_query;
      END IF;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- -----------------------------------------------------------------------
  -- 7. FINALIZE TOURNAMENT STATUS TO COMPLETED
  -- -----------------------------------------------------------------------
  v_update_query := 'UPDATE public.tournaments SET status = ''COMPLETED'', results_published = TRUE';
  
  IF v_tourn_completed_at_type IN ('bigint', 'integer', 'numeric') THEN
    v_update_query := v_update_query || ', completed_at = ' || v_now_ms;
  ELSE
    v_update_query := v_update_query || ', completed_at = NOW()';
  END IF;
  
  IF v_tourn_updated_at_type IN ('bigint', 'integer', 'numeric') THEN
    v_update_query := v_update_query || ', updated_at = ' || v_now_ms;
  ELSE
    v_update_query := v_update_query || ', updated_at = NOW()';
  END IF;
  
  v_update_query := v_update_query || format(' WHERE id = %L', p_match_id);
  EXECUTE v_update_query;

  -- -----------------------------------------------------------------------
  -- 8. RETURN SUCCESS RESPONSE PAYLOAD
  -- -----------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'already_published', COALESCE(v_is_published, false),
    'reconciliation_performed', v_is_reconciliation,
    'processed_count', v_count,
    'total_prize_credited', v_total_prize_credited,
    'message', CASE 
      WHEN v_is_reconciliation THEN 'Match results reconciled successfully. Missing player prizes credited.'
      ELSE 'Match results published and player winnings credited successfully.'
    END
  );
END;
$$;

-- STEP 3: Grant execution permissions (Restrict anon)
REVOKE EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) TO authenticated, service_role;
