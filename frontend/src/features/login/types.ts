/** All possible view states inside the LoginPage shell. */
export type LoginView =
  | 'signin'
  | 'signup'
  | 'verify'
  | 'forgot'
  | 'reset'
  | 'newpass'
  | 'pending'
  | 'mfa';

export interface ViewProps {
  email: string;
  setEmail: (email: string) => void;
  goTo: (view: LoginView) => void;
  onAuthenticated: () => void;
}
