import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Testler gerçek app.db'ye dokunmasın — ayrı geçici DB kullan.
    env: {
      DB_PATH: path.join(import.meta.dirname, 'db', 'test.db'),
    },
  },
});