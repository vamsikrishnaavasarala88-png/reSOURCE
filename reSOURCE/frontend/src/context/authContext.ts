import { createContext } from 'react';
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '../types/auth';

export type AuthStatus = 'initialising' | 'authenticated' | 'anonymous';

/**
 * Why the previous session ended without the user pressing "Logout".
 * `expired` means the API rejected the stored token, `unreachable` means the
 * token could not be verified because the API could not be reached.
 */
export type SessionEndReason = 'expired' | 'unreachable';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** Creates the account, then signs in. */
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => void;
  /** Reason the last session ended on its own, shown on the login page. */
  sessionEndReason: SessionEndReason | null;
  /** Saves profile changes and refreshes the stored user. */
  updateProfile: (payload: UpdateProfilePayload) => Promise<AuthUser>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
