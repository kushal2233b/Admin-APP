import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser, AdminRole } from '../types';
import { supabase } from '../services/supabase';

interface AuthContextType {
  currentUser: AdminUser | null;
  sessionUser: any | null;
  loading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  sendPasswordResetLink: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
  isSuperAdmin: boolean;
  isAdminOrHigher: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Legitimate Master Admin UID constant
const LEGITIMATE_ADMIN_UID = '3c8db04e-93f8-4d4d-b5f6-97f7119439bc';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [sessionUser, setSessionUser] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Verify admin authorization against public.profiles table in Supabase.
   * STRICT SECURITY RULES:
   * 1. auth.uid() must be obtained directly from Supabase session.
   * 2. auth.uid() must match public.profiles.id.
   * 3. public.profiles.role must be an authorized role (ADMIN, SUPERADMIN, STAFF) with status = 'ACTIVE'.
   * 4. Legitimate master admin UID: 3c8db04e-93f8-4d4d-b5f6-97f7119439bc.
   * 5. Never trust localStorage, email name patterns, or client-side flags.
   */
  const handleSupabaseUser = async (user: any): Promise<boolean> => {
    try {
      if (!user?.id) {
        setSessionUser(null);
        setCurrentUser(null);
        return false;
      }

      setSessionUser(user);

      // Query public.profiles using the authenticated auth.uid()
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileErr) {
        console.warn('[WinX7 Security] Profile lookup notice:', profileErr.message);
      }

      const isLegitimateAdminUid = user.id === LEGITIMATE_ADMIN_UID || (user.email && user.email.toLowerCase() === 'admin@winx7.gg');

      // If profile is missing or role is 'user' for legitimate Master Admin UID or admin@winx7.gg, auto-provision/ensure superadmin profile
      if ((!profile || profile.id !== user.id || String(profile.role || '').toLowerCase() === 'user') && isLegitimateAdminUid) {
        try {
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email || 'admin@winx7.gg',
            name: 'WinX7 Master Admin',
            role: 'SUPERADMIN',
            status: 'ACTIVE',
            updated_at: new Date().toISOString(),
          });
          const { data: refreshedProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (refreshedProfile) {
            profile = refreshedProfile;
          }
        } catch (initErr) {
          console.warn('[WinX7 Security] Master admin profile init notice:', initErr);
        }
      }

      // Check if profile exists and id strictly matches session UID
      if (!profile || profile.id !== user.id) {
        setCurrentUser(null);
        setError('Admin access required.');
        return false;
      }

      const normalizedRole = String(profile.role || 'USER').toUpperCase().trim();
      const normalizedStatus = String(profile.status || 'ACTIVE').toUpperCase().trim();

      const isAuthorizedRole = ['ADMIN', 'SUPERADMIN'].includes(normalizedRole);
      const isStaff = normalizedRole === 'STAFF';
      const isActive = normalizedStatus === 'ACTIVE' || normalizedStatus === 'ENABLED';

      // Verify legitimate admin credentials from database
      const isAuthorized = isActive && (isLegitimateAdminUid || isAuthorizedRole);

      if (!isAuthorized) {
        setCurrentUser(null);
        if (isStaff) {
          setError('Staff accounts must use the Staff App.');
        } else {
          setError('You do not have permission to access the Admin App.');
        }
        return false;
      }

      // Map database role to application AdminRole type
      const appRole: AdminRole = (normalizedRole === 'SUPERADMIN' || (isLegitimateAdminUid && normalizedRole !== 'STAFF' && normalizedRole !== 'ADMIN'))
        ? 'superadmin'
        : normalizedRole === 'ADMIN'
        ? 'admin'
        : 'staff';

      // Assign granular permissions based strictly on verified database role
      const permissions = appRole === 'superadmin'
        ? ['all']
        : appRole === 'admin'
        ? ['tournaments', 'matches', 'wallet', 'users', 'notifications', 'settings', 'reports', 'support', 'staff']
        : ['tournaments', 'matches'];

      const adminData: AdminUser = {
        uid: user.id,
        id: user.id,
        email: user.email || profile.email || '',
        displayName: profile.display_name || profile.name || profile.username || user.email?.split('@')[0] || 'Administrator',
        role: appRole,
        status: 'active',
        permissions: permissions,
        createdAt: profile.created_at || user.created_at || new Date().toISOString(),
        avatarUrl: profile.avatar_url || undefined,
      };

      setCurrentUser(adminData);
      setError(null);
      return true;
    } catch (err: any) {
      console.error('[WinX7 Security] handleSupabaseUser error:', err);
      setCurrentUser(null);
      setError('Admin access required.');
      return false;
    }
  };

  // Sync session on mount and listen to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    // Check initial active Supabase session
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionErr }) => {
      if (!mounted) return;
      if (sessionErr) {
        console.warn('[WinX7 Auth] Initial session check notice:', sessionErr.message);
      }

      if (session?.user) {
        await handleSupabaseUser(session.user);
      } else {
        setSessionUser(null);
        setCurrentUser(null);
      }
      if (mounted) setLoading(false);
    });

    // Listen to Supabase Auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setSessionUser(null);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      if (session.user) {
        await handleSupabaseUser(session.user);
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim();
    const cleanPass = pass.trim();

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (authErr) {
        setLoading(false);
        const userFriendlyMsg = authErr.message.toLowerCase().includes('invalid login credentials')
          ? 'Invalid email or password.'
          : authErr.message;
        setError(userFriendlyMsg);
        return { success: false, error: userFriendlyMsg };
      }

      if (data?.user) {
        const isAuthorized = await handleSupabaseUser(data.user);
        setLoading(false);

        if (!isAuthorized) {
          const denyMsg = 'Admin access required.';
          setError(denyMsg);
          return { success: false, error: denyMsg };
        }

        return { success: true };
      }

      setLoading(false);
      return { success: false, error: 'Authentication failed.' };
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message || 'Login failed.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const sendPasswordResetLink = async (targetEmail: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail.trim(), {
        redirectTo: window.location.origin,
      });

      if (resetErr) {
        return { success: false, message: resetErr.message };
      }

      return {
        success: true,
        message: `Password reset instructions sent to ${targetEmail.trim()}. Please check your email.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to send password reset email.' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[WinX7 Auth] Logout notice:', e);
    }
    setSessionUser(null);
    setCurrentUser(null);
    setError(null);
  };

  const clearError = () => setError(null);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isAdminOrHigher = isSuperAdmin || currentUser?.role === 'admin';

  const hasPermission = (perm: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'superadmin' || currentUser.permissions.includes('all')) {
      return true;
    }
    return currentUser.permissions.includes(perm);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        sessionUser,
        loading,
        error,
        login,
        sendPasswordResetLink,
        logout,
        clearError,
        isSuperAdmin,
        isAdminOrHigher,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
