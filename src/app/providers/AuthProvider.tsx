import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../../shared/services/api';
import type { User } from '../../shared/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    console.info('[agro-debug] auth fetchUser start', {
      hasToken: Boolean(token),
      pathname: window.location.pathname,
    });
    if (!token) {
      console.warn('[agro-debug] auth fetchUser skipped: no token');
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      console.info('[agro-debug] auth /auth/me success', {
        user: data.data?.username,
        role: data.data?.role,
      });
      setUser(data.data);
    } catch (error: any) {
      console.error('[agro-debug] auth /auth/me failed, clearing token', {
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
      });
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      console.info('[agro-debug] auth fetchUser done');
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (username: string, password: string) => {
    console.info('[agro-debug] auth login start', { username });
    const { data } = await api.post('/auth/login', { username, password });
    const res = data.data;
    localStorage.setItem('token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    console.info('[agro-debug] auth login success', {
      user: res.user?.username,
      role: res.user?.role,
      hasToken: Boolean(res.accessToken),
    });
  };

  const logout = () => {
    console.warn('[agro-debug] auth logout');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
