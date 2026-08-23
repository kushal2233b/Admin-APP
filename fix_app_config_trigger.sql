-- ==========================================================
-- SUPABASE FIX: sync_app_config_to_general Trigger Function
-- ==========================================================
-- Problem:
-- When editing or updating "app_config" from the Supabase Dashboard,
-- SQL Editor, or application, PostgreSQL raises:
--   "ERROR: 42703: record "new" has no field "value""
-- Because the trigger function "sync_app_config_to_general()"
-- directly dereferences "NEW.value", which does not exist in the
-- "app_config" table schema.
--
-- Solution:
-- 1. Drops the faulty trigger and function.
-- 2. Rewrites "sync_app_config_to_general()" to dynamically inspect
--    the actual columns of both "public.app_config" and "public.general"
--    using to_jsonb(NEW) and information_schema metadata.
-- 3. Handles both single-column JSON/Text stores (data, config, settings,
--    content, payload, json_data, privacy_policy_text) and wide-column
--    configurations (app_name, upi_id, contact_email, etc.) safely.
-- 4. Recreates the trigger on "public.app_config".
-- ==========================================================

-- Drop any existing triggers attached to sync_app_config_to_general
DROP TRIGGER IF EXISTS tr_sync_app_config_to_general ON public.app_config;
DROP TRIGGER IF EXISTS sync_app_config_to_general_trigger ON public.app_config;
DROP TRIGGER IF EXISTS sync_app_config_trigger ON public.app_config;
DROP TRIGGER IF EXISTS app_config_sync_trigger ON public.app_config;
DROP TRIGGER IF EXISTS trigger_sync_app_config ON public.app_config;

-- Drop existing function
DROP FUNCTION IF EXISTS public.sync_app_config_to_general() CASCADE;

-- Create resilient, schema-aware trigger function
CREATE OR REPLACE FUNCTION public.sync_app_config_to_general()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_json JSONB;
  v_general_exists BOOLEAN;
  v_general_cols TEXT[];
  v_app_config_cols TEXT[];
  v_common_cols TEXT[];
  v_col TEXT;
  v_id_val TEXT;
  v_target_col TEXT;
  
  -- Flags for general table columns
  v_has_general_id BOOLEAN;
  v_has_general_key BOOLEAN;
  v_has_general_value BOOLEAN;
  v_has_general_data BOOLEAN;
  v_has_general_config BOOLEAN;
  v_has_general_settings BOOLEAN;
  v_has_general_content BOOLEAN;
  v_has_general_payload BOOLEAN;
  v_has_general_json_data BOOLEAN;
  v_has_general_updated_at BOOLEAN;
  
  v_json_content JSONB;
  v_sync_sql TEXT;
  v_set_clauses TEXT[];
  v_col_names TEXT[];
  v_col_placeholders TEXT[];
BEGIN
  -- 1. Safely convert NEW record to JSONB (never errors regardless of column names)
  v_new_json := to_jsonb(NEW);
  IF v_new_json IS NULL THEN
    RETURN NEW;
  END IF;

  -- Extract identifier (e.g. 'global', 'general', key, id)
  v_id_val := COALESCE(
    v_new_json->>'id',
    v_new_json->>'key',
    v_new_json->>'config_id',
    v_new_json->>'name',
    'global'
  );

  -- Extract payload content dynamically from whichever columns exist in NEW
  v_json_content := COALESCE(
    CASE WHEN v_new_json ? 'data' THEN v_new_json->'data' ELSE NULL END,
    CASE WHEN v_new_json ? 'config' THEN v_new_json->'config' ELSE NULL END,
    CASE WHEN v_new_json ? 'settings' THEN v_new_json->'settings' ELSE NULL END,
    CASE WHEN v_new_json ? 'content' THEN v_new_json->'content' ELSE NULL END,
    CASE WHEN v_new_json ? 'payload' THEN v_new_json->'payload' ELSE NULL END,
    CASE WHEN v_new_json ? 'json_data' THEN v_new_json->'json_data' ELSE NULL END,
    CASE WHEN v_new_json ? 'value' THEN v_new_json->'value' ELSE NULL END,
    v_new_json
  );

  -- If content is stored as a JSON string, try parsing to JSONB
  IF jsonb_typeof(v_json_content) = 'string' THEN
    BEGIN
      v_json_content := (v_json_content #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      -- Keep as string if not valid JSON
    END;
  END IF;

  -- 2. Check if public.general table exists in this database
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'general'
  ) INTO v_general_exists;

  IF NOT v_general_exists THEN
    -- If 'general' table does not exist, nothing to synchronize, return NEW cleanly
    RETURN NEW;
  END IF;

  -- 3. Introspect columns in public.general
  SELECT array_agg(column_name::text)
  INTO v_general_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'general';

  IF v_general_cols IS NULL OR array_length(v_general_cols, 1) = 0 THEN
    RETURN NEW;
  END IF;

  v_has_general_id := 'id' = ANY(v_general_cols);
  v_has_general_key := 'key' = ANY(v_general_cols);
  v_has_general_value := 'value' = ANY(v_general_cols);
  v_has_general_data := 'data' = ANY(v_general_cols);
  v_has_general_config := 'config' = ANY(v_general_cols);
  v_has_general_settings := 'settings' = ANY(v_general_cols);
  v_has_general_content := 'content' = ANY(v_general_cols);
  v_has_general_payload := 'payload' = ANY(v_general_cols);
  v_has_general_json_data := 'json_data' = ANY(v_general_cols);
  v_has_general_updated_at := 'updated_at' = ANY(v_general_cols);

  -- 4. Introspect columns in public.app_config to find common columns
  SELECT array_agg(column_name::text)
  INTO v_app_config_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'app_config';

  SELECT array_agg(c)
  INTO v_common_cols
  FROM unnest(v_app_config_cols) AS c
  WHERE c = ANY(v_general_cols) AND c NOT IN ('id', 'key', 'created_at');

  -- 5. Synchronize based on discovered schema
  -- Case A: Column-to-Column Mirroring (When both tables share matching configuration columns)
  IF v_common_cols IS NOT NULL AND array_length(v_common_cols, 1) > 0 THEN
    v_set_clauses := ARRAY[]::TEXT[];
    v_col_names := ARRAY[]::TEXT[];
    v_col_placeholders := ARRAY[]::TEXT[];

    IF v_has_general_id THEN
      v_col_names := array_append(v_col_names, 'id');
      v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_id_val));
    ELSIF v_has_general_key THEN
      v_col_names := array_append(v_col_names, 'key');
      v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_id_val));
    END IF;

    FOREACH v_col IN ARRAY v_common_cols
    LOOP
      IF v_new_json ? v_col THEN
        v_col_names := array_append(v_col_names, quote_ident(v_col));
        v_col_placeholders := array_append(v_col_placeholders, quote_literal(v_new_json->>v_col));
        v_set_clauses := array_append(v_set_clauses, quote_ident(v_col) || ' = ' || quote_literal(v_new_json->>v_col));
      END IF;
    END LOOP;

    IF v_has_general_updated_at AND NOT ('updated_at' = ANY(v_common_cols)) THEN
      v_col_names := array_append(v_col_names, 'updated_at');
      v_col_placeholders := array_append(v_col_placeholders, 'NOW()');
      v_set_clauses := array_append(v_set_clauses, 'updated_at = NOW()');
    END IF;

    IF array_length(v_col_names, 1) > 0 THEN
      IF v_has_general_id THEN
        v_sync_sql := 'INSERT INTO public.general (' || array_to_string(v_col_names, ', ') || ') ' ||
                      'VALUES (' || array_to_string(v_col_placeholders, ', ') || ') ' ||
                      'ON CONFLICT (id) DO UPDATE SET ' || array_to_string(v_set_clauses, ', ');
      ELSIF v_has_general_key THEN
        v_sync_sql := 'INSERT INTO public.general (' || array_to_string(v_col_names, ', ') || ') ' ||
                      'VALUES (' || array_to_string(v_col_placeholders, ', ') || ') ' ||
                      'ON CONFLICT (key) DO UPDATE SET ' || array_to_string(v_set_clauses, ', ');
      ELSE
        v_sync_sql := 'UPDATE public.general SET ' || array_to_string(v_set_clauses, ', ');
      END IF;

      BEGIN
        EXECUTE v_sync_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'sync_app_config_to_general column sync notice: %', SQLERRM;
      END;
    END IF;

  -- Case B: General table stores configurations in a JSON / Data column
  ELSE
    v_target_col := CASE 
      WHEN v_has_general_value THEN 'value'
      WHEN v_has_general_data THEN 'data'
      WHEN v_has_general_config THEN 'config'
      WHEN v_has_general_settings THEN 'settings'
      WHEN v_has_general_content THEN 'content'
      WHEN v_has_general_payload THEN 'payload'
      WHEN v_has_general_json_data THEN 'json_data'
      ELSE NULL
    END;

    IF v_target_col IS NOT NULL THEN
      IF v_has_general_id THEN
        v_sync_sql := 'INSERT INTO public.general (id, ' || quote_ident(v_target_col) || CASE WHEN v_has_general_updated_at THEN ', updated_at' ELSE '' END || ') ' ||
                      'VALUES ($1, $2' || CASE WHEN v_has_general_updated_at THEN ', NOW()' ELSE '' END || ') ' ||
                      'ON CONFLICT (id) DO UPDATE SET ' || quote_ident(v_target_col) || ' = EXCLUDED.' || quote_ident(v_target_col) ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_id_val, v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general json sync notice: %', SQLERRM;
        END;
      ELSIF v_has_general_key THEN
        v_sync_sql := 'INSERT INTO public.general (key, ' || quote_ident(v_target_col) || CASE WHEN v_has_general_updated_at THEN ', updated_at' ELSE '' END || ') ' ||
                      'VALUES ($1, $2' || CASE WHEN v_has_general_updated_at THEN ', NOW()' ELSE '' END || ') ' ||
                      'ON CONFLICT (key) DO UPDATE SET ' || quote_ident(v_target_col) || ' = EXCLUDED.' || quote_ident(v_target_col) ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_id_val, v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general json sync notice: %', SQLERRM;
        END;
      ELSE
        v_sync_sql := 'UPDATE public.general SET ' || quote_ident(v_target_col) || ' = $1' ||
                      CASE WHEN v_has_general_updated_at THEN ', updated_at = NOW()' ELSE '' END;
        BEGIN
          EXECUTE v_sync_sql USING v_json_content;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'sync_app_config_to_general update notice: %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal exception handler guarantees the primary app_config mutation always succeeds
  RAISE WARNING 'sync_app_config_to_general warning: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create the trigger on public.app_config
CREATE TRIGGER tr_sync_app_config_to_general
AFTER INSERT OR UPDATE ON public.app_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_app_config_to_general();

-- Grant appropriate execution permissions
GRANT EXECUTE ON FUNCTION public.sync_app_config_to_general() TO authenticated, service_role, anon;
