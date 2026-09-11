'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getStoredSession, saveSession, SESSION_CHANGE_EVENT, type Session } from '@/lib/api';

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setTokens: (session: Session | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setSessionState(getStoredSession());
    setIsLoading(false);

    const handleSessionChange = (event: Event) => {
      const customEvent = event as CustomEvent<Session | null>;
      setSessionState(customEvent.detail ?? getStoredSession());
      setIsLoading(false);
    };

    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, []);

  const setSession = (nextSession: Session | null) => {
    setSessionState(nextSession);
    if (nextSession) {
      saveSession(nextSession);
    } else {
      clearSession();
    }
  };

  const setTokens = (nextSession: Session | null) => {
    setSession(nextSession);
  };

  const logout = () => {
    setSession(null);
  };

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAuthenticated: Boolean(session),
    isLoading,
    setSession,
    setTokens,
    logout,
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
