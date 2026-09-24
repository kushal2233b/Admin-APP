-- WINX7 AUTOMATIC MATCH STATUS SYSTEM MIGRATION
-- Authoritative status transition and safety rules

-- 1. Function to safely calculate and synchronize match status in PostgreSQL
CREATE OR REPLACE FUNCTION public.sync_tournament_statuses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_now_kolkata TIMESTAMP WITH TIME ZONE := NOW() AT TIME ZONE 'Asia/Kolkata';
  r RECORD;
  v_scheduled_at TIMESTAMP WITH TIME ZONE;
  v_live_threshold TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Scan all non-completed, non-cancelled matches
  FOR r IN 
    SELECT id, title, match_date, match_time, status, results_published, completed_at
    FROM public.tournaments
    WHERE results_published IS NOT TRUE
      AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'finished', 'cancelled')
  LOOP
    -- Safely parse scheduled start time in Asia/Kolkata timezone
    BEGIN
      -- If match_time is ISO format
      IF r.match_time ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN
        v_scheduled_at := (r.match_time)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata';
      ELSIF r.match_date ~ '^\d{2}/\d{2}/\d{4}' AND r.match_time ~ '^\d{1,2}:\d{2}' THEN
        -- Date DD/MM/YYYY + Time HH:mm
        v_scheduled_at := TO_TIMESTAMP(r.match_date || ' ' || r.match_time, 'DD/MM/YYYY HH24:MI') AT TIME ZONE 'Asia/Kolkata';
      ELSIF r.match_date ~ '^\d{4}-\d{2}-\d{2}' AND r.match_time ~ '^\d{1,2}:\d{2}' THEN
        -- Date YYYY-MM-DD + Time HH:mm
        v_scheduled_at := TO_TIMESTAMP(r.match_date || ' ' || r.match_time, 'YYYY-MM-DD HH24:MI') AT TIME ZONE 'Asia/Kolkata';
      ELSE
        v_scheduled_at := NULL;
      END IF;

      -- If scheduled start time was determined, check +30 seconds rule
      IF v_scheduled_at IS NOT NULL THEN
        v_live_threshold := v_scheduled_at + INTERVAL '30 seconds';
        
        IF NOW() >= v_live_threshold AND LOWER(COALESCE(r.status, '')) = 'upcoming' THEN
          UPDATE public.tournaments
          SET status = 'LIVE',
              updated_at = NOW()
          WHERE id = r.id;
          
          v_count := v_count + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Silently skip unparseable row without failing the batch
      CONTINUE;
    END EXCEPTION;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_to_live_count', v_count,
    'server_time', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_tournament_statuses() TO authenticated, service_role, anon;
