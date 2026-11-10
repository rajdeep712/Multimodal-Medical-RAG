export interface User {
  id: string;
  name: string;
  email: string;
  role: 'patient' | 'clinician' | 'researcher';
  organization?: string;
  initials: string;
  avatarUrl?: string;
  preferences?: {
    theme?: 'light' | 'dark';
    compactMode?: boolean;
    autoHighlightCitations?: boolean;
  };
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token?: string | null;
}
