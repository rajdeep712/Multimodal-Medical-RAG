import { useEffect, useState } from 'react';
import { User } from '../types/auth.ts';
import { authService } from '../services/authService.ts';
import { clearDocumentContentCache } from '../services/documentContentCache.ts';

/**
 * Module-singleton auth hook: one shared user state across every consumer
 * (Navbar, ProfileDropdown, forms, route guard), refreshed from the backend
 * session cookie via initialize() on app start.
 */

let currentUser: User | null = null;
let currentLoading = true;
let initialized = false;

const listeners = new Set<(state: AuthSnapshot) => void>();

interface AuthSnapshot {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

function snapshot(): AuthSnapshot {
  return { user: currentUser, isAuthenticated: !!currentUser, loading: currentLoading };
}

function notify() {
  const state = snapshot();
  listeners.forEach((listener) => listener(state));
}

function setUser(user: User | null) {
  if (!user) clearDocumentContentCache();
  currentUser = user;
  currentLoading = false;
  notify();
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  const user = await authService.getCurrentUser();
  setUser(user);
}

async function runAuthAction(
  action: () => Promise<User>,
): Promise<User> {
  currentLoading = true;
  notify();
  try {
    const user = await action();
    setUser(user);
    return user;
  } catch (err) {
    currentLoading = false;
    notify();
    throw err;
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthSnapshot>(snapshot);

  useEffect(() => {
    listeners.add(setState);
    setState(snapshot());
    initialize();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const login = (email: string, password: string) =>
    runAuthAction(() => authService.login(email, password));

  const signup = (name: string, email: string, password: string) =>
    runAuthAction(() => authService.signup(name, email, password));

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return {
    ...state,
    login,
    signup,
    logout,
  };
}
