import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Tests receive explicit/stubbed values only. Vite otherwise discovers .env.local
  // even though Next itself skips that file in NODE_ENV=test.
  envDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./scripts/test/server-only.ts', import.meta.url)),
    },
  },
});
