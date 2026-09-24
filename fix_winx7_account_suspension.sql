-- ==============================================================================
-- WINX7 Account Suspension Persistence & Security Hardening Migration
-- ==============================================================================

-- 1. Ensure all suspension and ban columns exist on public.profiles
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT '';

-- 2. Create index on is_suspended and status for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_suspension ON public.profiles(id, is_suspended, status);

-- 3. Database Trigger: Protect User Suspension from being overwritten by client/mobile upserts
-- This trigger ensures that once an account is marked as suspended (is_suspended = true or status = 'SUSPENDED'),
-- only an authorized administrator via the backend service_role can restore the account to ACTIVE or clear is_suspended.
-- Note: It strictly avoids automatically setting is_blocked = true unless already blocked or required by business logic.
CREATE OR REPLACE FUNCTION public.protect_user_suspension_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  -- Check PostgreSQL session role or Supabase JWT role
  BEGIN
    v_role := current_setting('role', true);
  EXCEPTION WHEN OTHERS THEN
    v_role := '';
  END;

  -- On UPDATE: If the profile was already suspended in the database
  IF (TG_OP = 'UPDATE' AND (OLD.is_suspended = true OR UPPER(COALESCE(OLD.status, '')) IN ('SUSPENDED', 'BANNED'))) THEN
    -- And the incoming update attempts to lift the suspension (setting is_suspended = false or status = 'ACTIVE')
    IF (NEW.is_suspended = false OR UPPER(COALESCE(NEW.status, '')) = 'ACTIVE') THEN
      -- Only allow if the executing role is service_role (Admin API backend)
      IF (v_role != 'service_role' AND (auth.role() != 'service_role' OR auth.role() IS NULL)) THEN
        -- Preserve the suspension, reason, and do not mutate is_blocked
        NEW.is_suspended := true;
        NEW.status := 'SUSPENDED';
        NEW.is_blocked := OLD.is_blocked;
        NEW.is_banned := OLD.is_banned;
        NEW.ban_reason := COALESCE(NULLIF(NEW.ban_reason, ''), OLD.ban_reason);
      END IF;
    ELSE
      -- If the update is keeping or updating fields other than status/is_suspended, preserve existing ban_reason if not supplied
      IF (NEW.ban_reason IS NULL OR TRIM(NEW.ban_reason) = '') THEN
        NEW.ban_reason := OLD.ban_reason;
      END IF;
    END IF;
  END IF;

  -- If is_suspended is true, ensure status consistently reflects SUSPENDED
  -- (Do NOT automatically set is_blocked = true)
  IF (NEW.is_suspended = true) THEN
    NEW.status := 'SUSPENDED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_suspension_status ON public.profiles;
CREATE TRIGGER trg_protect_user_suspension_status
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_user_suspension_status();

-- 4. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
