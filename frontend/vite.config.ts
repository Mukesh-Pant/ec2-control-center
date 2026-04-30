import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * In dev mode only: reads VITE_* env vars and injects a CONFIG object into
 * index.html at the same placeholder that lambda/config_injector replaces at
 * deploy time. The build output keeps the raw placeholder so the Lambda still
 * replaces it on every deploy.
 */
function devConfigInjector(): Plugin {
  return {
    name: 'dev-config-injector',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.server) return html; // build — keep placeholder for config_injector
        const port = (ctx.server.config.server.port as number | undefined) ?? 5173;
        const cfg = {
          COGNITO_DOMAIN: process.env['VITE_COGNITO_DOMAIN'] ?? '',
          CLIENT_ID: process.env['VITE_CLIENT_ID'] ?? '',
          REDIRECT_URI: `http://localhost:${port}`,
          API_URL: process.env['VITE_API_URL'] ?? '',
          USER_POOL_ID: process.env['VITE_USER_POOL_ID'] ?? '',
          CENTRAL_ACCOUNT_ID: process.env['VITE_CENTRAL_ACCOUNT_ID'] ?? '',
          ENVIRONMENT: process.env['VITE_ENVIRONMENT'] ?? 'development',
          MEMBER_ROLE_TEMPLATE_URL: process.env['VITE_MEMBER_ROLE_TEMPLATE_URL'] ?? '',
        };
        const script =
          `const CONFIG = ${JSON.stringify(cfg, null, 2)};\n` +
          `      window.__APP_CONFIG__ = CONFIG;`;
        return html.replace(
          'const CONFIG = { /*__INJECT__*/ };\n      window.__APP_CONFIG__ = CONFIG;',
          script,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [devConfigInjector(), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'https://u0bcgfkwec.execute-api.ap-south-1.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
