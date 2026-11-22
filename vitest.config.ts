import { defineConfig, defaultExclude } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Tests receive explicit/stubbed values only. Vite otherwise discovers .env.local
  // even though Next itself skips that file in NODE_ENV=test.
  envDir: false,
  test: {
    // Ignored local evidence contains historical source snapshots, including
    // copied tests whose private local keypairs are intentionally absent.
    // They are evidence, not part of the executable test suite.
    exclude: [...defaultExclude, '**/.local/**', '**/.next/**', '**/coverage/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./scripts/test/server-only.ts', import.meta.url)),
    },
  },
});
