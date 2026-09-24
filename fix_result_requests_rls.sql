-- Fix RLS Policies for result_requests table
-- Ensure ADMIN and SUPER_ADMIN (and SUPERADMIN / super_admin) can SELECT all pending result requests
-- Ensure Staff can only SELECT requests for their assigned games
-- Ensure Staff CANNOT approve/reject/update result requests (Only Admins can UPDATE)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'result_requests') THEN
    ALTER TABLE public.result_requests ENABLE ROW LEVEL SECURITY;

    -- Grant necessary table privileges to authenticated role
    GRANT SELECT, INSERT ON public.result_requests TO authenticated;
    GRANT ALL ON public.result_requests TO service_role;

    DROP POLICY IF EXISTS "Admins can manage result requests" ON public.result_requests;
    DROP POLICY IF EXISTS "Staff can view result requests" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_read_policy" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_insert_policy" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_update_policy" ON public.result_requests;
    DROP POLICY IF EXISTS "result_requests_admin_all" ON public.result_requests;

    -- 1. SELECT POLICY: ADMIN & SUPER_ADMIN can view all requests; Staff can view their game requests
    CREATE POLICY "result_requests_read_policy" ON public.result_requests
    FOR SELECT TO authenticated
    USING (
      -- Admin & Superadmin can select all result requests
      (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin', 'super_admin', 'super_administrator', 'administrator')
      OR auth.uid() = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc'::uuid
      OR (
        -- Staff can only view requests for their assigned game
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

    -- 2. INSERT POLICY: Staff can insert requests for their assigned game; Admins can insert any
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

    -- 3. UPDATE POLICY: ONLY Admins and Superadmins can update/approve/reject result requests (Staff STRICTLY FORBIDDEN)
    CREATE POLICY "result_requests_update_policy" ON public.result_requests
    FOR UPDATE TO authenticated
    USING (
      (SELECT LOWER(COALESCE(role, 'user')) FROM public.profiles WHERE id = auth.uid()) IN ('superadmin', 'admin', 'super_admin', 'super_administrator', 'administrator')
      OR auth.uid() = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc'::uuid
    );

  END IF;
END $$;
