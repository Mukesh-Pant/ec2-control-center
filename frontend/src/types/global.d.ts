/**
 * Runtime config injected at deploy time by lambda/config_injector.
 * The literal placeholder `const CONFIG = { /\*__INJECT__\*\/ };` in index.html
 * is replaced with a populated object before the file lands on S3.
 */
export interface AppConfig {
  COGNITO_DOMAIN?: string;
  CLIENT_ID?: string;
  REDIRECT_URI?: string;
  API_URL?: string;
  USER_POOL_ID?: string;
  CENTRAL_ACCOUNT_ID?: string;
  ENVIRONMENT?: 'production' | 'development' | string;
  MEMBER_ROLE_TEMPLATE_URL?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__: AppConfig;
  }
}

export {};
