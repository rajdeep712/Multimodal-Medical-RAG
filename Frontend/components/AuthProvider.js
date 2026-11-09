"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
} from "@/lib/api";
import { authFetch, loadCurrentUser, refreshOnce } from "@/lib/auth";
import {
  clearLegacyAuth,
  clearProfile,
  loadProfile,
  saveProfile,
} from "@/lib/profile";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      saveProfile(nextUser);
    } else {
      clearProfile();
    }
  }, []);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await loadCurrentUser();
      applyUser(currentUser);
    } catch {
      applyUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    clearLegacyAuth();
    const cachedProfile = loadProfile();
    if (cachedProfile) {
      setUser(cachedProfile);
    }
    loadSession();
  }, [loadSession]);

  const login = useCallback(
    async (payload) => {
      const data = await loginRequest(payload);
      applyUser(data.user);
      return data;
    },
    [applyUser],
  );

  const signup = useCallback(
    async (payload) => {
      const data = await signupRequest(payload);
      if (data?.authenticated && data.user) {
        applyUser(data.user);
      }
      return data;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => null);
    applyUser(null);
  }, [applyUser]);

  const refresh = useCallback(async () => {
    const data = await refreshOnce();
    if (data?.user) {
      applyUser(data.user);
    }
    return data;
  }, [applyUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        refresh,
        authFetch,
        reload: loadSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
