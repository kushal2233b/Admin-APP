-- =================================================================
-- WINX7 TOURNAMENT MATCH ID PRODUCTION MIGRATION
-- Format: WX7-DDMM-XXX (e.g. WX7-1309-001)
-- Single Source of Truth: Supabase public.tournaments.match_id
-- Concurrency-Safe, Deletion-Safe, Year-Aware Internal Sequence Tracking
-- =================================================================

-- 1. Add match_id column to public.tournaments if not already present
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS match_id TEXT;

-- 2. Create performance index on match_id (Non-Unique to prevent cross-year collisions)
CREATE INDEX IF NOT EXISTS idx_tournaments_match_id ON public.tournaments (match_id);

-- 3. Create persistent sequence tracker table to prevent sequence reuse on deletion
-- date_key is year-aware (YYYY-MM-DD) so sequence numbers for different calendar years never collide
CREATE TABLE IF NOT EXISTS public.match_id_sequences (
  date_key TEXT PRIMARY KEY,
  last_sequence INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table & Function permissions
-- tournaments table follows standard project access & RLS
GRANT ALL ON public.tournaments TO authenticated, service_role, anon;

-- match_id_sequences is an internal counter engine:
-- REVOKE direct access from public/anon/authenticated clients to prevent manual tampering
REVOKE ALL ON public.match_id_sequences FROM anon, authenticated, public;
GRANT ALL ON public.match_id_sequences TO postgres, service_role;

-- 5. Robust date parser function extracting IST (Asia/Kolkata) public and internal date keys
CREATE OR REPLACE FUNCTION public.parse_tournament_date_keys(
  p_match_time TEXT DEFAULT NULL,
  p_match_date TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (public_key TEXT, internal_key TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_dd TEXT;
  v_mm TEXT;
  v_yyyy TEXT;
  v_dt TIMESTAMPTZ;
  m TEXT[];
BEGIN
  -- Priority 1: match_time containing ISO date string (e.g. '2026-09-13T17:00' or '2026-09-13T23:15')
  IF p_match_time IS NOT NULL AND p_match_time ~ '^\s*([0-9]{4})-([0-9]{2})-([0-9]{2})' THEN
    m := regexp_matches(p_match_time, '^\s*([0-9]{4})-([0-9]{2})-([0-9]{2})');
    v_yyyy := m[1];
    v_mm := m[2];
    v_dd := m[3];
    RETURN QUERY SELECT (v_dd || v_mm)::TEXT, (v_yyyy || '-' || v_mm || '-' || v_dd)::TEXT;
    RETURN;
  END IF;

  -- Priority 2: match_date format (e.g. '13/09/2026', '13-09-2026', '13.09.2026')
  IF p_match_date IS NOT NULL AND p_match_date ~ '^\s*([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4})\s*$' THEN
    m := regexp_matches(p_match_date, '^\s*([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4})\s*$');
    v_dd := LPAD(m[1], 2, '0');
    v_mm := LPAD(m[2], 2, '0');
    v_yyyy := m[3];
    RETURN QUERY SELECT (v_dd || v_mm)::TEXT, (v_yyyy || '-' || v_mm || '-' || v_dd)::TEXT;
    RETURN;
  END IF;

  -- Priority 3: created_at timestamp converted to Asia/Kolkata
  v_dt := COALESCE(p_created_at, NOW()) AT TIME ZONE 'Asia/Kolkata';
  v_dd := TO_CHAR(v_dt, 'DD');
  v_mm := TO_CHAR(v_dt, 'MM');
  v_yyyy := TO_CHAR(v_dt, 'YYYY');
  RETURN QUERY SELECT (v_dd || v_mm)::TEXT, (v_yyyy || '-' || v_mm || '-' || v_dd)::TEXT;
END;
$$;

-- 6. Backfill existing tournaments & seed persistent daily sequences
-- Step 6a: Normalize any existing legacy WX7-DDMMYY-XXX records
UPDATE public.tournaments
SET match_id = 'WX7-' || SUBSTRING(match_id FROM 5 FOR 4) || '-' || SUBSTRING(match_id FROM 12)
WHERE match_id ~ '^WX7-[0-9]{6}-[0-9]{3,}$';

-- Step 6b: Seed match_id_sequences with any already-assigned match_ids
DO $$
DECLARE
  rec RECORD;
  v_pub_key TEXT;
  v_int_key TEXT;
  v_seq INT;
BEGIN
  FOR rec IN (
    SELECT id, match_id, match_time, match_date, created_at
    FROM public.tournaments
    WHERE match_id ~ '^WX7-[0-9]{4}-[0-9]{3,}$'
  ) LOOP
    SELECT public_key, internal_key
    INTO v_pub_key, v_int_key
    FROM public.parse_tournament_date_keys(rec.match_time, rec.match_date, rec.created_at);

    IF v_int_key IS NOT NULL THEN
      v_seq := (SUBSTRING(rec.match_id FROM '^WX7-[0-9]{4}-([0-9]{3,})'))::INT;
      IF v_seq IS NOT NULL THEN
        INSERT INTO public.match_id_sequences (date_key, last_sequence, updated_at)
        VALUES (v_int_key, v_seq, NOW())
        ON CONFLICT (date_key) DO UPDATE
        SET last_sequence = GREATEST(public.match_id_sequences.last_sequence, v_seq),
            updated_at = NOW();
      END IF;
    END IF;
  END LOOP;
END $$;

-- Step 6c: Backfill unassigned existing tournaments chronologically
DO $$
DECLARE
  t RECORD;
  v_pub_key TEXT;
  v_int_key TEXT;
  v_seq INT;
  v_assigned_id TEXT;
BEGIN
  FOR t IN (
    SELECT id, match_time, match_date, created_at
    FROM public.tournaments
    WHERE match_id IS NULL OR TRIM(match_id) = ''
    ORDER BY created_at ASC NULLS LAST
  ) LOOP
    SELECT public_key, internal_key
    INTO v_pub_key, v_int_key
    FROM public.parse_tournament_date_keys(t.match_time, t.match_date, t.created_at);

    IF v_pub_key IS NULL OR v_int_key IS NULL THEN
      v_pub_key := TO_CHAR(COALESCE(t.created_at, NOW()) AT TIME ZONE 'Asia/Kolkata', 'DDMM');
      v_int_key := TO_CHAR(COALESCE(t.created_at, NOW()) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
    END IF;

    -- Atomically increment sequence for this date in match_id_sequences
    INSERT INTO public.match_id_sequences (date_key, last_sequence, updated_at)
    VALUES (v_int_key, 1, NOW())
    ON CONFLICT (date_key) DO UPDATE
    SET last_sequence = public.match_id_sequences.last_sequence + 1,
        updated_at = NOW()
    RETURNING last_sequence INTO v_seq;

    v_assigned_id := 'WX7-' || v_pub_key || '-' || LPAD(v_seq::TEXT, 3, '0');

    UPDATE public.tournaments
    SET match_id = v_assigned_id
    WHERE id = t.id;
  END LOOP;
END $$;

-- 7. Pure Authoritative Sequential Match ID Generator
-- Uses match_id_sequences row exclusively (NO MAX(match_id) scan)
-- Concurrency-safe via atomic INSERT ... ON CONFLICT row lock
CREATE OR REPLACE FUNCTION public.generate_next_match_id(
  p_match_time TEXT DEFAULT NULL,
  p_match_date TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public_key TEXT;
  v_internal_key TEXT;
  v_next_seq INT;
  v_generated_id TEXT;
BEGIN
  -- Extract IST date keys
  SELECT public_key, internal_key 
  INTO v_public_key, v_internal_key
  FROM public.parse_tournament_date_keys(p_match_time, p_match_date, p_created_at);

  IF v_public_key IS NULL OR v_internal_key IS NULL THEN
    v_public_key := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'DDMM');
    v_internal_key := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  END IF;

  -- Authoritative Atomic Increment in match_id_sequences
  INSERT INTO public.match_id_sequences (date_key, last_sequence, updated_at)
  VALUES (v_internal_key, 1, NOW())
  ON CONFLICT (date_key) DO UPDATE
  SET last_sequence = public.match_id_sequences.last_sequence + 1,
      updated_at = NOW()
  RETURNING last_sequence INTO v_next_seq;

  -- Construct final Match ID (WX7-DDMM-XXX)
  v_generated_id := 'WX7-' || v_public_key || '-' || LPAD(v_next_seq::TEXT, 3, '0');
  RETURN v_generated_id;
END;
$$;

-- 8. BEFORE INSERT Trigger on public.tournaments
-- Generates Match ID for ANY tournament creation (Admin, Staff, API)
CREATE OR REPLACE FUNCTION public.trg_assign_tournament_match_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If match_id is not supplied, generate atomic sequential ID
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

DROP TRIGGER IF EXISTS trg_tournaments_match_id ON public.tournaments;
CREATE TRIGGER trg_tournaments_match_id
BEFORE INSERT ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_tournament_match_id();

-- 9. Grant execute permissions on functions ONLY to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.parse_tournament_date_keys(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parse_tournament_date_keys(TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_next_match_id(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_match_id(TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.trg_assign_tournament_match_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_assign_tournament_match_id() TO authenticated, service_role;

-- 10. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
