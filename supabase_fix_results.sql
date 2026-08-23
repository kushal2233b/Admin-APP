-- =========================================================================
-- WINX7 FULL SUPABASE RESULT PUBLISHING & SCHEMA REPAIR SCRIPT
-- Copy and run this entire script in your Supabase SQL Editor
-- =========================================================================

-- STEP 1: Ensure all required columns exist in public tables

-- 1.1 Tournaments Table
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1.2 Registrations Table
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS rank INTEGER DEFAULT 0;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS winnings NUMERIC DEFAULT 0;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS prize_won NUMERIC DEFAULT 0;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1.3 Profiles Table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS winning_balance NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_balance NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_earnings NUMERIC DEFAULT 0;

-- 1.4 Wallet Transactions Table
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'winning';
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- 1.5 Wallets Table (if applicable)
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS winning_balance NUMERIC DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1.6 Unique index on reference_id for wallet_transactions to guarantee single prize credit
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_ref_id ON public.wallet_transactions (reference_id) WHERE reference_id IS NOT NULL;


-- STEP 2: Drop old function signatures to prevent overloading conflicts
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);


-- STEP 3: Create the robust, atomic publish_match_results RPC function
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
  v_match_status TEXT;
  v_is_published BOOLEAN := FALSE;
  v_result JSONB;
  v_user_id UUID;
  v_rank INTEGER;
  v_kills INTEGER;
  v_prize NUMERIC;
  v_ref_id TEXT;
  v_count INTEGER := 0;
  v_now_ts TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Verify match existence and status
  SELECT status, COALESCE(results_published, FALSE)
  INTO v_match_status, v_is_published
  FROM public.tournaments
  WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Match with ID % not found.', p_match_id;
  END IF;

  -- 2. Idempotency Check: Prevent duplicate processing if already completed or published
  IF v_is_published OR UPPER(v_match_status) IN ('COMPLETED', 'FINISHED', 'CANCELLED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_published', true,
      'message', format('Match is already %s. Duplicate publication ignored safely.', v_match_status)
    );
  END IF;

  -- 3. Process each submitted player result atomically
  FOR v_result IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_result->>'user_id')::UUID;
    v_rank := COALESCE((v_result->>'rank')::INTEGER, 0);
    v_kills := COALESCE((v_result->>'kills')::INTEGER, 0);
    v_prize := COALESCE((v_result->>'prize_won')::NUMERIC, 0);
    v_ref_id := p_match_id::text || '_' || v_user_id::text;

    -- Update player registration record
    UPDATE public.registrations
    SET 
      rank = v_rank,
      kills = v_kills,
      winnings = v_prize,
      prize_won = v_prize,
      status = 'COMPLETED',
      updated_at = v_now_ts
    WHERE tournament_id = p_match_id AND user_id = v_user_id;

    -- Credit Winnings to player wallet/profile if prize > 0
    IF v_prize > 0 THEN
      -- Update profiles table
      UPDATE public.profiles
      SET 
        winning_balance = COALESCE(winning_balance, 0) + v_prize,
        wallet_balance = COALESCE(wallet_balance, 0) + v_prize,
        total_balance = COALESCE(total_balance, 0) + v_prize,
        total_earnings = COALESCE(total_earnings, 0) + v_prize,
        updated_at = v_now_ts
      WHERE id = v_user_id;

      -- Update wallets table if present
      UPDATE public.wallets
      SET 
        winning_balance = COALESCE(winning_balance, 0) + v_prize,
        balance = COALESCE(balance, 0) + v_prize,
        updated_at = v_now_ts
      WHERE user_id = v_user_id;

      -- Record transaction idempotently (DO NOTHING on duplicate reference_id)
      INSERT INTO public.wallet_transactions (
        id, user_id, amount, type, status, description, reference_id, created_at
      )
      VALUES (
        gen_random_uuid(), v_user_id, v_prize, 'WINNING_PRIZE', 'approved', 
        'Tournament Prize: ' || p_match_id::text, v_ref_id, v_now_ts
      )
      ON CONFLICT (reference_id) DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- 4. Mark match as permanently COMPLETED
  UPDATE public.tournaments
  SET 
    status = 'COMPLETED',
    results_published = TRUE,
    completed_at = v_now_ts,
    updated_at = v_now_ts
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match results published and winners credited successfully.',
    'processed_count', v_count
  );
END;
$$;


-- STEP 4: Grant execution permissions
GRANT EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) TO authenticated, service_role, anon;
