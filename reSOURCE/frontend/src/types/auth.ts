/** Role assigned to every account in Phase 2. */
export type UserRole = 'USER';

/** A user as returned by the API. Never contains a password or hash. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
}

/** Body of `POST /api/auth/register`. */
export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** Body of `POST /api/auth/login`. */
export interface LoginPayload {
  email: string;
  password: string;
}

/** Body of `PUT /api/users/me`. */
export interface UpdateProfilePayload {
  name: string;
  email: string;
  phone: string;
}

/** Successful login payload. */
export interface AuthSession {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
}
