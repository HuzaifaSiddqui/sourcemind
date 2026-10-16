import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { Capability, User } from './types';

interface AuthState {
  user: User | null;
  caps: Capability[];
  roleLabel: string;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (c: Capability) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [roleLabel, setRoleLabel] = useState('');
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setCaps([]);
    qc.clear();
  }, [qc]);

  const loadMe = useCallback(async () => {
    const me = await api<{ user: User; capabilities: Capability[]; roleLabel: string }>('/auth/me');
    setUser(me.user);
    setCaps(me.capabilities);
    setRoleLabel(me.roleLabel);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) { setReady(true); return; }
    loadMe().catch(logout).finally(() => setReady(true));
  }, [loadMe, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string }>('/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.set(r.token);
    qc.clear();
    await loadMe();
  }, [loadMe, qc]);

  const can = useCallback((c: Capability) => caps.includes(c), [caps]);

  return <Ctx.Provider value={{ user, caps, roleLabel, ready, login, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
