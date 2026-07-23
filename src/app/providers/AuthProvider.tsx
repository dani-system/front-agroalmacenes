import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../../shared/services/api';
import type { Branch, User } from '../../shared/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  branches: Branch[];
  selectedBranch: Branch | null;
  selectBranch: (branchId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const fetchUser = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      const branchResponse = await api.get('/branches/accessible');
      const availableBranches: Branch[] = branchResponse.data.data || [];
      setBranches(availableBranches);
      const savedId = localStorage.getItem('selectedBranchId');
      const activeBranch = availableBranches.find((branch) => branch.id === savedId) || availableBranches[0] || null;
      if (activeBranch) {
        localStorage.setItem('selectedBranchId', activeBranch.id);
        setSelectedBranch(activeBranch);
      }
    } catch (error: any) {
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    const res = data.data;
    localStorage.setItem('token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    const branchResponse = await api.get('/branches/accessible');
    const availableBranches: Branch[] = branchResponse.data.data || [];
    setBranches(availableBranches);
    const savedId = localStorage.getItem('selectedBranchId');
    const activeBranch = availableBranches.find((branch) => branch.id === savedId) || availableBranches[0] || null;
    if (activeBranch) {
      localStorage.setItem('selectedBranchId', activeBranch.id);
      setSelectedBranch(activeBranch);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setBranches([]);
    setSelectedBranch(null);
    localStorage.removeItem('selectedBranchId');
  };

  const selectBranch = (branchId: string) => {
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;
    localStorage.setItem('selectedBranchId', branch.id);
    setSelectedBranch(branch);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, branches, selectedBranch, selectBranch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
