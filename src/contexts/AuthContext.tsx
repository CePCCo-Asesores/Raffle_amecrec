import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, UserRole } from '@/lib/types';
import { toast } from '@/components/ui/use-toast';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  signUp: async () => false,
  signIn: async () => false,
  signOut: async () => {},
  updateProfile: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data as Profile;
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setUser(profile);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await fetchProfile(session.user.id);
        setUser(profile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, fullName: string, role: UserRole): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      });

      if (error) {
        toast({ title: 'Error al registrarse', description: error.message, variant: 'destructive' });
        return false;
      }

      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
        });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        const profile = await fetchProfile(data.user.id);
        setUser(profile);
        toast({ title: 'Registro exitoso', description: `Bienvenido a Sorteos AMECREC, ${fullName}!` });
        return true;
      }
      return false;
    } catch (err) {
      toast({ title: 'Error', description: 'Ocurrió un error inesperado', variant: 'destructive' });
      return false;
    }
  };

  const signIn = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast({ title: 'Error al iniciar sesión', description: error.message, variant: 'destructive' });
        return false;
      }

      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        setUser(profile);
        toast({ title: 'Bienvenido', description: `Hola de nuevo, ${profile?.full_name || email}!` });
        return true;
      }
      return false;
    } catch (err) {
      toast({ title: 'Error', description: 'Ocurrió un error inesperado', variant: 'destructive' });
      return false;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    toast({ title: 'Sesión cerrada', description: 'Has cerrado sesión correctamente' });
  };

  const updateProfile = async (updates: Partial<Profile>): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        toast({ title: 'Error', description: 'No se pudo actualizar el perfil', variant: 'destructive' });
        return false;
      }

      setUser(prev => prev ? { ...prev, ...updates } : null);
      toast({ title: 'Perfil actualizado', description: 'Los cambios se guardaron correctamente' });
      return true;
    } catch (err) {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated: !!user,
      signUp,
      signIn,
      signOut,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
