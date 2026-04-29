import type { AppConfig } from '@/types/global';

/**
 * Read deploy-time config injected by lambda/config_injector.
 * Falls back to an empty object during local `vite dev` so feature flags
 * can short-circuit without crashing.
 */
export function getConfig(): AppConfig {
  return (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
}

/** True when the deploy-time CONFIG block was populated (not the placeholder). */
export function isConfigInjected(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.API_URL && cfg.USER_POOL_ID && cfg.CLIENT_ID);
}
