-- 1. DROP the old function signature to ensure a clean replacement
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

-- 2. CREATE the fully adaptive RPC function
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
  v_result JSONB;
  v_user_id UUID;
  v_prize NUMERIC;
  v_ref_id TEXT;
  v_count INTEGER := 0;
  
  -- Time variants for compatibility
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  -- Type detection variables (Scoped to 'public' schema)
  v_type_completed_at TEXT;
  v_type_updated_at_tourn TEXT;
  v_type_updated_at_regs TEXT;
  v_type_updated_at_prof TEXT;
  v_type_created_at_tx TEXT;
  
  -- Schema flags for registrations
  v_has_rank BOOLEAN;
  v_has_kills BOOLEAN;
  v_has_winnings BOOLEAN;
  v_has_prize_won BOOLEAN;
  v_update_query TEXT;
BEGIN
  -- 1. Authorization check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('superadmin', 'admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can publish results.';
  END IF;

  -- 2. Precise Type Detection (CRITICAL: filters by public schema)
  SELECT data_type INTO v_type_completed_at FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'completed_at';
  SELECT data_type INTO v_type_updated_at_tourn FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_updated_at_regs FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_updated_at_prof FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_created_at_tx FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'created_at';

  -- 3. Detect column existence for registrations
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'rank') INTO v_has_rank;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'kills') INTO v_has_kills;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'winnings') INTO v_has_winnings;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'registrations' AND column_name = 'prize_won') INTO v_has_prize_won;

  -- 4. Process each player's result
  FOR v_result IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_result->>'user_id')::UUID;
    v_prize := COALESCE((v_result->>'prize_won')::NUMERIC, 0);
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- Dynamic update for 'registrations'
    v_update_query := 'UPDATE public.registrations SET ';
    IF v_type_updated_at_regs IN ('bigint', 'integer', 'numeric') THEN v_update_query := v_update_query || 'updated_at = ' || v_now_ms;
    ELSE v_update_query := v_update_query || 'updated_at = NOW()'; END IF;
    
    IF v_has_rank THEN v_update_query := v_update_query || format(', rank = %L', (v_result->>'rank')::INTEGER); END IF;
    IF v_has_kills THEN v_update_query := v_update_query || format(', kills = %L', (v_result->>'kills')::INTEGER); END IF;
    IF v_has_winnings THEN v_update_query := v_update_query || format(', winnings = %L', v_prize); END IF;
    IF v_has_prize_won THEN v_update_query := v_update_query || format(', prize_won = %L', v_prize); END IF;
    
    v_update_query := v_update_query || format(' WHERE tournament_id = %L AND user_id = %L', p_match_id, v_user_id);
    EXECUTE v_update_query;

    -- 5. Credit Winnings Idempotently
    IF v_prize > 0 AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions 
      WHERE reference_id = v_ref_id AND user_id = v_user_id AND type = 'winning'
    ) THEN
      
      -- Update profiles balance
      IF v_type_updated_at_prof IN ('bigint', 'integer', 'numeric') THEN
        UPDATE public.profiles SET winning_balance = COALESCE(winning_balance, 0) + v_prize, updated_at = v_now_ms WHERE id = v_user_id;
      ELSE
        UPDATE public.profiles SET winning_balance = COALESCE(winning_balance, 0) + v_prize, updated_at = v_now_ts WHERE id = v_user_id;
      END IF;

      -- Create audit record
      IF v_type_created_at_tx IN ('bigint', 'integer', 'numeric') THEN
        INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
        VALUES (gen_random_uuid(), v_user_id, v_prize, 'winning', 'approved', 'Tournament Prize: ' || p_match_id, v_ref_id, v_now_ms);
      ELSE
        INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
        VALUES (gen_random_uuid(), v_user_id, v_prize, 'winning', 'approved', 'Tournament Prize: ' || p_match_id, v_ref_id, v_now_ts);
      END IF;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- 6. Finalize Tournament
  v_update_query := 'UPDATE public.tournaments SET status = ''COMPLETED'', results_published = TRUE';
  
  IF v_type_completed_at IN ('bigint', 'integer', 'numeric') THEN v_update_query := v_update_query || ', completed_at = ' || v_now_ms;
  ELSE v_update_query := v_update_query || ', completed_at = NOW()'; END IF;
  
  IF v_type_updated_at_tourn IN ('bigint', 'integer', 'numeric') THEN v_update_query := v_update_query || ', updated_at = ' || v_now_ms;
  ELSE v_update_query := v_update_query || ', updated_at = NOW()'; END IF;
  
  v_update_query := v_update_query || format(' WHERE id = %L', p_match_id);
  EXECUTE v_update_query;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Results published successfully. Mixed schema types handled correctly.',
    'processed_count', v_count
  );
END;
$$;
