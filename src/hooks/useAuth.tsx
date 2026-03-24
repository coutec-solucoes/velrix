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
  loginCollaborator: (companyCode: string, username: string, password: string) => Promise<string | null>;
  loginAsCollaborator: (data: CollaboratorData) => void;
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

  const loginAsCollaborator = (data: CollaboratorData) => {    const collaboratorProfile: UserProfile = {
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

  const loginCollaborator = async (companyCode: string, username: string, password: string): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return 'Banco de dados não configurado.';

    // Edge Function fallback architecture
    const { data: result, error: fnError } = await supabase.functions.invoke('authenticate-collaborator', {
      body: { companyCode, username, password },
    });

    if (fnError || result?.error) {
      console.error('[Collaborator Login] Edge/Result info:', fnError || result?.error);
      
      // RPC Fallback
      const { data: rpcResult, error: rpcError } = await supabase.rpc('authenticate_collaborator', {
        p_company_code: companyCode,
        p_username: username,
        p_password: password,
      });
      
      if (rpcError || rpcResult?.error) {
        return rpcResult?.error || 'Erro ao conectar ao servidor.';
      }

      if (rpcResult?.success) {
        const collab = rpcResult.collaborator;
        const authEmail = (collab.email && collab.email.includes("@")) ? collab.email : `collab-${collab.id}@veltor.app`;
        
        // Tenta entrar com o Auth nativo
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: password
        });

        if (signInError) {
          // Se falhou, tentamos registrar na hora
          console.log('Auto-registrando colaborador no Auth...');
          const { error: signUpError } = await supabase.auth.signUp({
            email: authEmail,
            password: password,
            options: {
              data: {
                is_collaborator: true,
                company_id: collab.companyId,
                company_name: collab.companyName,
                name: collab.name,
                role: collab.role,
                collaborator_id: collab.id
              }
            }
          });

          const { data: sessData } = await supabase.auth.getSession();
          if (!signUpError && sessData?.session) {
            return null; // Router onAuthStateChange takes over
          }
        } else {
          return null; // SignIn successful
        }

        // Fallback legacy final
        loginAsCollaborator({
          id: collab.id, name: collab.name, email: collab.email || '',
          role: collab.role, permissions: collab.permissions,
          companyId: collab.companyId, companyName: collab.companyName,
        });
      }
      return null;
    }

    if (result.tokenHash) {
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash, type: 'magiclink',
      });
      if (otpError) {
        console.error('[Collaborator Login] verifyOtp error:', otpError);
        const collab = result.collaborator;
        // Se a OTP falhar, tenta fallback nativo
        const authEmail = (collab.email && collab.email.includes("@")) ? collab.email : `collab-${collab.id}@veltor.app`;
        await supabase.auth.signInWithPassword({ email: authEmail, password });
        const { data: sess2 } = await supabase.auth.getSession();
        if (sess2?.session) return null;
        
        loginAsCollaborator({
          id: collab.id, name: collab.name, email: collab.email || '',
          role: collab.role, permissions: collab.permissions,
          companyId: collab.companyId, companyName: collab.companyName,
        });
        return null;
      }
      return null;
    }
    
    return 'Erro inesperado ao tentar autenticar.';
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
        loginCollaborator,
        loginAsCollaborator,
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
