CREATE OR REPLACE FUNCTION public.cancel_match_and_refund(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_status TEXT;
  v_entry_fee NUMERIC;
  v_count INTEGER := 0;
  v_reg RECORD;
  v_ref_id TEXT;
  
  -- Time variants for compatibility
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  -- Type detection variables
  v_type_updated_at_tourn TEXT;
  v_type_updated_at_prof TEXT;
  v_type_created_at_tx TEXT;
BEGIN
  -- 1. Authorization check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND LOWER(role) IN ('superadmin', 'admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can cancel matches.';
  END IF;

  -- 2. Fetch match info
  SELECT status, COALESCE(entry_fee, 0) INTO v_match_status, v_entry_fee 
  FROM public.tournaments 
  WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Match not found.';
  END IF;

  IF v_match_status IN ('COMPLETED', 'CANCELLED', 'FINISHED', 'completed', 'cancelled', 'finished') THEN
    RAISE EXCEPTION 'Match is already %.', v_match_status;
  END IF;

  -- 3. Precise Type Detection
  SELECT data_type INTO v_type_updated_at_tourn FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_updated_at_prof FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_created_at_tx FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'created_at';

  -- 4. Process Refunds (only if entry fee > 0)
  IF v_entry_fee > 0 THEN
    FOR v_reg IN SELECT user_id FROM public.registrations WHERE tournament_id = p_match_id
    LOOP
      v_ref_id := 'refund_' || p_match_id::text || '_' || v_reg.user_id::text;
      
      -- Refund Idempotently
      IF NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions 
        WHERE reference_id = v_ref_id AND user_id = v_reg.user_id AND type = 'refund'
      ) THEN
        
        -- Update profiles total_balance
        IF v_type_updated_at_prof IN ('bigint', 'integer', 'numeric') THEN
          UPDATE public.profiles SET total_balance = COALESCE(total_balance, 0) + v_entry_fee, updated_at = v_now_ms WHERE id = v_reg.user_id;
        ELSE
          UPDATE public.profiles SET total_balance = COALESCE(total_balance, 0) + v_entry_fee, updated_at = v_now_ts WHERE id = v_reg.user_id;
        END IF;

        -- Create audit record
        IF v_type_created_at_tx IN ('bigint', 'integer', 'numeric') THEN
          INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
          VALUES (gen_random_uuid(), v_reg.user_id, v_entry_fee, 'refund', 'approved', 'Refund for cancelled match: ' || p_match_id, v_ref_id, v_now_ms);
        ELSE
          INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
          VALUES (gen_random_uuid(), v_reg.user_id, v_entry_fee, 'refund', 'approved', 'Refund for cancelled match: ' || p_match_id, v_ref_id, v_now_ts);
        END IF;

        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 5. Finalize Tournament cancellation
  IF v_type_updated_at_tourn IN ('bigint', 'integer', 'numeric') THEN
    UPDATE public.tournaments SET status = 'CANCELLED', updated_at = v_now_ms WHERE id = p_match_id;
  ELSE
    UPDATE public.tournaments SET status = 'CANCELLED', updated_at = v_now_ts WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Match cancelled and refunds processed successfully.',
    'refund_count', v_count
  );
END;
$$;
