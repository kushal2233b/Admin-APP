-- ==============================================================================
-- WINX7 FIX MATCH CREATION & MATCH ID GENERATOR PERMISSIONS
-- 
-- 1. Tighten EXECUTE privileges on match ID generators:
--    REVOKE from PUBLIC and anon.
--    GRANT to authenticated and service_role.
-- 2. Ensure public.trg_assign_tournament_match_id runs with SECURITY DEFINER
--    and search_path = public so that any authenticated user/staff inserting
--    a tournament can execute public.generate_next_match_id seamlessly.
-- ==============================================================================

-- Step 1: Secure date keys parser
REVOKE EXECUTE ON FUNCTION public.parse_tournament_date_keys(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parse_tournament_date_keys(TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- Step 2: Secure sequential match ID generator
REVOKE EXECUTE ON FUNCTION public.generate_next_match_id(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_match_id(TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- Step 3: Trigger function with SECURITY DEFINER and search_path = public
CREATE OR REPLACE FUNCTION public.trg_assign_tournament_match_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If match_id is not supplied or empty, generate atomic sequential ID
  IF NEW.match_id IS NULL OR TRIM(NEW.match_id) = '' THEN
    NEW.match_id := public.generate_next_match_id(
      NEW.match_time,
      NEW.match_date,
      NEW.created_at
    );
  ELSE
    -- If legacy WX7-DDMMYY-XXX format was supplied, normalize to WX7-DDMM-XXX
    IF NEW.match_id ~ '^WX7-[0-9]{6}-[0-9]{3,}$' THEN
      NEW.match_id := 'WX7-' || SUBSTRING(NEW.match_id FROM 5 FOR 4) || '-' || SUBSTRING(NEW.match_id FROM 12);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 4: Re-attach BEFORE INSERT trigger on public.tournaments
DROP TRIGGER IF EXISTS trg_tournaments_match_id ON public.tournaments;
CREATE TRIGGER trg_tournaments_match_id
BEFORE INSERT ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_tournament_match_id();

-- Step 5: Grant execute on trigger function only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.trg_assign_tournament_match_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_assign_tournament_match_id() TO authenticated, service_role;

-- Step 6: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
