import { create } from 'zustand';
import * as Auth from '@/lib/auth';
import type { Role } from '@/lib/auth';

export interface AuthState {
  email: string;
  role: Role;
  isAuthenticated: boolean;
  isBooting: boolean;

  /** Read sessionStorage keys into store state. Call after any token write. */
  syncFromStorage: () => void;
  /** Try to restore an existing Cognito session on app boot. */
  bootstrap: () => Promise<void>;
  /** Clear store + sessionStorage + Cognito SDK. */
  signOut: () => void;
}

function readState(): Pick<AuthState, 'email' | 'role' | 'isAuthenticated'> {
  const token = Auth.getToken();
  const expiry = Auth.getExpiry();
  const valid = Boolean(token) && Date.now() < expiry;
  return {
    email: valid ? Auth.getEmail() : '',
    role: valid ? Auth.getRole() : 'none',
    isAuthenticated: valid,
  };
}

export const useAuth = create<AuthState>((set) => ({
  ...readState(),
  isBooting: true,

  syncFromStorage: () => set(readState()),

  bootstrap: async () => {
    set({ isBooting: true });
    try {
      const ok = await Auth.restoreSession();
      if (ok) set({ ...readState(), isBooting: false });
      else set({ email: '', role: 'none', isAuthenticated: false, isBooting: false });
    } catch {
      set({ email: '', role: 'none', isAuthenticated: false, isBooting: false });
    }
  },

  signOut: () => {
    Auth.logout();
    set({ email: '', role: 'none', isAuthenticated: false, isBooting: false });
  },
}));
