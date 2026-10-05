import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, registerUnauthorizedHandler, setAuthToken } from '../api/client';
import { fetchCurrentUser, loginRequest, registerRequest } from '../services/authService';
import { updateMyProfile } from '../services/userService';
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
} from '../types/auth';
import { clearStoredToken, readStoredToken, storeToken } from '../utils/tokenStorage';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type SessionEndReason,
} from './authContext';

/**
 * Holds the signed-in user and the access token.
 *
 * On startup the stored token is restored: if the API still accepts it the
 * session continues, otherwise the token is cleared. A 401 on any later request
 * ends the session the same way.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Derived up front so a stored token can be verified without a flash of the
  // login page.
  const [status, setStatus] = useState<AuthStatus>(() =>
    readStoredToken() ? 'initialising' : 'anonymous',
  );
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);

  const endSession = useCallback((reason: SessionEndReason | null) => {
    setAuthToken(null);
    clearStoredToken();
    setUser(null);
    setSessionEndReason(reason);
    setStatus('anonymous');
  }, []);

useEffect(() => {
    const storedToken = readStoredToken();

    if (!storedToken) {
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    setAuthToken(storedToken);

    // The restore is only allowed to touch the session while the stored token is
    // still the one it started with. Signing in, registering or logging out in
    // the meantime replaces it, and this older answer must be ignored.
    const stillCurrent = () => !cancelled && readStoredToken() === storedToken;

    fetchCurrentUser(controller.signal)
      .then((profile) => {
        if (!stillCurrent()) return;
        setUser(profile);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        // Ignore the request that is aborted when the effect re-runs.
        if (!stillCurrent()) return;


        if (error instanceof ApiError && error.status === 401) {
          // The API rejected the stored token: end the session.
          endSession('expired');
          return;
        }

        // API unreachable: keep the token for a later retry, but never claim
        // the user is signed in.
        setAuthToken(null);
        setUser(null);
        setSessionEndReason('unreachable');
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [endSession]);

  /** Clears the session, remembering why it ended when the API forced it. */
    const applySession = useCallback((token: string, profile: AuthUser) => {
    setAuthToken(token);
    storeToken(token);
    setUser(profile);
    setSessionEndReason(null);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const session = await loginRequest(payload);
      applySession(session.accessToken, session.user);
      return session.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await registerRequest(payload);
      // The register endpoint does not issue a token; sign in right after.
      return login({ email: payload.email, password: payload.password });
    },
    [login],
  );

  /** What the user does on purpose: no "your session ended" notice afterwards. */
  const logout = useCallback(() => endSession(null), [endSession]);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    const updated = await updateMyProfile(payload);
    setUser(updated);
    return updated;
  }, []);

  useEffect(() => {
    // A 401 on any later request means the token expired mid session.
    registerUnauthorizedHandler(() => endSession('expired'));

    return () => registerUnauthorizedHandler(null);
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateProfile, sessionEndReason }),
    [user, status, login, register, logout, updateProfile, sessionEndReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
