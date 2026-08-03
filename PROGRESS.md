# PROGRESS — Dershane Ödev Takip Sistemi

> Bu dosya her başarılı aşama sonunda güncellenir. İlerleme raporu: süreç
> özeti, doğrulamalar, commit hash'i, çözülen sorunlar ve güncel dosya yapısı.

---

## Aşama 0 — İskelet ✅

### Süreç özeti

Vite + React 18 + TypeScript frontend iskeleti, Express + TypeScript backend
iskeleti, `/api/v1` prefix'i, migration runner kurulumu, tasarım token'ları,
temel layout ve doğrulama testleri tamamlandı.

### Yapılanlar

**Frontend (`/src`)**
- `package.json`: React 18.3, react-router-dom 6, Tailwind 3, framer-motion,
  lucide-react, Vitest 3 + Testing Library.
- `vite.config.ts`: dev server `:5173`, `/api` → `http://localhost:3001` proxy
  (`/uploads` proxy yok).
- `src/index.css`: Tasarım kuralları birebir uygulandı:
  - Temel token'lar: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`,
    `--accent`, `--accent-fg`
  - Devamsızlık, rapor durumu ve teslim durumu renk kümeleri
  - `--radius: 6px`, odak halkası (`:focus-visible` 2px, `td` içinde -2px)
  - Tipografi: IBM Plex Sans 400/500/600, 12/13/14/16/20/24px ölçeği,
    `.tabular` sınıfı (tabular-nums)
  - `compact` / `comfortable` yoğunluk sınıfları
  - `prefers-reduced-motion` desteği
- `tailwind.config.js`: renk token'ları Tailwind'e eşlendi (`bg-accent`,
  `text-muted`, `border-border`, durum renkleri vb.) — ekran başına yeni renk
  tanımlanmadı.
- Routing: `/` (layout + dashboard), `/login`, `/r/:token` placeholder'ları.
- Örnek bileşen sayfası: token'lardan türetilmiş buton, input ve üç durum
  rozeti (`draft` / `completed` / `sent`) + canlı `/api/v1/health` göstergesi.

**Backend (`/backend`)**
- Express + TypeScript (`tsx` ile dev), `createApp()` test edilebilir yapı.
- Tüm rotalar `/api/v1` prefix'iyle (`app.use('/api/v1', routes)`).
- `GET /api/v1/health`: DB canlılığını da doğrular (`SELECT 1`), 200 + status
  döner.
- Tek biçimli hata yanıtı: `errors.ts` — `AppError` sınıfı + error middleware.
  Zod hataları `VALIDATION_ERROR` (400) biçimine çevrilir; beklenmeyen hatalarda
  istemciye yığın izi gönderilmez.
- `db/index.ts`: `node:sqlite` `DatabaseSync`, WAL + foreign_keys PRAGMA'ları,
  tek yerden export.
- `db/migrations.ts` + `db/migrate.ts`: `PRAGMA user_version` tabanlı sıralı
  migration runner; her migration `BEGIN/COMMIT/ROLLBACK`; hata fırlatır.
  Migration listesi Aşama 0'da boş — #1 Aşama 1'de eklenecek.
- `scripts/reset.ts`: `npm run db:reset` — db sil + migrate (seed Aşama 1'de).
- `.env` / `.env.example`: PORT, BASE_URL, JWT_SECRET, ADMIN_PASSWORD,
  SMS_PROVIDER_KEY, STORAGE_DRIVER.

**Yapılandırma**
- `.gitignore` ve `.gitattributes` (`eol=lf`) zaten mevcut ve doğruydu.
- ESLint (flat config), kök + backend typecheck, Vitest config'leri.

### Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` (kök) | ✅ |
| `npm --prefix backend run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test -- --run` (frontend, 5 test) | ✅ |
| `npm --prefix backend test -- --run` (backend, 2 test) | ✅ |
| `npm run build` | ✅ (dist/ üretildi) |
| `npm --prefix backend run db:migrate` | ✅ Migration tamam. |
| Canlı `/api/v1/health` (backend dev + fetch) | ✅ `200 {"status":"ok","version":"0.0.1"}` |
| Tasarım token'ları kök CSS'te | ✅ (tümü tanımlı) |
| IBM Plex Sans yüklemesi (`index.html`) | ✅ (400/500/600, latin-ext) |
| Örnek sayfa: buton + input + durum rozeti | ✅ (`DashboardPage`) |
| Klavye odağında halka | ✅ (`:focus-visible` kuralı) |

### Çözülen sorunlar

- **Vitest 4 + Vite 8 + Windows/Node 24 uyumsuzluğu:** `Cannot read properties
  of undefined (reading 'config')` — Vitest 3 + Vite 6 + `@vitejs/plugin-react` 4
  kombinasyonuna düşüldü; kararlı çalışıyor.
- **React sürümü:** npm `react@19` kurmuştu; CLAUDE.md gereği React 18.3'e
  düşürüldü. `react-router-dom` 6 ve `@testing-library/react` 14 de React 18
  ile uyumlu sürümlere sabitlendi.
- **TypeScript sürümü:** npm `typescript@7.0.2` kurmuştu (`baseUrl` kaldırılmış,
  typescript-eslint uyumsuz); kararlı 5.9.3'e düşürüldü.
- **Tailwind sürümü:** Tailwind 4'te PostCSS plugin'i ayrı pakete taşınmıştı;
  Tailwind 3 + postcss + autoprefixer kuruldu.
- **`@testing-library/react` 16 + React 18 hatası:** v14 + `@testing-library/dom`
  9 + `jest-dom` 6 uyumlu seti kullanıldı.
- **Windows spawn:** `start /b ... > file` redirection desteklenmiyor;
  doğrulama scripti Node `child_process.spawn` ile yapıldı.

### Commit

`5744e57` — "Aşama 0: frontend/backend iskeleti, tasarım token'ları, migration runner, /api/v1 health"

### Güncel dosya yapısı

```
/project
  .gitattributes
  .gitignore
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  eslint.config.js
  tailwind.config.js
  postcss.config.js
  index.html
  /src
    /components/layout/AppLayout.tsx
    /pages/DashboardPage.tsx  (örnek bileşenler + health)
    /pages/LoginPage.tsx
    /pages/TokenReportPage.tsx
    /test/setup.ts
    App.tsx
    App.test.tsx
    index.css
    main.tsx
    types.ts
    vite-env.d.ts
  /backend
    package.json
    tsconfig.json
    vitest.config.ts
    .env
    .env.example
    /src
      /db/index.ts        (bağlantı + WAL + foreign_keys)
      /db/migrations.ts   (migration runner)
      /db/migrate.ts      (CLI)
      routes/index.ts     (/api/v1 router)
      app.ts              (Express app)
      app.test.ts         (supertest health)
      errors.ts           (hata biçimi)
      index.ts            (sunucu)
    /scripts/reset.ts
PROGRESS.md   (bu dosya)