-- ====================================================================
-- WINX7 AUTOMATIC MATCH STATUS SYSTEM - DATABASE MIGRATION
-- Authoritative status transition and safety rules in PostgreSQL
-- Timezone: Asia/Kolkata (UTC+05:30)
-- ====================================================================

-- 1. Helper function: Parse tournament scheduled start time to TIMESTAMPTZ (Asia/Kolkata)
CREATE OR REPLACE FUNCTION public.parse_tournament_start_time_kolkata(
  p_match_time TEXT,
  p_match_date TEXT,
  p_time_fallback TEXT DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw_time TEXT := TRIM(COALESCE(p_match_time, ''));
  v_raw_date TEXT := TRIM(COALESCE(p_match_date, ''));
  v_fallback_time TEXT := TRIM(COALESCE(p_time_fallback, ''));
  v_result TIMESTAMP WITH TIME ZONE := NULL;
  v_year INT;
  v_month INT;
  v_day INT;
  v_hour INT := 0;
  v_minute INT := 0;
  v_second INT := 0;
  v_ampm TEXT := '';
  v_time_to_parse TEXT;
  v_matches TEXT[];
BEGIN
  -- A. Check if p_match_time is already an ISO string with explicit timezone or local format
  IF v_raw_time <> '' THEN
    -- If contains Z or timezone offset (+hh:mm / -hh:mm)
    IF v_raw_time ~ '(?:Z|[+-]\d{2}:?\d{2})$' THEN
      BEGIN
        v_result := v_raw_time::TIMESTAMPTZ;
        RETURN v_result;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- If ISO format YYYY-MM-DDTHH:mm(:ss)?
    IF v_raw_time ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN
      BEGIN
        v_result := (SUBSTRING(v_raw_time FROM 1 FOR 19) || '+05:30')::TIMESTAMPTZ;
        RETURN v_result;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  -- B. Extract time components (12-hour or 24-hour)
  v_time_to_parse := CASE WHEN v_raw_time <> '' THEN v_raw_time ELSE v_fallback_time END;
  IF v_time_to_parse <> '' THEN
    -- Match HH:MI:SS AM/PM or HH:MI
    v_matches := REGEXP_MATCH(v_time_to_parse, '(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?', 'i');
    IF v_matches IS NOT NULL THEN
      v_hour := (v_matches[1])::INT;
      v_minute := (v_matches[2])::INT;
      IF v_matches[3] IS NOT NULL AND v_matches[3] <> '' THEN
        v_second := (v_matches[3])::INT;
      END IF;
      v_ampm := UPPER(COALESCE(v_matches[4], ''));
      IF v_ampm = 'PM' AND v_hour < 12 THEN
        v_hour := v_hour + 12;
      ELSIF v_ampm = 'AM' AND v_hour = 12 THEN
        v_hour := 0;
      END IF;
    END IF;
  END IF;

  -- C. Extract date components (DD/MM/YYYY or YYYY-MM-DD or Today)
  IF v_raw_date ~ '^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}' THEN
    v_matches := REGEXP_MATCH(v_raw_date, '^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})');
    v_day := (v_matches[1])::INT;
    v_month := (v_matches[2])::INT;
    v_year := (v_matches[3])::INT;
  ELSIF v_raw_date ~ '^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}' THEN
    v_matches := REGEXP_MATCH(v_raw_date, '^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})');
    v_year := (v_matches[1])::INT;
    v_month := (v_matches[2])::INT;
    v_day := (v_matches[3])::INT;
  ELSE
    -- Default to current date in Asia/Kolkata
    v_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    v_month := EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
    v_day := EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
  END IF;

  BEGIN
    v_result := MAKE_TIMESTAMPTZ(v_year, v_month, v_day, v_hour, v_minute, v_second, 'Asia/Kolkata');
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- 2. Function to synchronize upcoming matches to LIVE at scheduled time + 30 seconds
CREATE OR REPLACE FUNCTION public.sync_tournament_statuses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  r RECORD;
  v_scheduled_at TIMESTAMP WITH TIME ZONE;
  v_live_threshold TIMESTAMP WITH TIME ZONE;
BEGIN
  FOR r IN 
    SELECT id, match_id, title, match_date, match_time, time, status, results_published, completed_at
    FROM public.tournaments
    WHERE results_published IS NOT TRUE
      AND completed_at IS NULL
      AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'finished', 'cancelled')
  LOOP
    BEGIN
      v_scheduled_at := public.parse_tournament_start_time_kolkata(r.match_time, r.match_date, r.time);
      
      IF v_scheduled_at IS NOT NULL THEN
        -- Exactly 30 seconds after scheduled start time
        v_live_threshold := v_scheduled_at + INTERVAL '30 seconds';
        
        -- Transition to LIVE if threshold reached and currently UPCOMING
        IF v_now >= v_live_threshold AND LOWER(COALESCE(r.status, '')) IN ('upcoming', 'scheduled', 'upcoming_match', '') THEN
          UPDATE public.tournaments
          SET status = 'LIVE',
              updated_at = NOW()
          WHERE id = r.id
            AND results_published IS NOT TRUE
            AND completed_at IS NULL;
          
          v_count := v_count + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Silently skip unparseable row without failing entire batch
      CONTINUE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_to_live_count', v_count,
    'server_time', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.parse_tournament_start_time_kolkata(TEXT, TEXT, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.sync_tournament_statuses() TO authenticated, service_role, anon;
