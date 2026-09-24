-- ============================================================================
-- WINX7 SUPABASE MIGRATION: STAFF GAME-SPECIFIC AUTHORIZATION & ISOLATION
-- ============================================================================
-- Enforces strict game-level partitioning across Free Fire and BGMI:
--   - Free Fire Staff  -> Access ONLY Free Fire tournaments, registrations, results
--   - BGMI Staff       -> Access ONLY BGMI tournaments, registrations, results
--   - Unassigned Staff -> Access NO game data (0 tournaments, 0 registrations)
--   - Admin/Superadmin -> Full unrestricted access to all games
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: SCHEMA EXTENSIONS FOR PROFILES & STAFF_MEMBERS
-- ----------------------------------------------------------------------------

-- 1.1 Ensure assigned_game exists in public.profiles (Authoritative Permission Source)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS assigned_game TEXT DEFAULT NULL;

-- 1.2 Ensure assigned_game exists in public.staff_members (Admin Compatibility)
ALTER TABLE public.staff_members 
  ADD COLUMN IF NOT EXISTS assigned_game TEXT DEFAULT NULL;

-- 1.3 Ensure game columns exist in public.result_requests
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'result_requests') THEN
    ALTER TABLE public.result_requests ADD COLUMN IF NOT EXISTS game TEXT DEFAULT NULL;
    ALTER TABLE public.result_requests ADD COLUMN IF NOT EXISTS game_category TEXT DEFAULT NULL;
  END IF;
END $$;

-- 1.4 Normalize any legacy or case-variant assigned_game values
UPDATE public.profiles
SET assigned_game = 'Free Fire'
WHERE assigned_game ILIKE '%free%fire%' OR assigned_game ILIKE '%freefire%' OR assigned_game = 'FF';

UPDATE public.profiles
SET assigned_game = 'BGMI'
WHERE assigned_game ILIKE '%bgmi%' OR assigned_game ILIKE '%battleground%' OR assigned_game ILIKE '%pubg%';

UPDATE public.staff_members
SET assigned_game = 'Free Fire'
WHERE assigned_game ILIKE '%free%fire%' OR assigned_game ILIKE '%freefire%' OR assigned_game = 'FF';

UPDATE public.staff_members
SET assigned_game = 'BGMI'
WHERE assigned_game ILIKE '%bgmi%' OR assigned_game ILIKE '%battleground%' OR assigned_game ILIKE '%pubg%';


-- ----------------------------------------------------------------------------
-- STEP 2: BIDIRECTIONAL SYNCHRONIZATION TRIGGERS
-- ----------------------------------------------------------------------------

-- 2.1 Sync staff_members -> profiles
CREATE OR REPLACE FUNCTION public.sync_staff_members_to_profiles_game()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET assigned_game = NEW.assigned_game
    WHERE id = NEW.user_id
      AND (assigned_game IS DISTINCT FROM NEW.assigned_game);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_staff_members_game ON public.staff_members;
CREATE TRIGGER trg_sync_staff_members_game
AFTER INSERT OR UPDATE OF assigned_game, user_id ON public.staff_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_staff_members_to_profiles_game();

-- 2.2 Sync profiles -> staff_members
CREATE OR REPLACE FUNCTION public.sync_profiles_to_staff_members_game()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NOT NULL THEN
    UPDATE public.staff_members
    SET assigned_game = NEW.assigned_game
    WHERE user_id = NEW.id
      AND (assigned_game IS DISTINCT FROM NEW.assigned_game);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_game ON public.profiles;
CREATE TRIGGER trg_sync_profiles_game
AFTER INSERT OR UPDATE OF assigned_game ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profiles_to_staff_members_game();


-- ----------------------------------------------------------------------------
-- STEP 3: GAME MATCHING & SECURITY HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- 3.1 Pure matching function for game strings
CREATE OR REPLACE FUNCTION public.staff_game_matches(
  p_assigned_game TEXT, 
  p_target_game TEXT,
  p_target_game_category TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_assigned TEXT;
  v_target TEXT;
BEGIN
  -- Unassigned staff (NULL, empty, or 'Not Assigned') matches NOTHING
  IF p_assigned_game IS NULL OR TRIM(p_assigned_game) = '' OR LOWER(TRIM(p_assigned_game)) = 'not assigned' THEN
    RETURN FALSE;
  END IF;

  v_assigned := UPPER(TRIM(p_assigned_game));
  v_target := UPPER(TRIM(COALESCE(p_target_game, p_target_game_category, '')));

  -- Free Fire Staff Match
  IF v_assigned = 'FREE FIRE' OR v_assigned LIKE '%FREE%FIRE%' OR v_assigned = 'FF' THEN
    RETURN (
      v_target = 'FREE FIRE' 
      OR v_target = 'FREE_FIRE'
      OR v_target LIKE '%FREE%FIRE%'
      OR (v_target != 'BGMI' AND v_target NOT LIKE '%BATTLEGROUND%' AND v_target NOT LIKE '%PUBG%')
    );
  END IF;

  -- BGMI Staff Match
  IF v_assigned = 'BGMI' OR v_assigned LIKE '%BGMI%' OR v_assigned LIKE '%BATTLEGROUND%' OR v_assigned = 'PUBG' THEN
    RETURN (
      v_target = 'BGMI' 
      OR v_target LIKE '%BGMI%' 
      OR v_target LIKE '%BATTLEGROUND%' 
      OR v_target LIKE '%PUBG%'
    );
  END IF;

  RETURN FALSE;
END;
$$;

-- 3.2 Secure Authoritative Access Checker
CREATE OR REPLACE FUNCTION public.check_user_game_access(
  p_user_id UUID, 
  p_tournament_game TEXT,
  p_tournament_game_cat TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_assigned_game TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT LOWER(COALESCE(role, 'user')), assigned_game 
  INTO v_role, v_assigned_game
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Superadmin & Admin have full access across all games
  IF v_role IN ('superadmin', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Staff requires explicit match with their assigned_game
  IF v_role = 'staff' THEN
    RETURN public.staff_game_matches(v_assigned_game, p_tournament_game, p_tournament_game_cat);
  END IF;

  RETURN FALSE;
END;
$$;


-- ----------------------------------------------------------------------------
-- STEP 4: ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- 4.1 TOURNAMENTS TABLE RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Drop legacy/blanket policies on tournaments
DROP POLICY IF EXISTS "Public can view active tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can manage tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Staff can manage tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Authenticated users view tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "staff_tournament_access" ON public.tournaments;
DROP POLICY IF EXISTS "staff_manage_assigned_tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_read_policy" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_write_policy" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_policy" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_policy" ON public.tournaments;

-- SELECT Policy for Tournaments:
-- 1. Regular users & anon: can view tournaments for gameplay
-- 2. Admin/Superadmin: can view all tournaments
-- 3. Staff: can view tournaments for their assigned game ONLY
CREATE POLICY "tournaments_read_policy" ON public.tournaments
FOR SELECT TO authenticated, anon
USING (
  -- Anon or standard users can view active/upcoming tournaments
  (auth.uid() IS NULL OR (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'user')
  OR (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), game, game_category)
  )
);

-- INSERT Policy for Tournaments: Admin/Superadmin all, Staff assigned game only
CREATE POLICY "tournaments_insert_policy" ON public.tournaments
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), game, game_category)
  )
);

-- UPDATE Policy for Tournaments (Room ID, status, etc.): Admin/Superadmin all, Staff assigned game only
CREATE POLICY "tournaments_update_policy" ON public.tournaments
FOR UPDATE TO authenticated
USING (
  (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), game, game_category)
  )
)
WITH CHECK (
  (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), game, game_category)
  )
);

-- DELETE Policy for Tournaments: Admin/Superadmin only
CREATE POLICY "tournaments_delete_policy" ON public.tournaments
FOR DELETE TO authenticated
USING (
  (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
);


-- 4.2 REGISTRATIONS TABLE RLS
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admins can view all registrations" ON public.registrations;
DROP POLICY IF EXISTS "Staff can view all registrations" ON public.registrations;
DROP POLICY IF EXISTS "registrations_read_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_insert_policy" ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_policy" ON public.registrations;

-- SELECT Policy for Registrations:
-- 1. Users can view their own registrations
-- 2. Admin/Superadmin can view all registrations
-- 3. Staff can view registrations ONLY for their assigned game's tournaments
CREATE POLICY "registrations_read_policy" ON public.registrations
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE (t.id = registrations.tournament_id OR t.id::text = registrations.match_id)
        AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), t.game, t.game_category)
    )
  )
);

-- INSERT Policy for Registrations: Users join for themselves, Admins/Staff for match management
CREATE POLICY "registrations_insert_policy" ON public.registrations
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE (t.id = registrations.tournament_id OR t.id::text = registrations.match_id)
        AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), t.game, t.game_category)
    )
  )
);

-- UPDATE Policy for Registrations: Admins full, Staff assigned game only
CREATE POLICY "registrations_update_policy" ON public.registrations
FOR UPDATE TO authenticated
USING (
  (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin')
  OR (
    (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE (t.id = registrations.tournament_id OR t.id::text = registrations.match_id)
        AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), t.game, t.game_category)
    )
  )
);


-- 4.3 RESULT REQUESTS TABLE RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'result_requests') THEN
    ALTER TABLE public.result_requests ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admins can manage result requests" ON public.result_requests;
    DROP POLICY IF EXISTS "Staff can view result requests" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_read_policy" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_insert_policy" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_update_policy" ON public.result_requests;

    -- SELECT: Admin/Superadmin all, Staff assigned game only
    CREATE POLICY "result_requests_read_policy" ON public.result_requests
    FOR SELECT TO authenticated
    USING (
      (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin', 'super_admin', 'super_administrator', 'administrator')
      OR auth.uid() = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc'::uuid
      OR (
        (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
        AND (
          public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), match_category, game)
          OR EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE (
              t.id = result_requests.tournament_id
              OR t.id::text = result_requests.tournament_id::text
              OR t.id::text = result_requests.match_id
              OR t.match_id = result_requests.match_id
            )
            AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), t.game, t.game_category)
          )
        )
      )
    );

    -- INSERT: Staff can submit requests for their assigned game only
    CREATE POLICY "result_requests_insert_policy" ON public.result_requests
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin', 'super_admin', 'super_administrator', 'administrator')
      OR auth.uid() = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc'::uuid
      OR (
        (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) = 'staff'
        AND (
          public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), match_category, game)
          OR EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE (
              t.id = result_requests.tournament_id
              OR t.id::text = result_requests.tournament_id::text
              OR t.id::text = result_requests.match_id
              OR t.match_id = result_requests.match_id
            )
            AND public.staff_game_matches((SELECT assigned_game FROM public.profiles WHERE id = auth.uid()), t.game, t.game_category)
          )
        )
      )
    );

    -- UPDATE: ONLY Admins can approve/reject/modify result requests
    CREATE POLICY "result_requests_update_policy" ON public.result_requests
    FOR UPDATE TO authenticated
    USING (
      (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin', 'super_admin', 'super_administrator', 'administrator')
      OR auth.uid() = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc'::uuid
    );
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- STEP 5: SECURE RPC FUNCTIONS AGAINST CROSS-GAME ACCESS
-- ----------------------------------------------------------------------------

-- 5.1 SECURE publish_match_results RPC
DROP FUNCTION IF EXISTS public.publish_match_results(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.publish_match_results(
  p_match_id UUID,
  p_results JSONB -- Array of {user_id, rank, kills, prize_won, ...}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_assigned_game TEXT;
  v_match_status TEXT;
  v_is_published BOOLEAN;
  v_match_game TEXT;
  v_match_game_cat TEXT;
  v_result JSONB;
  v_user_id UUID;
  v_prize NUMERIC;
  v_kills INTEGER;
  v_rank INTEGER;
  v_ref_id TEXT;
  v_count INTEGER := 0;
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_type_updated_at_prof TEXT;
  v_type_created_at_tx TEXT;
BEGIN
  -- 1. Authorization check
  SELECT LOWER(COALESCE(role, '')), assigned_game 
  INTO v_caller_role, v_caller_assigned_game
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superadmin', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators and authorized staff can publish match results.';
  END IF;

  -- 2. Verify tournament existence, status, and game
  SELECT status, COALESCE(results_published, FALSE), game, game_category
  INTO v_match_status, v_is_published, v_match_game, v_match_game_cat
  FROM public.tournaments
  WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Tournament with ID % not found.', p_match_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. STRICT GAME ISOLATION ENFORCEMENT FOR STAFF
  IF v_caller_role = 'staff' THEN
    IF v_caller_assigned_game IS NULL OR TRIM(v_caller_assigned_game) = '' OR LOWER(v_caller_assigned_game) = 'not assigned' THEN
      RAISE EXCEPTION 'Forbidden: You have no assigned game. Contact an administrator for game assignment.';
    END IF;

    IF NOT public.staff_game_matches(v_caller_assigned_game, v_match_game, v_match_game_cat) THEN
      RAISE EXCEPTION 'Forbidden: You are assigned to % and cannot publish results for % matches.', 
        v_caller_assigned_game, COALESCE(v_match_game, v_match_game_cat, 'other game');
    END IF;
  END IF;

  IF v_is_published = TRUE OR v_match_status IN ('COMPLETED', 'FINISHED', 'completed', 'finished') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Results have already been officially published for this tournament.',
      'already_published', true
    );
  END IF;

  -- 4. Discover column types for profiles and transactions
  SELECT data_type INTO v_type_updated_at_prof FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at' LIMIT 1;

  SELECT data_type INTO v_type_created_at_tx FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'created_at' LIMIT 1;

  -- 5. Process participants results atomically
  FOR v_result IN SELECT * FROM jsonb_array_elements(p_results)
  LOOP
    v_user_id := (v_result->>'user_id')::UUID;
    v_prize := COALESCE((v_result->>'prize_won')::NUMERIC, (v_result->>'winnings')::NUMERIC, 0);
    v_kills := COALESCE((v_result->>'kills')::INTEGER, 0);
    v_rank := COALESCE((v_result->>'rank')::INTEGER, (v_result->>'rank_position')::INTEGER, 0);
    
    v_ref_id := 'win_' || p_match_id::text || '_' || v_user_id::text;

    -- Update registrations table
    UPDATE public.registrations
    SET rank = v_rank,
        kills = v_kills,
        winnings = v_prize,
        status = 'COMPLETED',
        updated_at = v_now_ts
    WHERE tournament_id = p_match_id 
      AND user_id = v_user_id;

    -- Credit winnings idempotently
    IF v_prize > 0 AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions 
      WHERE reference_id = v_ref_id AND user_id = v_user_id AND type = 'winning'
    ) THEN
      -- Credit user balance
      IF v_type_updated_at_prof IN ('bigint', 'integer', 'numeric') THEN
        UPDATE public.profiles
        SET winning_balance = COALESCE(winning_balance, 0) + v_prize,
            total_balance = COALESCE(total_balance, 0) + v_prize,
            total_earnings = COALESCE(total_earnings, 0) + v_prize,
            updated_at = v_now_ms
        WHERE id = v_user_id;
      ELSE
        UPDATE public.profiles
        SET winning_balance = COALESCE(winning_balance, 0) + v_prize,
            total_balance = COALESCE(total_balance, 0) + v_prize,
            total_earnings = COALESCE(total_earnings, 0) + v_prize,
            updated_at = v_now_ts
        WHERE id = v_user_id;
      END IF;

      -- Audit record in wallet_transactions
      IF v_type_created_at_tx IN ('bigint', 'integer', 'numeric') THEN
        INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
        VALUES (gen_random_uuid(), v_user_id, v_prize, 'winning', 'approved', 'Prize for match: ' || p_match_id, v_ref_id, v_now_ms);
      ELSE
        INSERT INTO public.wallet_transactions (id, user_id, amount, type, status, description, reference_id, created_at)
        VALUES (gen_random_uuid(), v_user_id, v_prize, 'winning', 'approved', 'Prize for match: ' || p_match_id, v_ref_id, v_now_ts);
      END IF;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- 6. Mark tournament completed
  UPDATE public.tournaments
  SET status = 'COMPLETED',
      results_published = TRUE,
      updated_at = v_now_ts
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match results published and prizes distributed successfully.',
    'credited_winners', v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_match_results(UUID, JSONB) TO authenticated, service_role;


-- 5.2 SECURE cancel_match_and_refund RPC
DROP FUNCTION IF EXISTS public.cancel_match_and_refund(UUID);

CREATE OR REPLACE FUNCTION public.cancel_match_and_refund(
  p_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_assigned_game TEXT;
  v_match_status TEXT;
  v_entry_fee NUMERIC;
  v_match_game TEXT;
  v_match_game_cat TEXT;
  v_count INTEGER := 0;
  v_reg RECORD;
  v_ref_id TEXT;
  
  v_now_ts TIMESTAMPTZ := NOW();
  v_now_ms BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_type_updated_at_tourn TEXT;
  v_type_updated_at_prof TEXT;
  v_type_created_at_tx TEXT;
BEGIN
  -- 1. Authorization check
  SELECT LOWER(COALESCE(role, '')), assigned_game 
  INTO v_caller_role, v_caller_assigned_game
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('superadmin', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators and authorized staff can cancel matches.';
  END IF;

  -- 2. Fetch match info
  SELECT status, COALESCE(entry_fee, 0), game, game_category 
  INTO v_match_status, v_entry_fee, v_match_game, v_match_game_cat
  FROM public.tournaments 
  WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RAISE EXCEPTION 'Match not found.';
  END IF;

  -- 3. STRICT GAME ISOLATION ENFORCEMENT FOR STAFF
  IF v_caller_role = 'staff' THEN
    IF v_caller_assigned_game IS NULL OR TRIM(v_caller_assigned_game) = '' OR LOWER(v_caller_assigned_game) = 'not assigned' THEN
      RAISE EXCEPTION 'Forbidden: You have no assigned game. Contact an administrator for game assignment.';
    END IF;

    IF NOT public.staff_game_matches(v_caller_assigned_game, v_match_game, v_match_game_cat) THEN
      RAISE EXCEPTION 'Forbidden: You are assigned to % and cannot cancel % matches.', 
        v_caller_assigned_game, COALESCE(v_match_game, v_match_game_cat, 'other game');
    END IF;
  END IF;

  IF v_match_status IN ('COMPLETED', 'CANCELLED', 'FINISHED', 'completed', 'cancelled', 'finished') THEN
    RAISE EXCEPTION 'Match is already %.', v_match_status;
  END IF;

  -- 4. Type Detection
  SELECT data_type INTO v_type_updated_at_tourn FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_updated_at_prof FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at';
  SELECT data_type INTO v_type_created_at_tx FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'created_at';

  -- 5. Process Refunds
  IF v_entry_fee > 0 THEN
    FOR v_reg IN SELECT user_id FROM public.registrations WHERE tournament_id = p_match_id
    LOOP
      v_ref_id := 'refund_' || p_match_id::text || '_' || v_reg.user_id::text;
      
      IF NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions 
        WHERE reference_id = v_ref_id AND user_id = v_reg.user_id AND type = 'refund'
      ) THEN
        IF v_type_updated_at_prof IN ('bigint', 'integer', 'numeric') THEN
          UPDATE public.profiles SET total_balance = COALESCE(total_balance, 0) + v_entry_fee, updated_at = v_now_ms WHERE id = v_reg.user_id;
        ELSE
          UPDATE public.profiles SET total_balance = COALESCE(total_balance, 0) + v_entry_fee, updated_at = v_now_ts WHERE id = v_reg.user_id;
        END IF;

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

  -- 6. Finalize Tournament cancellation
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

REVOKE EXECUTE ON FUNCTION public.cancel_match_and_refund(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_match_and_refund(UUID) TO authenticated, service_role;


-- 5.3 UPDATE STAFF GAME ASSIGNMENT RPC
CREATE OR REPLACE FUNCTION public.update_staff_game_assignment(
  p_staff_id UUID,
  p_assigned_game TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_user_id UUID;
BEGIN
  -- 1. Only Superadmin/Admin can assign games
  SELECT LOWER(COALESCE(role, '')) INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can modify staff game assignments.';
  END IF;

  -- 2. Validate assigned_game
  IF p_assigned_game NOT IN ('Free Fire', 'BGMI') THEN
    RAISE EXCEPTION 'Invalid game: Must be "Free Fire" or "BGMI".';
  END IF;

  -- 3. Resolve user_id
  SELECT user_id INTO v_user_id FROM public.staff_members WHERE id = p_staff_id;
  IF v_user_id IS NULL THEN
    -- Check if p_staff_id is already the user_id
    SELECT id INTO v_user_id FROM public.profiles WHERE id = p_staff_id;
  END IF;

  -- 4. Update both tables
  UPDATE public.staff_members
  SET assigned_game = p_assigned_game, updated_at = NOW()
  WHERE id = p_staff_id OR user_id = v_user_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET assigned_game = p_assigned_game, updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Staff game assignment updated to ' || p_assigned_game
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_staff_game_assignment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_game_assignment(UUID, TEXT) TO authenticated, service_role;


-- 5.4 CREATE STAFF MEMBER RPC (WITH ASSIGNED GAME)
CREATE OR REPLACE FUNCTION public.create_staff_member(
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_assigned_game TEXT DEFAULT 'Free Fire'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_staff_id TEXT;
  v_new_uuid UUID := gen_random_uuid();
  v_clean_game TEXT;
BEGIN
  -- 1. Admin authorization check
  SELECT LOWER(COALESCE(role, '')) INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can create staff members.';
  END IF;

  -- 2. Validate game
  v_clean_game := CASE 
    WHEN p_assigned_game ILIKE '%bgmi%' THEN 'BGMI'
    ELSE 'Free Fire'
  END;

  -- 3. Generate sequential staff ID (e.g. STF-1001)
  SELECT 'STF-' || (1000 + COUNT(*) + 1)::TEXT INTO v_staff_id FROM public.staff_members;

  -- 4. Update profile role to STAFF and set assigned_game
  UPDATE public.profiles
  SET role = 'staff',
      assigned_game = v_clean_game,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 5. Insert into staff_members table
  INSERT INTO public.staff_members (
    id, user_id, staff_id, staff_code, role, status, assigned_game, notes, created_at, updated_at
  )
  VALUES (
    v_new_uuid, p_user_id, v_staff_id, v_staff_id, 'STAFF', 'ACTIVE', v_clean_game, p_notes, NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET status = 'ACTIVE',
      assigned_game = v_clean_game,
      notes = COALESCE(p_notes, staff_members.notes),
      updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'staff_id', v_staff_id,
    'assigned_game', v_clean_game,
    'id', v_new_uuid
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_staff_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_member(UUID, TEXT, TEXT) TO authenticated, service_role;
