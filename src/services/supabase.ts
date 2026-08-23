import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://phuduaampsjenkreufmz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Y6DY8s-Cph3gIbEMRqWNLg_fodyJPrj';

// Create Supabase client using the provided project credentials and publishable key
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function handleSupabaseError(error: any, context: string): void {
  if (!error) return;
  const msg = error.message || error.details || error.hint || String(error);
  console.warn(`[Supabase Error in ${context}]:`, msg);
}
