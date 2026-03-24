import { createClient } from '@supabase/supabase-js';

const ADMIN_SETTINGS_CACHE_KEY = 'veltor_admin_settings_cache';

function getAdminSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const settings = getAdminSettings();

const FALLBACK_URL = 'https://iapvzhetbytxafseyffx.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcHZ6aGV0Ynl0eGFmc2V5ZmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTI2ODUsImV4cCI6MjA4ODk4ODY4NX0.Y8XN8Z7Y-ZDk84kAOkJbI-IzpLd83MUhzLkVQNLbseM';

const SUPABASE_URL = settings?.supabaseUrl || import.meta.env?.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY = settings?.supabaseAnonKey || import.meta.env?.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Returns the Supabase client.
 */
export function getSupabase() {
  return supabase;
}

/**
 * Check if Supabase is configured and reachable.
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const url = SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: 'HEAD',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok || res.status === 200) return { ok: true, message: 'Conexão bem-sucedida!' };
    return { ok: false, message: `Erro HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Falha na conexão' };
  }
}
