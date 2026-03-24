import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

interface AdminAuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({} as AdminAuthContextType);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAdminRole = async (userId: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;
    try {
      const { data, error } = await supabase.rpc('is_admin', { _user_id: userId });
      if (error) {
        console.warn('[AdminAuth] is_admin RPC error:', error.message);
        return false;
      }
      return !!data;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          const admin = await checkAdminRole(session.user.id);
          setIsAdmin(admin);
          setIsLoading(false);
        }, 0);
      } else {
        setIsAdmin(false);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const admin = await checkAdminRole(session.user.id);
        setIsAdmin(admin);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return 'Supabase não configurado. Configure na aba Supabase primeiro.';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'Email ou senha inválidos.';

    if (data.user) {
      const admin = await checkAdminRole(data.user.id);
      if (!admin) {
        await supabase.auth.signOut();
        return 'Usuário não tem permissão de administrador.';
      }
      setIsAdmin(true);
    }
    return null;
  };

  const logout = async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
  };

  return (
    <AdminAuthContext.Provider value={{ user, session, isAdmin, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
