import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { login as apiLogin } from '../services/api';
import { saveSession, loadSession, clearSession } from '../services/auth';
import { useAuthStore } from '../services/authStore';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  login: (userId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadSession());

  const login = useCallback(async (userId: string, pin: string) => {
    const result = await apiLogin(userId, pin);
    if (result.success && result.data) {
      // Store the PIN that was actually used (userId may differ in case)
      saveSession(result.data, result.data.id, pin);
      setUser(result.data);
      return { success: true };
    }
    return { success: false, error: result.error || 'Login failed' };
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  // Keep the display-name store in sync for non-React services
  useAuthStore.setName(user?.name);

  const value: AuthContextValue = {
    user,
    isAdmin: user?.role === 'admin',
    isAuthenticated: user !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
