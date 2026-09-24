-- ============================================================================
-- WINX7 SUPABASE MIGRATION: SECURE STAFF DAILY TASKS & PERFORMANCE
-- ============================================================================
-- 1. Creates staff_daily_tasks table with 20-20-20 default targets.
-- 2. Implements strict Row Level Security (RLS) without 'OLD' references.
-- 3. Implements a BEFORE UPDATE trigger to prevent staff from modifying task targets, counts, staff_id, and date.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.staff_daily_tasks (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  room_releases_count INTEGER NOT NULL DEFAULT 0,
  room_releases_target INTEGER NOT NULL DEFAULT 20,
  matches_created_count INTEGER NOT NULL DEFAULT 0,
  matches_created_target INTEGER NOT NULL DEFAULT 20,
  result_submissions_count INTEGER NOT NULL DEFAULT 0,
  result_submissions_target INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_daily_tasks_staff_id_date_key UNIQUE (staff_id, date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.staff_daily_tasks ENABLE ROW LEVEL SECURITY;

-- Drop legacy or insecure policies if any
DROP POLICY IF EXISTS "Enable read/write for staff and admins on staff_daily_tasks" ON public.staff_daily_tasks;
DROP POLICY IF EXISTS "Staff view own tasks and admins view all" ON public.staff_daily_tasks;
DROP POLICY IF EXISTS "Admins manage all staff tasks" ON public.staff_daily_tasks;
DROP POLICY IF EXISTS "Staff and admins insert task rows" ON public.staff_daily_tasks;
DROP POLICY IF EXISTS "Staff and admins update task rows" ON public.staff_daily_tasks;

-- 1. SELECT Policy: Staff view own tasks, Admins view all
CREATE POLICY "Staff view own tasks and admins view all"
  ON public.staff_daily_tasks
  FOR SELECT
  USING (
    auth.uid()::text = staff_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('admin', 'superadmin', 'administrator')
    )
  );

-- 2. INSERT Policy: Staff and admins can insert task rows for their staff_id
CREATE POLICY "Staff and admins insert task rows"
  ON public.staff_daily_tasks
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = staff_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('admin', 'superadmin', 'administrator')
    )
  );

-- 3. UPDATE Policy: Staff and admins can update task rows
CREATE POLICY "Staff and admins update task rows"
  ON public.staff_daily_tasks
  FOR UPDATE
  USING (
    auth.uid()::text = staff_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('admin', 'superadmin', 'administrator')
    )
  )
  WITH CHECK (
    auth.uid()::text = staff_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND LOWER(profiles.role) IN ('admin', 'superadmin', 'administrator')
    )
  );

-- 4. TRIGGER FUNCTION: Prevent staff from modifying task targets and verified counts
CREATE OR REPLACE FUNCTION public.protect_staff_task_targets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- If invoked via service_role or backend where auth.uid() is null, bypass check
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if current user is admin or superadmin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND LOWER(profiles.role) IN ('admin', 'superadmin', 'administrator')
  ) INTO v_is_admin;

  -- If updating an existing row and caller is not an admin, strictly enforce immutable fields
  IF (TG_OP = 'UPDATE') AND NOT v_is_admin THEN
    
    -- Prevent modification of targets
    IF (NEW.room_releases_target IS DISTINCT FROM OLD.room_releases_target) OR
       (NEW.matches_created_target IS DISTINCT FROM OLD.matches_created_target) OR
       (NEW.result_submissions_target IS DISTINCT FROM OLD.result_submissions_target) THEN
      RAISE EXCEPTION 'Unauthorized: Staff members cannot modify task targets. Only administrators can adjust targets.';
    END IF;

    -- Prevent manual modification of verified activity counts
    IF (NEW.room_releases_count IS DISTINCT FROM OLD.room_releases_count) OR
       (NEW.matches_created_count IS DISTINCT FROM OLD.matches_created_count) OR
       (NEW.result_submissions_count IS DISTINCT FROM OLD.result_submissions_count) THEN
      RAISE EXCEPTION 'Unauthorized: Task counts can only be updated securely through verified backend activity or triggers.';
    END IF;

    -- Prevent modifying the ownership or date of the task row
    IF (NEW.staff_id IS DISTINCT FROM OLD.staff_id) OR
       (NEW.date IS DISTINCT FROM OLD.date) THEN
      RAISE EXCEPTION 'Unauthorized: Staff members cannot modify task ownership or date.';
    END IF;
    
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_staff_task_targets ON public.staff_daily_tasks;
CREATE TRIGGER trg_protect_staff_task_targets
BEFORE UPDATE ON public.staff_daily_tasks
FOR EACH ROW
EXECUTE FUNCTION public.protect_staff_task_targets();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_daily_tasks_staff_id ON public.staff_daily_tasks(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_daily_tasks_date ON public.staff_daily_tasks(date);
