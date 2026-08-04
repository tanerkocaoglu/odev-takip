import { createApp } from './app.js';
import { loadEnv } from './utils/env.js';

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);

const app = createApp();

app.listen(PORT, () => {
  console.log(`API /api/v1 üzerinde :${PORT} dinleniyor`);
});