import { User } from '../types/auth.ts';
import { API_CONFIG, ApiError, apiRequest } from './api.ts';

/**
 * Real auth service wired to the FastAPI backend.
 *
 * The backend authenticates with HttpOnly cookies (`rag_access_token` +
 * `rag_session_token`), set automatically on login/signup responses and
 * validated by every protected route — nothing to store client-side.
 */

interface BackendUser {
  id: string;
  auth0_sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  nickname: string | null;
  picture: string | null;
  provider: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

function mapUser(backend: BackendUser): User {
  const displayName = backend.name?.trim() || backend.nickname || backend.email.split('@')[0];
  const parts = displayName.split(/\s+/);
  const initials = (
    (parts[0]?.[0] || 'M') + (parts[1]?.[0] || parts[0]?.[1] || '')
  ).toUpperCase();

  return {
    id: backend.id,
    name: displayName,
    email: backend.email,
    role: 'clinician',
    organization: 'MediLens Health Network',
    initials,
    avatarUrl: backend.picture || undefined,
    preferences: {
      theme: 'light',
      autoHighlightCitations: true,
    },
  };
}

function throwApiError(status: number, fallback: string): never {
  throw new ApiError(status, fallback);
}

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    try {
      const backend = await apiRequest<BackendUser>(API_CONFIG.endpoints.auth.me);
      return mapUser(backend);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        return null;
      }
      // Backend unreachable etc. — treat as logged out rather than crashing.
      return null;
    }
  },

  async login(email: string, password: string): Promise<User> {
    try {
      const session = await apiRequest<{ user: BackendUser }>(
        API_CONFIG.endpoints.auth.login,
        { method: 'POST', body: JSON.stringify({ email, password }) },
      );
      return mapUser(session.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throwApiError(401, 'Invalid email or password');
      }
      throw err;
    }
  },

  async signup(name: string, email: string, password: string): Promise<User> {
    let response: { message: string; user: BackendUser | null; authenticated: boolean };
    try {
      response = await apiRequest<{ message: string; user: BackendUser | null; authenticated: boolean }>(
        API_CONFIG.endpoints.auth.signup,
        { method: 'POST', body: JSON.stringify({ name, email, password }) },
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        throwApiError(409, 'An account with this email already exists');
      }
      throw err;
    }

    // The backend auto-logs-in after signup; if it could not (e.g. email
    // verification required), surface the message instead of a fake session.
    if (!response.authenticated || !response.user) {
      throwApiError(400, response.message || 'Account created, but automatic login failed. Please sign in.');
    }
    return mapUser(response.user);
  },

  async logout(): Promise<void> {
    try {
      await apiRequest<void>(API_CONFIG.endpoints.auth.logout, { method: 'POST' });
    } catch {
      // Logging out client-side even if the backend call fails.
    }
  },
};
