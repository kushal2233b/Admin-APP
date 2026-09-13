-- ====================================================================
-- WINX7 SUPPORT WEB APP: PRODUCTION-GRADE SECURITY & RBAC MIGRATION
-- ====================================================================
-- Description: Sets up the single authoritative application-level role system
-- (public.user_roles) and support categories (public.support_categories)
-- with Row Level Security (RLS) policies and least-privilege grants.

-- --------------------------------------------------------------------
-- 1. SINGLE AUTHORITATIVE ROLE TABLE: public.user_roles
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'support_staff',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_status ON public.user_roles(role, status);

-- --------------------------------------------------------------------
-- 2. SUPPORT CATEGORIES TABLE: public.support_categories
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_support_categories_order ON public.support_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_support_categories_active ON public.support_categories(is_active);

-- --------------------------------------------------------------------
-- 3. SEED DEFAULT CATEGORIES (IDEMPOTENT)
-- --------------------------------------------------------------------
INSERT INTO public.support_categories (id, name, description, is_active, display_order)
VALUES
    ('cat_deposit', 'Deposit', 'Issues related to deposits, wallet credit, and payment verification.', true, 1),
    ('cat_withdrawal', 'Withdrawal', 'Issues related to withdrawals, bank transfers, and UPI payouts.', true, 2),
    ('cat_account', 'Account', 'Issues related to account login, profile details, and security.', true, 3),
    ('cat_tournament', 'Tournament / Match', 'Issues related to match rooms, slot allotment, and tournament scores.', true, 4),
    ('cat_tech', 'Technical Issue', 'App crashes, loading bugs, and device performance issues.', true, 5),
    ('cat_other', 'Other', 'General queries and feedback.', true, 6)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = now();

-- --------------------------------------------------------------------
-- 4. SECURITY DEFINER HELPER FOR ADMIN VERIFICATION
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      LOWER(COALESCE(role, '')) IN ('admin', 'superadmin')
      OR is_admin = true
    )
  );
$$;

-- Restrict direct execution from public/anon, grant to authenticated and service_role for RLS
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;

-- SUPPORT CATEGORIES:
-- 1. Normal users & Anonymous can ONLY read ACTIVE categories
DROP POLICY IF EXISTS "Public can view active support categories" ON public.support_categories;
DROP POLICY IF EXISTS "Non-admins view active categories only" ON public.support_categories;
CREATE POLICY "Non-admins view active categories only"
ON public.support_categories
FOR SELECT
TO authenticated, anon
USING (is_active = true OR public.is_admin_user() OR auth.role() = 'service_role');

-- 2. Only Admins and Service Role can manage categories (Insert, Update, Delete)
DROP POLICY IF EXISTS "Admins can manage support categories" ON public.support_categories;
CREATE POLICY "Admins can manage support categories"
ON public.support_categories
FOR ALL
TO authenticated, service_role
USING (public.is_admin_user() OR auth.role() = 'service_role')
WITH CHECK (public.is_admin_user() OR auth.role() = 'service_role');

-- USER ROLES:
-- 1. Users can view their own roles, Admins view all
DROP POLICY IF EXISTS "Users can view their own roles, admins view all" ON public.user_roles;
CREATE POLICY "Users can view their own roles, admins view all"
ON public.user_roles
FOR SELECT
TO authenticated, service_role
USING (user_id = auth.uid() OR public.is_admin_user() OR auth.role() = 'service_role');

-- 2. Only Admins and Service Role can grant, update, or revoke roles
DROP POLICY IF EXISTS "Only Admins can grant or revoke roles" ON public.user_roles;
CREATE POLICY "Only Admins can grant or revoke roles"
ON public.user_roles
FOR ALL
TO authenticated, service_role
USING (public.is_admin_user() OR auth.role() = 'service_role')
WITH CHECK (public.is_admin_user() OR auth.role() = 'service_role');

-- --------------------------------------------------------------------
-- 6. EXPLICIT POSTGRESQL TABLE GRANTS (LEAST PRIVILEGE)
-- --------------------------------------------------------------------
REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.support_categories FROM anon, authenticated;
GRANT SELECT ON public.support_categories TO anon, authenticated;
GRANT ALL ON public.support_categories TO service_role;
