-- 1. Remove old versions to avoid conflicts
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

-- 2. Create the column-safe, dynamic function
CREATE OR REPLACE FUNCTION public.publish_match_results(
  p_match_id UUID,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_user_id UUID;
  v_rank INTEGER;
  v_kills INTEGER;
  v_prize NUMERIC;
  v_ref_id TEXT;
  v_count INTEGER := 0;
  
  -- Dynamic Column Resolvers
  v_reg_rank_col TEXT;
  v_reg_win_col TEXT;
  v_prof_user_col TEXT;
  v_prof_ign_col TEXT;
  
  -- Query templates
  v_username TEXT;
  v_ign TEXT;
  v_avatar TEXT;
  v_tourn_completed TEXT;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('superadmin', 'admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can publish results.';
  END IF;

  -- 1. Discover exact registrations column names
  SELECT column_name INTO v_reg_rank_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('rank_position', 'rank') LIMIT 1;
  
  SELECT column_name INTO v_reg_win_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name IN ('winnings', 'prize_won') LIMIT 1;

  -- 2. Discover exact profiles column names (resolves "username" vs "name")
  SELECT column_name INTO v_prof_user_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('username', 'name') LIMIT 1;

  SELECT column_name INTO v_prof_ign_col FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('ff_ign', 'in_game_name') LIMIT 1;

  -- 3. Process each result
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    v_rank := COALESCE((v_item->>'rank')::INTEGER, 0);
    v_kills := COALESCE((v_item->>'kills')::INTEGER, 0);
    v_prize := COALESCE((v_item->>'prize_won')::NUMERIC, (v_item->>'winnings')::NUMERIC, 0);
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- Skip if already processed to prevent duplicate payouts
    IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_id = v_ref_id) THEN
      
      -- A) Create Wallet Transaction audit trail
      INSERT INTO public.wallet_transactions (
        id, user_id, amount, type, status, description, reference_id, created_at
      ) VALUES (
        gen_random_uuid(), v_user_id, v_prize, 'WINNING_PRIZE', 'approved', 
        'Tournament Prize: ' || p_match_id, v_ref_id, NOW()
      );

      -- B) Dynamically Update Player Registrations Row
      EXECUTE format(
        'UPDATE public.registrations SET status = ''COMPLETED'', %I = $1, %I = $2 WHERE tournament_id = $3 AND user_id = $4',
        v_reg_rank_col, v_reg_win_col
      ) USING v_rank, v_prize, p_match_id, v_user_id;

      -- C) Credit Prize Winnings to Player Balance
      UPDATE public.profiles 
      SET winning_balance = COALESCE(winning_balance, 0) + v_prize,
          updated_at = NOW()
      WHERE id = v_user_id;

      -- D) Fetch user info using discovered column names to update leaderboard
      IF v_prof_user_col IS NOT NULL THEN
        EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1', v_prof_user_col) USING v_user_id INTO v_username;
      END IF;
      
      IF v_prof_ign_col IS NOT NULL THEN
        EXECUTE format('SELECT %I FROM public.profiles WHERE id = $1', v_prof_ign_col) USING v_user_id INTO v_ign;
      END IF;

      SELECT avatar_url INTO v_avatar FROM public.profiles WHERE id = v_user_id;

      -- E) Update Leaderboard Row
      INSERT INTO public.leaderboard (
        id, user_id, username, avatar_url, matches_played, matches_won, total_kills, total_earnings, points, updated_at
      ) VALUES (
        'lb-' || v_user_id::text, v_user_id, COALESCE(v_username, 'Player'), v_avatar,
        1, CASE WHEN v_rank = 1 THEN 1 ELSE 0 END, v_kills, v_prize,
        (CASE WHEN v_rank = 1 THEN 100 ELSE 0 END) + (v_kills * 10), NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, leaderboard.username),
        avatar_url = COALESCE(EXCLUDED.avatar_url, leaderboard.avatar_url),
        matches_played = COALESCE(leaderboard.matches_played, 0) + 1,
        matches_won = COALESCE(leaderboard.matches_won, 0) + EXCLUDED.matches_won,
        total_kills = COALESCE(leaderboard.total_kills, 0) + EXCLUDED.total_kills,
        total_earnings = COALESCE(leaderboard.total_earnings, 0) + EXCLUDED.total_earnings,
        points = COALESCE(leaderboard.points, 0) + EXCLUDED.points,
        updated_at = NOW();

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- 4. Mark Tournament as Finished
  -- We'll use a dynamic update to handle if completed_at is BIGINT or TIMESTAMPTZ
  SELECT data_type INTO v_tourn_completed FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'completed_at';
  
  IF v_tourn_completed IN ('bigint', 'numeric', 'integer') THEN
    UPDATE public.tournaments 
    SET status = 'COMPLETED', 
        results_published = TRUE, 
        completed_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        updated_at = NOW()
    WHERE id = p_match_id;
  ELSE
    UPDATE public.tournaments 
    SET status = 'COMPLETED', 
        results_published = TRUE, 
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_count,
    'message', 'Match results published and balances credited successfully!'
  );
END;
$$;

-- 3. Grant access to authorized roles
REVOKE EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) TO authenticated, service_role;
