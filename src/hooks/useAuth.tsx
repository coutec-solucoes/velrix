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

    // 1. Tenta carregar via RPC otimizado (bypassa RLS)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_own_profile');
    if (!rpcError && rpcData && rpcData.length > 0) {
      console.log('[Auth] Profile loaded via RPC:', rpcData[0].email);
      return rpcData[0] as UserProfile;
    }

    if (rpcError) {
      console.warn('[Auth] RPC get_own_profile failed:', rpcError.message);
    }

    // 2. Tenta Reparo Automático via RPC de Segurança (Cria se não existir)
    console.log('[Auth] Profile missing or RPC failed. Attempting auto-repair...');
    const { data: repairData, error: repairError } = await supabase.rpc('ensure_profile_exists');
    
    if (!repairError && repairData?.success) {
      console.log('[Auth] Profile repair successful, retrying fetch...');
      const { data: retryData } = await supabase.rpc('get_own_profile');
      if (retryData && retryData.length > 0) {
        return retryData[0] as UserProfile;
      }
    }

    // 3. Fallback final: Consulta direta (sujeito a RLS)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      console.error('[Auth] Profile still not found after repair attempt:', error?.message);
      return null;
    }

    const userProfile = data as UserProfile;

    // Self-repair legado (caso o RPC de reparo tenha falhado mas o registro exista sem company_id)
    if (!userProfile.company_id && userProfile.role === 'proprietario' && userProfile.email) {
      console.log('[Auth] Profile missing company_id, attempting last-resort repair for:', userProfile.email);
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
        setProfile(null);
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

        return 'Falha ao autenticar sessão nativa.';
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
        
        return 'Falha ao autenticar via OTP.';
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
    initializedForUser.current = null;
    clearCompanyCache();
  };

  return (
    <AuthContext.Provider
      value={{
        user: profile,
        supabaseUser,
        session,
        login,
        loginCollaborator,
        logout,
        isAuthenticated: (!!session && !!profile),
        isLoading,
        suspendedCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
