import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { pullFromSupabase, clearCompanyCache, startRealtimeSync, stopRealtimeSync } from '@/services/storageService';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: 'proprietario' | 'administrador' | 'financeiro' | 'visualizador';
  country?: 'BR' | 'PY';
  account_type?: 'pessoal' | 'empresa';
  company_name?: string;
  document?: string;
  phone?: string;
  company_id?: string;
  plan_id?: string;
  created_at: string;
  permissions?: Record<string, { view: boolean; edit: boolean; delete: boolean }>;
  is_collaborator?: boolean;
  collaborator_id?: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  country: 'BR' | 'PY';
  accountType: 'empresa' | 'pessoal';
  companyName?: string;
  document: string;
  phone: string;
  planId?: string;
}

interface CollaboratorData {
  id: string;
  name: string;
  email: string;
  role: 'proprietario' | 'administrador' | 'financeiro' | 'visualizador';
  permissions: any;
  companyId: string;
  companyName: string;
}

interface AuthContextType {
  user: UserProfile | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<string | null>;
  loginAsCollaborator: (data: CollaboratorData) => void;
  register: (data: RegisterData) => Promise<string | null>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  suspendedCompany: string | null;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
// No more localStorage for user scope — everything comes from Supabase
const COMPANY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suspendedCompany, setSuspendedCompany] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedForUser = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return null;

    // Use SECURITY DEFINER RPC to bypass RLS issues
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_own_profile');
    if (!rpcError && rpcData && rpcData.length > 0) {
      console.log('[Auth] Profile loaded via RPC:', rpcData[0].email);
      return rpcData[0] as UserProfile;
    }

    // Fallback to direct query
    console.warn('[Auth] RPC get_own_profile failed, falling back to direct query:', rpcError?.message);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      console.error('[Auth] Profile fetch failed:', error?.message);
      return null;
    }

    const userProfile = data as UserProfile;

    // Self-repair logic: if company_id is missing but user is owner, try to find it in saas_companies
    if (!userProfile.company_id && userProfile.role === 'proprietario' && userProfile.email) {
      console.log('[Auth] Profile missing company_id, attempting self-repair for:', userProfile.email);
      try {
        const { data: saasData, error: saasError } = await supabase
          .from('saas_companies')
          .select('id')
          .eq('contact_email', userProfile.email)
          .maybeSingle();

        if (!saasError && saasData) {
          console.log('[Auth] Found matching company in saas_companies:', saasData.id);
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ company_id: saasData.id })
            .eq('id', userId);

          if (!updateError) {
            userProfile.company_id = saasData.id;
            console.log('[Auth] Profile repaired with company_id!');
          } else {
            console.error('[Auth] Failed to update profile during repair:', updateError.message);
          }
        } else if (saasError) {
          console.warn('[Auth] Error searching saas_companies for repair:', saasError.message);
        }
      } catch (err) {
        console.error('[Auth] Unexpected error during profile repair:', err);
      }
    }

    return userProfile;
  };

  const checkCompanyStatus = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data, error } = await supabase.rpc('check_company_status');
      if (error) {
        console.warn('[Auth] check_company_status RPC error:', error.message);
        setSuspendedCompany(null);
        return;
      }
      if (data && data.length > 0) {
        const { company_status, company_name } = data[0];
        if (company_status === 'suspenso' || company_status === 'inativo') {
          setSuspendedCompany(company_name || 'Empresa');
        } else {
          setSuspendedCompany(null);
        }
      } else {
        setSuspendedCompany(null);
      }
    } catch {
      setSuspendedCompany(null);
    }
  }, []);

  const startCompanyPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(checkCompanyStatus, COMPANY_CHECK_INTERVAL);
  }, [checkCompanyStatus]);

  const stopCompanyPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      // Session managed by Supabase — no localStorage needed

      if (session?.user) {
        // Skip if already initialized for this user (getSession already ran)
        if (initializedForUser.current === session.user.id) {
          setIsLoading(false);
          return;
        }
        setTimeout(async () => {
          if (initializedForUser.current === session.user.id) {
            setIsLoading(false);
            return;
          }
          initializedForUser.current = session.user.id;
          const p = await fetchProfile(session.user.id);
          setProfile(p);
          clearCompanyCache();
          await pullFromSupabase();
          await startRealtimeSync();
          await checkCompanyStatus();
          startCompanyPolling();
          setIsLoading(false);
        }, 0);
      } else {
        // Check for collaborator session
        const savedCollab = sessionStorage.getItem('veltor_collaborator');
        if (savedCollab) {
          try {
            const data = JSON.parse(savedCollab);
            setProfile({
              id: data.id,
              name: data.name,
              email: data.email || '',
              role: data.role,
              company_id: data.companyId,
              company_name: data.companyName,
              created_at: new Date().toISOString(),
              permissions: data.permissions || undefined,
              is_collaborator: true,
              collaborator_id: data.id,
            });
          } catch { /* ignore */ }
        } else {
          setProfile(null);
        }
        stopCompanyPolling();
        stopRealtimeSync();
        setSuspendedCompany(null);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(async (p) => {
          if (initializedForUser.current === session.user.id) {
            // Already initialized by onAuthStateChange
            setProfile(p);
            setIsLoading(false);
            return;
          }
          initializedForUser.current = session.user.id;
          setProfile(p);
          clearCompanyCache();
          await pullFromSupabase();
          await startRealtimeSync();
          await checkCompanyStatus();
          startCompanyPolling();
          setIsLoading(false);
        });
      } else {
        // Check for collaborator session
        const savedCollab = sessionStorage.getItem('veltor_collaborator');
        if (savedCollab) {
          try {
            const data = JSON.parse(savedCollab);
            setProfile({
              id: data.id,
              name: data.name,
              email: data.email || '',
              role: data.role,
              company_id: data.companyId,
              company_name: data.companyName,
              created_at: new Date().toISOString(),
              permissions: data.permissions || undefined,
              is_collaborator: true,
              collaborator_id: data.id,
            });
          } catch { /* ignore */ }
        }
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      stopCompanyPolling();
      stopRealtimeSync();
    };
  }, [checkCompanyStatus, startCompanyPolling, stopCompanyPolling]);

  const login = async (email: string, password: string): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return 'supabase_not_configured';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'login_error';

    if (data.user) {
      const p = await fetchProfile(data.user.id);
      setProfile(p);
      clearCompanyCache();
      await pullFromSupabase();
      await checkCompanyStatus();
    }
    return null;
  };

  const register = async (data: RegisterData): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return 'supabase_not_configured';

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          name: data.name,
          country: data.country,
          account_type: data.accountType,
          company_name: data.accountType === 'empresa' ? (data.companyName || '') : '',
          document: data.document,
          phone: data.phone,
          plan_id: data.planId,
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered')) return 'register_email_exists';
      return error.message;
    }

    // Update profile with additional data
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: data.name,
          country: data.country,
          account_type: data.accountType,
          company_name: data.accountType === 'empresa' ? data.companyName : null,
          document: data.document,
          phone: data.phone,
          role: 'proprietario',
          plan_id: data.planId || null,
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error('Error updating profile:', profileError);
      }

      const p = await fetchProfile(authData.user.id);
      setProfile(p);
    }

    return null;
  };

  const loginAsCollaborator = (data: CollaboratorData) => {
    const collaboratorProfile: UserProfile = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      company_id: data.companyId,
      company_name: data.companyName,
      created_at: new Date().toISOString(),
      permissions: data.permissions || undefined,
      is_collaborator: true,
      collaborator_id: data.id,
    };
    setProfile(collaboratorProfile);
    // Store in sessionStorage for page refreshes
    sessionStorage.setItem('veltor_collaborator', JSON.stringify(data));
  };

  const logout = async () => {
    stopRealtimeSync();
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setSupabaseUser(null);
    setSession(null);
    setSuspendedCompany(null);
    sessionStorage.removeItem('veltor_collaborator');
    initializedForUser.current = null;
    clearCompanyCache();
  };

  // On mount, restore collaborator session if exists
  const isCollaboratorSession = !!sessionStorage.getItem('veltor_collaborator') && !session;

  return (
    <AuthContext.Provider
      value={{
        user: profile,
        supabaseUser,
        session,
        login,
        loginAsCollaborator,
        register,
        logout,
        isAuthenticated: (!!session && !!profile) || (!!profile && isCollaboratorSession),
        isLoading,
        suspendedCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
