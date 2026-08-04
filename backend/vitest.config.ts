import { defineConfig } from 'vitest/config';
import path from 'node:path';
import os from 'node:os';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Testler gerçek app.db'ye dokunmasın — ayrı geçici DB kullan.
    env: {
      DB_PATH: path.join(import.meta.dirname, 'db', 'test.db'),
      JWT_SECRET: 'test-secret-2a',
      // Yüklenen test dosyaları gerçek uploads dizinine yazılmasın.
      UPLOADS_DIR: path.join(os.tmpdir(), 'dershane-test-uploads'),
    },
    // Testler aynı SQLite dosyasını (test.db) kullanıyor — dosyaları sıralı
    // çalıştır (paralel temizlik yarışını önler).
    fileParallelism: false,
  },
});