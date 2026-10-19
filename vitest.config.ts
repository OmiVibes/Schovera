import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./scripts/test/server-only.ts', import.meta.url)),
    },
  },
});
