# CLAUDE.md — Dershane Ödev Takip Sistemi

Bu dosya projenin çalışma kurallarını ve geliştirme sırasını tanımlar.
**Ürün gereksinimlerinin tek kaynağı `spec.md` dosyasıdır.** Bu dosya nasıl
geliştireceğimizi, `spec.md` ne geliştireceğimizi anlatır.

---

## Proje özeti

Bir dershanede öğretmenlerin haftalık ödev/ders içi performans raporlarını doldurduğu,
öğrencilerin ödev yüklediği, velilere haftada bir birleştirilmiş rapor
gönderilen web uygulaması. 4 rol: admin, öğretmen, veli, öğrenci.

Ölçek: ~10 öğretmen, ~200 öğrenci, ~200 veli, ~25 sınıf, haftada ~100 rapor.

Hâlihazırda süreç Excel ile yürüyor. Sistemin tek gerçek rakibi o Excel dosyası.

---

## Geliştirme ortamı

- **Windows**, Node.js 24, npm. WSL veya Docker **kullanılmıyor.**
- Veritabanı: **SQLite** — `backend/db/app.db`. Ayrı bir veritabanı sunucusu yok.
  `node:sqlite` (`DatabaseSync`) kullanılır — harici paket gerekmez.
- Dosya depolama: geliştirmede yerel disk (`backend/uploads`),
  üretimde Cloudflare R2.
- Yol ayıraçlarında `path.join` kullan; kodda `/` veya `\` sabitleme.
- Satır sonu: `.gitattributes` ile `* text=auto eol=lf`.

---

## Teknik yığın

| Katman | Seçim |
|---|---|
| Frontend | React 18 + TypeScript + Vite (SPA) |
| Routing | react-router-dom |
| UI | Tailwind CSS + elle yazılmış ortak bileşenler (`src/components/ui/`) — shadcn/Radix yok |
| Font | IBM Plex Sans, self-host (`@fontsource/ibm-plex-sans`) |
| Animasyon | framer-motion |
| İkon | lucide-react |
| Backend | Node.js + Express (REST API) |
| Veritabanı | SQLite (`node:sqlite`, ORM yok, ham SQL) |
| Auth | JWT (jsonwebtoken) + RBAC |
| Doğrulama | zod (tüm girdi doğrulaması) |
| Dosya | multer (memory) + heic-convert (HEIC→JPEG) + sharp |
| Görsel çıktı (frontend) | html-to-image (haftalık ödev özeti → PNG) |
| Test | Vitest (birim, frontend + backend) + supertest (API entegrasyon) |
| Dağıtım | Tek sunucu: Express statik + API (SPA fallback) |

---

## Klasör yapısı

```
/project
  package.json           → YALNIZCA frontend bağımlılıkları + script'ler
                           (backend paketleri backend/package.json'da)
  vite.config.ts         → dev server + /api proxy (/uploads proxy YOK)
  vitest.config.ts       → frontend testleri (jsdom)
  tsconfig.json
  tailwind.config.js   postcss.config.js   eslint.config.js
  index.html
  render.yaml
  /src
    /components
      /ui                → ORTAK BİLEŞENLER (Button, Field/Input, Badge, Card, TableCard,
                           Tabs, Modal, ConfirmDialog, Toast, Feedback, Pagination, ...)
                           index.ts giriş noktası — bkz. "Tasarım sistemi"
      /admin             → AdminLayout, HomeworkSummarySheet; Modal.tsx, Pagination.tsx,
                           ui.tsx = ui/'a yönlenen GEÇİŞ katmanı (Parti 7'de silinir)
      /layout            → AppLayout, TeacherShell, CustomerShell, PublicShell
      BrandLogo.tsx   ImageLightbox.tsx   ProtectedRoute.tsx
      ReportSnapshot.tsx   SubmissionFileGrid.tsx
    /context             → AuthContext.tsx
    /hooks               → useList.ts
    /pages
      /admin             → AcademicYears, AdminDashboard, AdminReports, AdminReportView,
                           ClassCourses, Classes, Courses, DigestSend, Guardians,
                           HomeworkSummary, Schools, Students, Teachers, Weeks (14 sayfa)
      /guardian          → GuardianHomePage, GuardianReportDetailPage
      /student           → HomeworkListPage
      /teacher           → ReportEntryPage, ReportHistoryPage, SubmissionsReviewPage,
                           TeacherDashboardPage
      ChangePasswordPage.tsx   DashboardPage.tsx   LoginPage.tsx
      TokenReportPage.tsx      (public /r/{token} — düz dosya, klasör değil)
      PrivacyNoticePage.tsx    (public /gizlilik — aydınlatma metni)
    /services            → api.ts (API istemcisi)
    /utils               → date.ts (gg.aa.yyyy tarih biçimlendirme)
    /test                → setup.ts (vitest kurulumu)
    App.tsx   main.tsx   index.css   types.ts   vite-env.d.ts
    *.test.tsx           → sayfa/bileşen testleri (kaynağa bitişik; ayrı test/ klasörü yok)
  /backend
    package.json         → backend bağımlılıkları (express, zod, multer, sharp, ...)
    tsconfig.json   vitest.config.ts   .env.example
    /src
      app.ts   index.ts  → Express uygulaması + sunucu başlatma
      constants.ts   types.ts   errors.ts   heic-convert.d.ts
      /db                → bağlantı (index.ts) + migration runner + şema + seed
      /middleware        → auth, adminOnly, rateLimit, upload
      /routes
        /admin           → 15 konu router'ı + index.ts (toplayıcı; requireAuth+adminOnly) + shared.ts
        index.ts   auth.ts   teacher.ts   student.ts   guardian.ts   files.ts   public.ts
      /services          → audit, backup, backupCli, csvExport, dashboard, digests,
                           storage, studentImport, submissionFiles (iş mantığı)
      /utils             → asyncHandler, csv, env, fileSignature, hash, pagination,
                           password, phone, text, time, token, username, weeks
      /test              → helpers.ts + fixtures/ (örnek jpg/png/pdf/heic)
      *.test.ts          → API entegrasyon testleri (supertest; kaynağa bitişik)
    /scripts             → audit-admin-routes.ts (envanter doğrulama), backup.ts, reset.ts, wipe.ts, cleanup-submissions.ts, backfill-digests.ts (tek seferlik digest telafisi), diagnose-weeks.ts (salt-okunur hafta teşhisi), seed-admin.ts
    /db                  → app.db (git'e girmez)
    /uploads             → yüklenen dosyalar (git'e girmez)
    /backups             → yedek .zip çıktıları (git'e girmez)
spec.md
CLAUDE.md
PROGRESS.md   (ilerleme raporu — her aşama sonunda güncellenir)
```

---

## Kod kuralları

**Yetkilendirme**
- JWT payload: `{ id, role, teacher_id?, student_id?, guardian_id?, tv }`
  (`tv` = `token_version` — `auth` middleware her istekte DB ile karşılaştırır)
- `auth` middleware'i tüm korumalı rotalarda zorunlu; `adminOnly` hassas
  rotalarda eklenir.
- **Her route handler ilk satırında yetki kontrolü yapar.** Kontrolsüz tek bir
  endpoint bile kalmayacak.
- Öğretmen sorguları her zaman `teacher_id = req.user.id` ile filtrelenir;
  "once hepsini çek sonra filtrele" yapılmaz.
- **Rapor düzenleme durum bazlıdır** (`spec.md` §2): `draft` → öğretmen
  serbest; `completed` → öğretmen düzenler, `audit_logs`'a yazılır;
  `sent` → öğretmene **403**, yalnızca admin düzenler.

**SQLite kuralları (zorunlu)**
- Tüm erişim `node:sqlite` (`DatabaseSync`) üzerinden; ORM yok.
- Sorgular `db.prepare().run()/get()/all()` deseniyle yazılır; parametreler
  her zaman `?` placeholder ile bağlanır — **string birleştirme ile sorgu kurma.**
- Bağlantı kurulduktan hemen sonra sırayla: `PRAGMA journal_mode = WAL`,
  `PRAGMA foreign_keys = ON`. Her ikisi zorunlu.
- **Tüm tablolar `STRICT`** ile oluşturulur. Tip eşlemesi: `TEXT`, `INTEGER`,
  `REAL`, `BLOB`, `ANY` dışında SQLite tipi kullanılmaz.
- **Kısmi indeks:** soft delete'li tablolarda `UNIQUE` kısıtı tablo içine
  yazılmaz; `WHERE deleted_at IS NULL` koşullu ayrı indeks kullanılır.
- **Migration runner** (`PRAGMA user_version` tabanlı): her migration
  `BEGIN/COMMIT/ROLLBACK` ile sarılır, hata olursa uygulama açılmaz.
  Aşama 1 dondurulana kadar #1 düzenlenir; sonrası yeni numara.
- **`DatabaseSync` senkrondur:** transaction'lar kısa tutulur; seed ve toplu
  işlemler sunucu içinden değil, ayrı CLI script'i olarak çalıştırılır.
- İsim aramaları `full_name_normalized` üzerinden yapılır.
- pg-boss veya Postgres'e özgü hiçbir kütüphane eklenmez.

**Veri erişimi**
- Veritabanı bağlantısı tek yerden export edilir (`backend/src/db`).
- Silme işlemleri soft delete (`deleted_at`); rapor ve teslim kayıtları
  fiziksel olarak silinmez.
- 200 kayıtlık listelerde (öğrenci, veli) sayfalama ve arama zorunlu.

**Kimlik ve token üretimi**
- Tüm birincil anahtarlar: `crypto.randomUUID()` — harici paket yok.
- **`weekly_digests.token` UUID DEĞİLDİR.** Kimlik doğrulamasız bir sayfayı
  açtığı için fiilen paroladır: `crypto.randomBytes(32).toString('base64url')`.
- **`username` üretimi:** isim tabanlı — `normalizeTurkish(full_name)` ile
  ASCII'ye indirgenmiş, boşluksuz ad+soyad + sıralı sayaç (örn. "Örnek Kişi 8"
  → `ornekkisi81`, ikincisi → `ornekkisi82`). Sayaç, o önekle başlayan en
  yüksek mevcut sayının +1'i; çakışmada artırılarak yeniden denenir
  (`spec.md` §2.1). Yalnızca yeni kayıtları etkiler; mevcut `ogrenci<n>` /
  `veli<n>` adlarına dokunulmaz. SMS/OTP kullanılmaz.
- **Şifre politikası:** Kullanıcının kendi seçtiği şifre en az 8 karakter,
  bir büyük + bir küçük harf + bir rakam. Admin'in girdiği geçici başlangıç
  şifresi ve CSV ortak şifresi min 6'dır (katı kurala tabi değil).
- **İlk girişte zorunlu şifre değiştirme:** `users.must_change_password`
  (migration #7) yalnızca öğrenci/veli için; öğrenci/veli create + reset + CSV
  import'ta `1`, öğretmen hiç etkilenmez. Login/me bayrağı taşır; bayrak `1`
  iken `auth` middleware yalnızca `/auth/me` + `/auth/change-password` uçlarına
  izin verir, diğerleri `403` (frontend yönlendirmesi tek başına yeterli değil).

**Girdi doğrulama ve hata formatı**
- Her gelen request body Zod şemasıyla parse edilir. `any` kullanılmaz.
- Puanlar `int().min(1).max(10)`; devamsız satırlarda `null`.
- **Tüm hata yanıtları tek biçimdedir:**
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Girilen bilgiler geçersiz.",
               "fields": { "homework_score": "1 ile 10 arasında olmalı" } }}
  ```
  - `code`: makine tarafından okunur, sabit küme — `VALIDATION_ERROR` (400),
    `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
    `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500),
    `GONE` (410, iptal edilmiş digest).
  - `message`: kullanıcıya gösterilecek **Türkçe** metin.
  - `fields`: yalnızca `VALIDATION_ERROR`'da; Zod `flatten().fieldErrors`
    çıktısından alan adı → tek mesaj olarak üretilir.
- Tek bir Express error middleware'i bu dönüşümü yapar; rotalar `throw` eder,
  yanıt biçimlendirmez. Beklenmeyen hatalarda istemciye yığın izi gönderilmez.

**Dosya yükleme ve servis**
- Multer `memoryStorage` → heic-convert (HEIC gerekliyse) → sharp: JPEG q80,
  uzun kenar max 2000px. Ham dosya **saklanmaz**.
- Dosya adı: `{timestamp}-{randomHex}.{ext}`.
- **`express.static` kullanılmaz.** Dosyalara `GET /api/v1/files/:key` rotası
  üzerinden erişilir; rota `auth` middleware'i + yetki kontrolü içerir.
  Yerel mod: `res.sendFile()`. R2 modu: imzalı URL'ye 302 redirect.
- Vite proxy'sinde `/uploads` kaydı yok.

**UI**
- Bileşenler: **Tailwind CSS + elle yazılmış `src/components/ui/`** (shadcn/Radix
  YOK). Ek animasyon için framer-motion, ikonlar için lucide-react kullanılır.
- Tüm metinler Türkçe. Tarih/saat gösterimi `Europe/Istanbul`.
- Form durumları: yükleniyor, hata, boş durum — üçü de mutlaka ele alınır.
- **Görsel kararlar "Tasarım sistemi" bölümünde sabitlenmiştir.** Yeni bir
  renk, boyut veya font tanımlama; oradaki token'ları kullan.

**Zaman**
- Gün hesapları (`day_of_week`, `due_date`) yerel takvime göre yapılır;
  UTC üzerinden gün çıkarımı yapılmaz.

---

## Tasarım sistemi

> **ARA SÜRÜM (yeniden tasarım, Parti 1 sonrası).** Token'lar, font, ortak
> bileşenler ve marka imzası (Parti 1) kesindir. Layout/navigasyon, öğretmen,
> veli, öğrenci ve admin ekranlarının yeni düzeni Parti 2–6'da uygulanır;
> henüz taşınmamış sayfalar `components/admin/ui.tsx` geçiş katmanını kullanır.
> Final sürüm iş sonunda bu bölümün yerine yazılır.

### Temel ilkeler

1. **Tek kimlik, tek accent.** Marka ve etkileşim rengi teal (`--accent`).
   Ayrı bir "müşteri mavisi" YOKTUR; `.customer-face`, `.brand-scope`,
   `--brand` eski adlardır, yeni kodda kullanılmaz.
2. **Renk işlevseldir.** Accent yalnızca etkileşimli öğelere (buton, link,
   odak halkası, aktif sekme/menü) aittir. Durumlar semantik renklerle gösterilir.
3. **Renk tek başına anlam taşımaz:** her durum renk + ikon + metindir
   (`Badge` bunu kendisi yapar).
4. **Border-first derinlik:** kartlar yalnızca 1px kenarlıklıdır, gölgesizdir.
   Gölge yalnızca yüzen öğelerde (menü, çekmece, toast, modal).
5. **Hazır bileşen varsa onu kullan.** `src/components/ui/` içindeki bileşenlerin
   yerine ham `<button>`, `<input>` + uzun sınıf zinciri yazma.

### Token'lar (tek kaynak: `src/index.css`, Tailwind adları: `tailwind.config.js`)

| Tailwind sınıfı | Değer | Kullanım |
|---|---|---|
| `bg-bg` | `#F7F8F9` | sayfa zemini |
| `bg-surface` | `#FFFFFF` | kart, tablo, modal, input |
| `bg-subtle` | `#F0F3F5` | sönük dolgu: disabled, ikon dairesi, satır hover |
| `border-border` | `#DDE2E7` | kenarlık, ayırıcı |
| `text-text` | `#16202A` | birincil metin |
| `text-muted` | `#54606C` | ikincil metin, etiket (tüm zeminlerde ≥ 4.5:1) |
| `bg-accent` / `text-accent` | `#0D6B62` | tek marka + etkileşim rengi |
| `bg-accent-hover` | `#0A574F` | primary buton hover |
| `text-accent-fg` | `#FFFFFF` | accent üzerindeki metin |
| `text-success` / `bg-success/10` | `#067647` | tamam: gönderildi, yüklendi |
| `text-warning` / `bg-warning/10` | `#A54A08` | gecikmiş: günü geçti, geç yüklendi, geç geldi |
| `text-danger` / `bg-danger/10` | `#B42318` | eksik/olumsuz + yıkıcı eylem: yüklenmedi, gelmedi, sil |
| `text-info` / `bg-info/10` | `#175CD3` | hazır/bilgi: tamamlandı, izinli |

**Anlam eşlemesi (üç durum kümesi aynı dört renge oturur):**
- Devamsızlık: geldi → nötr (`muted`), geç geldi → `warning`, gelmedi → `danger`, izinli → `info`.
- Rapor durumu: taslak → nötr, tamamlandı → `info`, gönderildi → `success`.
- Teslim: yüklendi → `success`, geç yüklendi → `warning`, yüklenmedi → `danger`.

Tonlu zemin yalnızca `/5` (bant) veya `/10` (rozet) opaklığıyla; metin rengi
her zaman aynı ailenin düz rengidir. **Yeni renk, hex veya `rgb()` yazma**;
`text-amber`, `text-red`, `text-blue`, `text-green`, `att-*`, `status-*`,
`sub-*` eski takma adlardır — yeni kodda `success/warning/danger/info` kullan.

### Tipografi

- Tek aile: **IBM Plex Sans** 400 / 500 / 600, `@fontsource/ibm-plex-sans`
  ile **self-host** (`main.tsx` içe aktarır; latin + latin-ext). Google Fonts
  bağlantısı EKLENMEZ.
- Ölçek yalnızca: `text-xs`(12) `text-[13px]` `text-sm`(14) `text-base`(16)
  `text-xl`(20) `text-2xl`(24). `text-[11px]`, `text-[15px]` ve başka
  keyfi boyutlar yasak. Gövde 14, tablo içi 13, sayfa başlığı 20/600,
  24 yalnızca veli rapor başlığı ve büyük özet sayısı.
- Ağırlık: gövde 400; etiket, buton, tablo başlığı 500; başlık 600. Başka yok.
- **Rakam gösteren her yerde `tabular`** (puan, tarih, hafta no, sayaç).
- **Dar ekranda (<768px) tüm input/select/textarea 16px'tir** (global kural;
  iOS zoom'unu önler). Bunu `text-sm` ile ezme.

### Şekil ve derinlik

- **İki yarıçap:** `rounded-md` = 8px (buton, input, kart, satır, banner) ve
  `rounded-lg` = 12px (modal, çekmece, büyük yüzey). Rozet/çip/avatar
  `rounded-full`. `rounded-xl/2xl/3xl` yazılmaz (12px'e eşlenmiştir, kullanma).
- Kart: `<Card>` (`border border-border bg-surface`). Kartlarda renkli üst/yan çizgi YOKTUR; anlam ikon dairesinin semantik renginde (`bg-success/10 text-success` vb.) verilir. Tıklanabilir kart/satır:
  `<Card interactive>` veya `card-interactive` sınıfı → hover'da accent
  kenarlık + `shadow-hover`. **Hover'da yükselme (`translateY`) YOKTUR.**
- Gölge yalnızca: `shadow-hover` (etkileşimli kart hover), `shadow-float`
  (menü, çekmece, toast), `shadow-modal` (modal). Başka gölge yazma.
  `elevation-*` sınıfları eskidir; yeni kodda kullanma.
- Modal arka perdesi `bg-[var(--backdrop)]`.

### Yoğunluk (iki mod, bilinçli)

- **compact** — öğretmen rapor giriş tablosu ve admin listeleri (Excel'in rakibi).
  Tablo metni 13px, satır ≈ 36–40px, kontrol 32px (`h-8`). Tablo hücreleri için
  `thClass('compact')` / `tdClass('compact')`; kapsayıcı `<TableCard>`.
  Rapor giriş tablosunda ayrıca `.compact` sınıfı satırı 36px'e sabitler.
- **comfortable** (varsayılan) — veli, öğrenci, giriş, şifre, aydınlatma.
  Gövde 14–16px, kontrol 44px, bölümler arası 24px, kart iç boşluğu 16–20px.
- **Dokunma hedefi:** dar ekranda her tıklanabilir öğe ≥ 44×44px.
  `Button`, `FilterChip`, `Tabs`, `Modal` kapat düğmesi bunu kendisi sağlar
  (`max-md:min-h-11`). Ham `<button>` yazıyorsan sen ekle.

### Bileşenler (`src/components/ui/`, giriş: `components/ui/index.ts`)

Yeni kodda import: `from '../../components/ui'` (yol dosyaya göre).

| Bileşen | Kullanım |
|---|---|
| `Button` | `variant`: `primary` (sayfada tek ana eylem) · `secondary` (varsayılan) · `ghost` · `danger` (kenarlıklı) · `danger-solid` (onay diyaloğunda son adım); `size`: `sm`/`md`/`lg`; `loading` (döner ikon + devre dışı, metin değişmez). Bağlantı buton görünümü: `buttonClass(variant,size)` |
| `Field` + `Input` / `Select` / `Textarea` | Her alan `Field` içinde (görünür etiket, `error` ikonlu metin, `hint`). Ham element gerekirse `inputClass` / `textareaClass` |
| `SearchBox`, `FilterSelect`, `FilterChip` | liste arama/filtre; dar ekranda çip şeridi |
| `Badge` (`tone`: neutral/positive/warning/danger/info), `StatusBadge`, `AttendanceBadge` | durum rozeti; ikon otomatik. **Sayı göstermek için KULLANILMAZ** |
| `CountChip` | sekme/filtre yanındaki sayaç (ikonsuz, nötr). Sayı = `CountChip`, durum = `Badge` |
| `Card` | `padding`: none/sm/md/lg; `interactive` |
| `TableCard` + `thClass`/`tdClass` | tablo kapsayıcısı ve hücre sınıfları; `Density` = compact/comfortable |
| `Tabs` | bölüm içi sekme (`role=tablist`), `count` sayaçlı |
| `Modal` | `open`, `title`, `onClose`, `size` (`md`/`lg`); odak tuzağı, Escape, odak geri dönüşü otomatik. İlk odak: `data-autofocus` → gövdedeki ilk alan |
| `ConfirmDialog` | silme/iptal/geri çekme; `confirmLabel` eylemi adıyla söyler ("Öğrenciyi sil") |
| `useDialogBehavior` | Modal'ın odak/Escape mantığı; çekmece gibi yeni diyaloglar bunu KULLANIR, kendi focus trap'ini yazmaz |
| `ToastProvider` + `useToast()` | `toast.success/error/info(mesaj)`; kısa işlem sonucu. Kalıcı hata için `FormError`/`InlineNotice` |
| `LoadingState` (blok iskelet), `Skeleton`, `EmptyState`, `ErrorState` (`onRetry`), `FormError`, `InlineNotice` (`tone`) | yükleniyor / boş / hata durumları |
| `FilterChipRow` | mobil yatay çip şeridi (etiketli) |
| `PageTitle`, `PageHeader` | sayfa başlığı (+ açıklama + sağda eylemler) |
| `Pagination` | 200 kayıtlık listelerde zorunlu |
| `BrandLogo` (`components/BrandLogo.tsx`) | **tek logo bileşeni**; resim dosyası yok (SVG işaret + canlı metin). `size` sm/md/lg, `variant` full/mark, `tone` default/inverse, `responsive` |

**Yasaklar:** ham `<button className="...">` ile buton yeniden icat etmek;
`logo.png` veya başka logo resmi eklemek; sayfada renk/hex/`rgb()` tanımlamak;
`text-[Npx]` keyfi boyut; `rounded-xl/2xl/3xl`; hover'da `translate`; `window.confirm/alert`
(yerine `ConfirmDialog`/`toast`); placeholder'ı etiket yerine kullanmak;
`components/admin/ui.tsx`'ten yeni import (geçiş katmanı).

### Rapor giriş ekranı (`ReportEntryPage`) — ürün gereği kurallar

Bu ekran tasarım değişse de şu davranışları korur (testleri: `report-entry.test.tsx`, `teacher.test.tsx`):
- **Masaüstü tablo klavye modeli:** Enter = aynı sütunda bir satır aşağı; ok tuşları
  hücreler arasında (select içinde ok tuşları select'e aittir); puan hücresi
  `type=number` (rakam yazılır, `10` = "1" sonra "0"; değer 1–10'a kırpılır,
  odakta içerik seçilir). **Bu davranışa dokunulmaz.** Tablo hücrelerinin
  erişilebilir adı `"<alan> — <öğrenci>"` biçimindedir.
- **Devamsız/izinli satırda yalnızca ders içi performans kapanır ve `null` olur;
  ödev puanı her durumda girilir** (spec §4).
- **Mobil kart** (<768px): öğrenci başına kart; 1–10 seçici `ScoreRadioGroup`
  (TEK radiogroup, roving tabindex → grup başına 1 Tab durağı, ok/Home/End/rakam
  tuşları, 5×2 44px; rakam tuşu 1–9 → aynı sayı, `0` → 10). **Mobil kartta puan için
  sayı kutusu YOKTUR** (dokununca ekran klavyesi açılıyordu); radiogroup tek girdidir.
  Kart alanlarının erişilebilir adları `Devamsızlık` (select), radiogroup'lar
  `Ödev puanı` / `Ders içi performans puanı`, `Not`. Sayı girişi yalnızca masaüstü tabloda.
- **Otomatik kaydetme:** debounce 2 sn, **yalnızca gerçek değişiklikte**: mevcut durumun JSON'u son yüklenen/kaydedilen
  duruma (`baselineRef`) eşit değilse tetiklenir — açılışta kayıt YOKTUR (completed/sent-admin raporu
  açmak `audit_logs`/`updated_at` üretmez, `topic_covered` NULL → "" olmaz). Kart değiştirme ("Önceki/Sonraki"),
  "Geri dön" ve sayfadan ayrılma bekleyen kaydı **hemen flush eder**
  (`flushPending`). Kaydedilemezse "Geri dön" bir kez uyarır.
- **Kaydetme durumu:** `SaveStatus` (görsel kopya) + sayfada tek `SaveAnnouncer`
  (`aria-live`): "Kaydediliyor…" / "Kaydedildi 14:32" (Europe/Istanbul) /
  "Kaydedilemedi" + "Yeniden dene".
- **Sabit alt çubuk (mobil):** `fixed bottom-0`, `pb-[max(0.5rem,env(safe-area-inset-bottom))]`,
  içerik altında `pb-[calc(5rem+env(safe-area-inset-bottom))]`. Ekran klavyesi açıkken
  (`useKeyboardOpen`: düzenlenebilir alan odakta + görünür yükseklik %80 altı)
  çubuk **hiç render edilmez**. Son kartta "Sonraki" yerine "Özet" (tamamlama
  özetine kaydırır). "Raporu tamamla" sayfada TEK kopyadır (tablo/kartın ardında).
- Durum banner'ları `InlineNotice`: başlamamış hafta (info), sent kilitli (success),
  admin düzenlemesi (success), completed düzenleme bilgisi (info), son hafta (warning),
  hafta tanımı hatalı (danger).

### Veli ekranları ve `/r/{token}` (Parti 4)

- **Tek sütun, comfortable, telefon önce.** Girişsiz sayfalar `PublicShell` içinde
  (`/r/{token}`, `/gizlilik`): sade 56px üst şerit (yalnızca marka), altta aydınlatma
  metni bağlantısı (her durumda görünür). Gradyan/renkli başlık, `brand-*` sınıfları YOK.
- **Rapor gövdesi** (`GuardianReportView`, public ve girişli veli ortak): `ReportCover`
  (düz kart) → `CourseOverview` ("Haftanın dersleri": her ders tek satır — devamsızlık
  `Badge` + HAM puanlar "Ödev 8 · Perf. 9"; ortalama/yüzde ÜRETİLMEZ; satır ders
  kartına kaydırır) → `CourseReportCard` (tam açık, ders başına) → girişli veride
  `SubmissionHistory`. Durum her yerde `Badge` (ikon + metin); kartlarda renkli yan çizgi yok.
- **`/r/{token}` durumları:** yükleniyor (iskelet) · normal · **410** ("Bu rapor artık
  geçerli değil." + ne yapılacağı + "Veli paneline giriş yap") · **bozuk bağlantı**
  (`^[A-Za-z0-9_-]{16,}$` değil → istek atılmadan "Bağlantı geçersiz") · hata (`ErrorState`
  + Yeniden dene). Sunucu iptal edilmiş VE bilinmeyen token için aynı 410'u döner
  (varlık sızmaz); ekran ikisini ayırt etmez. Testlerde geçerli biçimli 43 karakterlik token kullan.
- **Aydınlatma metni içeriği değiştirilmez** (yalnızca sunum). Yazdırma: `nav` ve üst şerit gizlenir,
  ders kartları sayfa ortasında bölünmez (`break-inside-avoid`).
- `ReportSnapshot` (admin gönderim önizlemesi) veri biçimi sabittir; görünümü Parti 6'da gözden geçirilir.

### Yükleniyor / hata / boş

Her veri ekranı üçünü de ele alır: **yükleniyor** → `LoadingState` (iskelet);
**hata** → `ErrorState` (ne oldu + "Yeniden dene"); **boş** → `EmptyState`
(davet eden cümle + varsa eylem). Düz "Yükleniyor…" metni yazılmaz.

### Odak halkası

Rapor giriş tablosu klavyeyle doldurulur; **odağın nerede olduğu her an
görünmelidir.** Global kural (`index.css`): `:focus-visible` → 2px accent
outline, 2px offset; `td` içinde offset −2px. **Hiçbir koşulda kaldırılmaz**
(`outline-none` yazma).

### Hareket

- CSS geçişleri kısa ve sönük (150ms, renk/kenarlık/gölge). framer-motion
  yalnızca sayfa/sekme geçişi ve çekmece için; gereksiz animasyon yok.
- `prefers-reduced-motion`: tüm animasyon/geçiş global olarak devre dışı
  (`index.css`); framer-motion kullanan kod `useReducedMotion` ile uyar.
- Shimmer: `.shimmer` sınıfı (`Skeleton`/`LoadingState` kullanır).

### Mobil

Dört rolden üçü telefondadır. **Yalnızca admin paneli masaüstü önceliklidir;
kalan her şey mobil önceliklidir.** Rapor giriş tablosu dar ekranda yatay
kaydırılmaz, öğrenci başına kart görünümüne geçer (`spec.md` §6.1).
Veli rapor sayfası (`/r/{token}`) tek sütun, 16px kenar boşluğu.
`index.html` `viewport-fit=cover` içerir; sabit alt çubuklar
`pb-[env(safe-area-inset-bottom)]` kullanır.
### Navigasyon ve kabuklar

- **Admin** (`AdminLayout`): `lg`+ sol sabit menü 240px (marka, **gruplu** öğeler:
  Panel · Kurulum · Kişiler · Haftalık döngü; altta kullanıcı + çıkış).
  `lg` altında menü gizlidir: üstte yapışkan 56px çubuk (hamburger + marka) ve
  soldan açılan **çekmece** (`role=dialog`, `useDialogBehavior` ile odak tuzağı,
  Escape, odak geri dönüşü; link tıklayınca kapanır). Yeni menü öğesi
  `NAV_GROUPS`'a eklenir; ikon-only şerit YOKTUR.
- **Öğretmen** (`TeacherShell`): 56px üst şerit (marka solda, kullanıcı + çıkış
  sağda). `md`+ sekmeler şeritte; dar ekranda şeridin altında yapışkan sekme
  çubuğu (sekme ≥ 44px, kısa etiket, tam ad `aria-label`).
- **Öğrenci / veli** (`CustomerShell`): 56px üst şerit (yalnızca marka) + alt dock
  (Ödevlerim/Raporlarım + Hesap). *(Dock ve hesap paneli Parti 5'te
  gözden geçirilecek.)*
- Her kabukta sayfada **tek** `BrandLogo` bulunur (admin'de kenar çubuğu +
  dar ekran çubuğu CSS ile dönüşümlü görünür).
- **Giriş / şifre değiştirme:** `lg`+ solda teal marka paneli (`brand-panel`) +
  sağda form; dar ekranda üstte ince teal wordmark şeridi + form. Linkler
  `text-accent` (bg üzerinde 5.99:1, beyaz üzerinde 6.37:1).

### Mobil

Dört rolden üçü telefondadır. **Yalnızca admin paneli masaüstü önceliklidir;
kalan her şey mobil önceliklidir.** Rapor giriş tablosu dar ekranda yatay
kaydırılmaz, öğrenci başına kart görünümüne geçer (`spec.md` §6.1).
Veli rapor sayfası (`/r/{token}`) tek sütun, 16px kenar boşluğu.
`index.html` `viewport-fit=cover` içerir; sabit alt çubuklar
`pb-[env(safe-area-inset-bottom)]` kullanır.

### Erişilebilirlik tabanı

- Metin/zemin kontrastı ≥ 4.5:1 (token'lar doğrulanmıştır; `warning` bu yüzden `#A54A08`).
- Her form alanının görünür `<label>`'ı vardır; hata alanın altında ikon + metin.
- Diyaloglarda odak tuzağı ve odak geri dönüşü; durum bildirimleri `aria-live`.
- `prefers-reduced-motion` desteklenir.

### Yazım tonu

- Butonlar ne yaptığını söyler: "Raporu tamamla", "Gönder", "Öğrenciyi sil".
  "Kaydet", "Onayla", "Tamam" gibi belirsiz fiiller kullanılmaz; aynı eylem
  akış boyunca aynı adı taşır.
- Hata mesajları özür dilemez; ne olduğunu ve ne yapılacağını söyler:
  "Ödev puanı 1 ile 10 arasında olmalı." ("Bir hata oluştu" değil.)
- Boş ekranlar davet eder: "Bu hafta doldurulacak rapor yok." + varsa eylem.
- Cümle düzeni; başlıklarda Her Kelime Büyük Yazılmaz. Tüm metin Türkçe.

---

## Çalışma kuralları

1. **Aşamalar 0–5 tamamlandı; proje üretimde.** Yeni işler tek tek ilerler:
   kapsam → kararların kullanıcı onayı → uygulama → doğrulama. Bir iş
   bitmeden yenisine geçme. Güncel durum ve açık işler: `PROGRESS-OZET.md`.
2. **Küçük adımlar.** Her adımda: kod → `npm run typecheck` → ilgili test →
   commit. Tek seferde 10 dosya değiştirip sonuna kadar gitme.
3. **Kapsam genişletme yok.** `spec.md`'de olmayan bir özellik ekleme.
   Gerekli olduğunu düşünüyorsan önce söyle, onay al, sonra `spec.md`'yi
   güncelle.
4. **Şema değişikliği** önce `spec.md`'de güncellenir, sonra **yeni numaralı
   bir migration** eklenir. Dondurulmuş migration'lar asla düzenlenmez.
5. **Belirsizlik varsa sor.** Varsayım yapıp devam etme; özellikle yetki
   kuralları ve puanlama davranışında.
6. Her aşama sonunda o aşamanın "bitti" kriterini kontrol et ve rapor et.
7. **Her tamamlanan iş sonunda `PROGRESS.md`'ye kısa bir kayıt eklenir**
   (en üste): kapsam, kararlar (kullanıcı onaylı), doğrulama özeti (test
   sayıları + canlı kanıt sonucu tek satır), etkilenen dosyalar, commit
   başlığı. Tam dosya ağacı ve uzun doğrulama dökümleri **yazılmaz**.
   Aynı commit'te `PROGRESS-OZET.md`'deki "Güncel durum" / "Açık işler" /
   "Kalıcı kararlar" bölümleri de gerekiyorsa güncellenir.

---

## Komutlar

```bash
# Frontend (kök)
npm run dev           # Vite dev server (:5173, /api → :3001 proxy)
npm run build         # dist/ üretir
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest — frontend testleri

# Backend
cd backend
npm run dev           # Express dev server (:3001)
npm run typecheck     # tsc --noEmit
npm test              # vitest + supertest — backend testleri
npm run db:migrate    # bekleyen migration'ları çalıştır
npm run db:seed       # örnek veri + ilk admin (idempotent)
npm run db:reset      # db sil + migrate + seed (+ uploads temizliği; NODE_ENV=production'da ALLOW_DB_RESET=1 ister)
npm run db:wipe       # db sil + migrate, SEED YOK → boş şema (uploads temizliği; üretimde ALLOW_DB_WIPE=1 ister)
npm run db:backup     # yedek: VACUUM INTO kopyası + uploads → tek .zip (backend/backups/)
npm run cleanup-submissions  # manuel teslim dosyası temizliği (varsayılan dry-run; --execute önce yedek alır)
npm run digest-backfill -- --class <ad> [--week <no|YYYY-MM-DD>] [--execute]  # tek seferlik digest telafisi (dry-run; --execute önce yedek)
npm run diagnose-weeks   # salt-okunur: 7 gün olmayan haftalar + aralık dışı dersler
npm run r2-smoke      # R2 uçtan uca duman testi (STORAGE_DRIVER=r2 + gerçek R2_* env ister; izole DB kullanır)
cd ..
```

---

## Ortam değişkenleri

**backend/.env**
```
PORT=3001
BASE_URL=http://localhost:5173   # /r/{token} linkleri bununla üretilir
JWT_SECRET=<rastgele-gizli-anahtar>
ADMIN_PASSWORD=<admin-şifresi>
SEED_USER_PASSWORD=<seed öğrenci/veli şifresi>   # yalnızca seed/demo verisi
LOGIN_RATE_LIMIT_MAX=5        # demo ortamında 10'a kadar gevşetilebilir;
                              # üretimde 5'in altına inilmemeli, asla 100
                              # gibi yüksek bir değer kullanılmamalı
CHANGE_PASSWORD_RATE_LIMIT_MAX=5   # hassas: mevcut şifre denemeleri, 15 dk
                                   # penceresi, kullanıcı ID bazlı; demo'da gevşet
ADMIN_IMPORT_RATE_LIMIT_MAX=5      # pahalı: CSV içe aktarma, 1 saat penceresi
ADMIN_BACKUP_RATE_LIMIT_MAX=3      # pahalı: yedek indirme, 1 saat penceresi
STORAGE_DRIVER="local"        # local | r2
BACKUPS_DIR=<yedek çıktı dizini>   # yoksa backend/backups; üretimde /var/data/backups
BACKUP_KEEP=10                # saklanan en yeni yedek sayısı (eskiler silinir)
# üretimde:
# R2_ENDPOINT= R2_BUCKET= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY=
```

**Frontend (.env)**
```
VITE_API_URL=/api/v1          # vite proxy /api üzerinden geçer
```

---

# Geliştirme aşamaları

## Aşama 0 — İskelet

- Vite + React + TypeScript frontend iskeleti
- **Tasarım token'ları en baştan kurulur:** IBM Plex Sans yüklemesi,
  "Tasarım kuralları" bölümündeki CSS değişkenleri (`--bg`, `--accent`,
  durum renkleri), `--radius`, odak halkası, `compact`/`comfortable`
  yoğunluk sınıfları. Bileşenler bu token'lardan türetilir; ekran başına
  yeni renk veya boyut tanımlanmaz.
- Express + **TypeScript** backend iskeleti (backend'de de TS)
- Migration runner kurulumu: `PRAGMA user_version` tabanlı migration listesi,
  `WAL + foreign_keys`, hata fırlatır
- **Tüm rotalar `/api/v1/...`** prefix ile başlar. Vite proxy `/api`
  üzerinden geçer, frontend değişmez.
- `.gitignore`: `backend/db/app.db*`, `backend/uploads`, `.env`
- `typecheck`, `lint`, `test` komutları çalışır durumda
- Temel layout: rol bazlı navigasyon iskeleti (içerik boş)

**Bitti kriteri:** `npm run dev` (frontend) + `npm run dev` (backend)
çalışıyor, frontend'den `/api/v1/health` çağrısı 200 dönüyor. Ayrıca kök
CSS'te tasarım token'ları (`--bg`, `--surface`, `--border`, `--text`,
`--text-muted`, `--accent`, `--radius`, durum renkleri) tanımlı; IBM Plex Sans
yükleniyor; örnek bir sayfada bir buton, bir input ve bir durum rozeti bu
token'lardan türetilmiş halde görünüyor ve klavye odağında halka çıkıyor.

---

## Aşama 1 — Veri modeli ve seed

- `spec.md` §3'teki tüm tabloları **STRICT + kısmi indeks** deseniyle yaz
  (`CREATE TABLE ... STRICT`, soft delete'li tablolara `WHERE deleted_at IS NULL`
  kısmi `UNIQUE` indeksleri)
- **Migration #1 yalnızca şemadır** (tablolar + indeksler). Seed migration'ın
  içine konmaz. Aşama 1 commit'lendiğinde migration #1 dondurulur.
- `/backend/src/db` içinde migration runner + bağlantı kur
- **`/backend/src/utils/text.ts`** — Türkçe normalizasyon + birim testleri
  ("Öğrenci" → "ogrenci", "İIıi" davranışı dahil). Normalizasyon **yalnızca
  sunucuda** yapılır; istemciden gelen normalize değere güvenilmez.
- **`/backend/src/utils/weeks.ts`** — `getPreviousWeek()`, `calculateDueDate()`
  + birim testleri. Hafta ve son tarih hesapları **yalnızca sunucuda** yapılır;
  frontend gerekirse API'den alır. Test edilecek senaryolar:
  - normal hafta → bir sonraki aynı ders günü
  - arada tatil haftası (`weeks` kaydı yok) → sonraki ders haftasına kayma
  - **yılın son haftası → `null` döner** (§5.2 sınır durumu)
  - yılın ilk haftası → `getPreviousWeek()` `null` döner
- **Seed ayrı CLI script'idir** (`backend/src/db/seed.ts`, `npm run db:seed`),
  sunucu başlangıcında çalışmaz. İdempotenttir (`INSERT OR IGNORE`).
- **İlk admin:** seed, `ADMIN_PASSWORD` env değişkeninden şifreyi okuyarak
  admin kullanıcısını oluşturur.
- Seed hacmi: ~25 sınıf, ~200 öğrenci, ~20 hafta, geçen haftaya ait örnek
  rapor + ödev kayıtları (önceki ödev mantığını test etmek için)

**Bitti kriteri:** seed çalışıyor, foreign key ihlali testi geçiyor,
hafta/normalizasyon testleri geçiyor.

---

## Aşama 2a — Kimlik doğrulama ve yetki

- JWT: admin/öğretmen e-posta+şifre, veli/öğrenci username+şifre
  (`spec.md` §2.1 — otomatik `username` üretimi, admin başlangıç şifresi girer)
- JWT payload: `{ id, role, teacher_id?, student_id?, guardian_id?, tv }`
- `auth` middleware: `tv` vs `users.token_version` — eşit değilse 401
- `auth` + `adminOnly` middleware'leri — `spec.md` §2 tablosunun birebir karşılığı
- Rol bazlı route koruması (frontend: ProtectedRoute)
- Yetki için kapsamlı birim testleri: her rol × her yetki

**Bitti kriteri:** 4 rolle giriş yapılabiliyor, `token_version` uyumsuzluğunda 401
dönüyor, yetki testleri geçiyor.

---

## Aşama 2b — Admin CRUD

- Eğitim yılı, hafta, sınıf, ders, `class_courses` ataması (ders günü dahil)
- Öğrenci ve veli yönetimi, enrollment; veli kaydında `whatsapp_phone`
  **zorunlu** (fallback yok — `spec.md` §3.1), öğrenci/veli `username` otomatik üretilir
- Arama (`full_name_normalized`) + sayfalama (200 kayıt)

**Bitti kriteri:** Admin bir eğitim yılını seed'e dokunmadan sıfırdan kurabiliyor.

---

## Aşama 3 — Toplu rapor giriş ekranı (projenin kalbi)

`spec.md` §5.1 ve §6.1'i uygula.

- Öğretmen dashboard'u: "bu hafta doldurulacaklar" (~10 kayıt), ders gününe
  göre sıralı, tamamlananlar düşer, günü geçmişler vurgulu
- Rapor giriş ekranı:
  - üstte: verilmiş ödev (otomatik dolu, düzenlenebilir), işlenen konu,
    yapılacak ödev, hesaplanmış son tarih
  - tablo: satır = öğrenci; devamsızlık, ödev puanı (1–10), ders içi performans puanı (1–10),
    not
  - klavye navigasyonu, tek tıkla puan girişi, toplu doldurma kısayolu
  - devamsızlık seçilince puan hücreleri disable + null
  - otomatik kaydetme (debounce ~2sn) + "kaydedildi" göstergesi
  - dar ekranda kart görünümüne geçiş
- "Tamamla" aksiyonu ve doğrulaması
- supertest entegrasyon testi: rapor oluştur → satırları doldur → tamamla →
  eksik puan doğrulamasının hata verdiğini kontrol et

**Bitti kriteri:** Bir öğretmen hesabıyla 8 kişilik bir sınıfın haftalık
raporu klavyeden çıkmadan doldurulabiliyor ve `completed` oluyor.

---

## Aşama 4 — Ödev ve teslim

- `homeworks` kaydı raporla birlikte oluşturulur (draft), rapor tamamlanınca
  kesinleşir, `due_date` otomatik hesaplanır
- **HEIC dönüşümü:** `heic-convert` ile JPEG buffer'a al, sonra sharp ile
  2000px + JPEG q80. Diğer görseller doğrudan sharp'a. Dönüşüm başarısız
  olursa Türkçe hata: "Bu fotoğraf formatı işlenemedi, lütfen JPEG olarak yükleyin."
- Multer + sharp görsel işleme akışı
- `backend/src/services/storage.ts`: dosya yolu/key + meta bilgisi tek yerden
- **Korumalı dosya rotası:** `GET /api/v1/files/:key` — `auth` + yetki kontrolü;
  yerel: `res.sendFile()`, R2: imzalı URL 302. `express.static` **kullanılmaz.**
- Öğrenci "Ödevlerim" ekranı: ders, öğretmen, hafta, açıklama, son tarih,
  teslim durumu. **Puan ve öğretmen notu gösterilmez.**
- Yükleme: `jpg/jpeg/png/heic/pdf`, dosya başına 10 MB, teslim başına 30 dosya
- `is_late` işaretlemesi
- Öğretmen teslim kontrol ekranı: bir ödevin tüm teslimlerini sırayla gezme,
  `reviewed` işaretleme
- Rapor giriş ekranındaki teslim rozetleri bu veriden beslenir

**Bitti kriteri:** Öğrenci HEIC/JPEG yüklüyor, dosya küçültülerek kaydediliyor,
yetkisiz dosya erişimi 403 dönüyor, öğretmen rozeti görüp açabiliyor.

---

## Aşama 5 — Veli görünümü ve haftalık gönderim

- `weekly_digests` üretimi:
  - İlk rapor `completed`'ında aktif öğrenciler için `INSERT OR IGNORE ... 'pending'`
  - Tüm raporlar tamamlanınca aynı kayıtlar `status = 'ready'` yapılır
    (spec.md §5.4 tetikleme mekanizması)
- Admin "Haftalık gönderim" ekranı: `pending` (uyarılı) + `ready` (aktif) satırlar;
  sınıf filtreli liste, önizleme, "gönder ve sonraki" akışı
- Gönderimde **yeni `token` üretilir**, snapshot üzerine yazılır, `send_count` artar
- Re-send: mevcut `weekly_digests` kaydı güncellenir (yeni token), `audit_logs`'a
  `digest.send` / `digest.resend` yazılır
- Token iptali: `is_revoked = true`, eski token kalıcı olarak ölü,
  `/r/{token}` → 410 Gone, `audit_logs`'a `digest.revoke` yazılır
- `/r/[token]` public sayfa: girişsiz, salt okunur, `is_revoked` kontrolü
- Veli paneli: öğrenci seçimi, **tüm geçmiş gönderilmiş raporlar** (sınıf
  değişmiş olsa bile), rapor detayı, ödev teslim geçmişi
- Admin dashboard: özet + eksik rapor listesi (`spec.md` §5.5)
- `audit_logs` yazımı: rapor güncelleme ve digest gönderimi

**Bitti kriteri:** Koordinatör tek ekrandan bir sınıfın tüm velilerine
gönderim yapabiliyor; veli linke tıklayınca haftanın 4 dersini birlikte
görüyor.

---

## Aşama 6 — İyileştirmeler (durum: `PROGRESS-OZET.md`)

- ✅ Admin: riskli öğrenci listesi (üst üste düşük puan / teslim etmeme)
- ✅ R2 storage implementasyonu ve üretime geçiş
- ✅ KVKK: aydınlatma metni (`/gizlilik`), `consent_at` akışı
- ✅ Öğretmen atamalarını devretme / atama takası
- 🔄 Ödev hatırlatma — **değiştirildi:** yalnızca öğretmen dashboard'unda iç
  hatırlatma (gecikmiş taslak sayacı). `wa.me` + cron + `X-Cron-Secret`
  hatırlatması **uygulanmadı**; gerekirse ayrıca konuşulur.
- 🔄 Saklama temizliği — elle `cleanup-submissions` CLI'ı var; 1 yıllık
  **otomatik** temizlik bilinçli olarak ertelendi (KVKK kararı).
- ⏸ Veli panelinde hafta bazlı trend grafiği — veri hazır (`schools`,
  `grade_level`), grafikler şimdilik kapsam dışı.
- ⏸ Yıl sonu PDF özeti — başlanmadı.

---

## Kapsam dışı

WhatsApp Cloud API, multi-tenant/çoklu şube, ödeme, ayrı yoklama modülü,
sınav sonuçları, öğretmen-veli mesajlaşma, mobil uygulama.

Bunlardan biri gerekli görünüyorsa önce konuş.

---

## Gelecek notu — mobil uyumluluk

Bu mimari (Express REST API + JWT + node:sqlite) mobil uygulamaya geçiş
için bilinçli olarak seçilmiştir. Detaylar `spec.md` §12'de.

- **Backend aynen kalır** — mobil uygulama aynı API'ye bağlanır, backend
  yeniden yazılmaz.
- **Frontend yeniden yazılır** (React Native / Expo veya Flutter) — aynı
  API'ye bağlanan ayrı bir istemci olur; web UI'ı korunur.
- **API rotası `/api/v1/...` Aşama 0'dan itibaren** uygulanır; Vite proxy `/api`
  üzerinden geçtiği için frontend değişmez.
- `wa.me` gönderimi ve `/r/[token]` token mantığı mobilde de aynen geçerlidir.
