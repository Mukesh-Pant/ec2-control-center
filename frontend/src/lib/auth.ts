import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';
import { getConfig, isConfigInjected } from '@/lib/config';

/**
 * Cognito SRP auth wrapper. Mirrors the contract of the legacy
 * Auth IIFE (login, signup, verify, forgot, reset, refresh, logout)
 * one-to-one so the rest of the app sees the same surface.
 *
 * Tokens land in sessionStorage under the same keys the live API
 * client expects: id_token, access_token, refresh_token, token_expiry,
 * user_email, user_groups.
 */

export type Role = 'admin' | 'operator' | 'viewer' | 'none';
export type LoginResult =
  | { type: 'SUCCESS' }
  | { type: 'NEW_PASSWORD_REQUIRED' };

let userPool: CognitoUserPool | null = null;
let challengeUser: CognitoUser | null = null;
let pendingEmail = '';

function pool(): CognitoUserPool {
  if (!userPool) {
    const cfg = getConfig();
    if (!cfg.USER_POOL_ID || !cfg.CLIENT_ID) {
      throw new Error(
        'Cognito config missing. Either window.__APP_CONFIG__ was not injected ' +
          '(deploy not run) or you are running locally without dev creds.',
      );
    }
    userPool = new CognitoUserPool({
      UserPoolId: cfg.USER_POOL_ID,
      ClientId: cfg.CLIENT_ID,
      Storage: sessionStorage,
    });
  }
  return userPool;
}

function cognitoUser(email: string): CognitoUser {
  return new CognitoUser({
    Username: email,
    Pool: pool(),
    Storage: sessionStorage,
  });
}

function storeSession(session: CognitoUserSession): void {
  const idToken = session.getIdToken();
  const accessToken = session.getAccessToken();
  const refreshTok = session.getRefreshToken();

  sessionStorage.setItem('id_token', idToken.getJwtToken());
  sessionStorage.setItem('access_token', accessToken.getJwtToken());
  sessionStorage.setItem('refresh_token', refreshTok.getToken());
  sessionStorage.setItem('token_expiry', String(idToken.getExpiration() * 1000));

  const payload = idToken.decodePayload() as Record<string, unknown>;
  const email =
    (typeof payload.email === 'string' && payload.email) ||
    (typeof payload['cognito:username'] === 'string' && payload['cognito:username']) ||
    'User';
  sessionStorage.setItem('user_email', String(email));

  const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
  sessionStorage.setItem('user_groups', JSON.stringify(groups));
}

export function login(email: string, password: string): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const user = cognitoUser(email);

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        storeSession(session);
        resolve({ type: 'SUCCESS' });
      },
      onFailure: (err) => reject(err),
      newPasswordRequired: () => {
        challengeUser = user;
        resolve({ type: 'NEW_PASSWORD_REQUIRED' });
      },
    });
  });
}

export function completeNewPassword(newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!challengeUser) return reject(new Error('No pending password challenge'));
    challengeUser.completeNewPasswordChallenge(
      newPassword,
      {},
      {
        onSuccess: (session) => {
          storeSession(session);
          challengeUser = null;
          resolve();
        },
        onFailure: (err) => reject(err),
      },
    );
  });
}

export function signup(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    pool().signUp(email, password, attrs, [], (err) => {
      if (err) return reject(err);
      pendingEmail = email;
      resolve();
    });
  });
}

export function confirmSignup(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).resendConfirmationCode((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pendingEmail = email;
    cognitoUser(email).forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
      inputVerificationCode: () => resolve(),
    });
  });
}

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    cognitoUser(email).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function refreshTokens(): Promise<boolean> {
  return new Promise((resolve) => {
    const user = pool().getCurrentUser();
    if (!user) return resolve(false);

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (!err && session && session.isValid()) {
        storeSession(session);
        return resolve(true);
      }
      const refreshToken = session?.getRefreshToken();
      if (!refreshToken) return resolve(false);
      user.refreshSession(
        refreshToken as CognitoRefreshToken,
        (err2, newSession: CognitoUserSession | null) => {
          if (err2 || !newSession) return resolve(false);
          storeSession(newSession);
          resolve(true);
        },
      );
    });
  });
}

export async function restoreSession(): Promise<boolean> {
  if (!isConfigInjected()) return false;

  const token = sessionStorage.getItem('id_token');
  const expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  if (token && Date.now() < expiry) return true;

  try {
    const user = pool().getCurrentUser();
    if (!user) return false;
    return await refreshTokens();
  } catch {
    return false;
  }
}

export function logout(): void {
  try {
    const user = pool().getCurrentUser();
    if (user) user.signOut();
  } catch {
    /* ignore */
  }
  sessionStorage.clear();
}

export function getToken(): string | null {
  return sessionStorage.getItem('id_token');
}

export function getEmail(): string {
  return sessionStorage.getItem('user_email') || 'User';
}

export function getExpiry(): number {
  return parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
}

export function isNearExpiry(): boolean {
  return getExpiry() - Date.now() < 600_000;
}

export function getRole(): Role {
  let groups: unknown;
  try {
    groups = JSON.parse(sessionStorage.getItem('user_groups') || '[]');
  } catch {
    groups = [];
  }
  if (!Array.isArray(groups)) return 'none';
  if (groups.includes('admins')) return 'admin';
  if (groups.includes('operators')) return 'operator';
  if (groups.includes('viewers')) return 'viewer';
  return 'none';
}

export function getPendingEmail(): string {
  return pendingEmail;
}

export function setPendingEmail(email: string): void {
  pendingEmail = email;
}

/** Map a Cognito SDK error to a user-facing message. */
export function friendlyAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Incorrect username or password') || msg.includes('UserNotFoundException'))
    return 'Invalid email or password.';
  if (msg.includes('UserNotConfirmedException')) return 'Please verify your email first.';
  if (msg.includes('UsernameExistsException'))
    return 'An account with this email already exists.';
  if (msg.includes('InvalidPasswordException'))
    return 'Password must be 8+ chars with uppercase, lowercase, number, and symbol.';
  if (msg.includes('CodeMismatchException')) return 'Invalid verification code. Please try again.';
  if (msg.includes('ExpiredCodeException')) return 'Code expired. Please request a new one.';
  if (msg.includes('LimitExceededException'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('InvalidParameterException')) return 'Please check your input and try again.';
  if (msg.includes('NotAuthorizedException')) return 'Invalid email or password.';
  return msg;
}
