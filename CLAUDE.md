# CLAUDE.md — Dershane Ödev Takip Sistemi

Bu dosya projenin çalışma kurallarını ve geliştirme sırasını tanımlar.
**Ürün gereksinimlerinin tek kaynağı `spec.md` dosyasıdır.** Bu dosya nasıl
geliştireceğimizi, `spec.md` ne geliştireceğimizi anlatır.

---

## Proje özeti

Bir dershanede öğretmenlerin haftalık ödev/derse ilgi raporlarını doldurduğu,
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
| UI | Tailwind CSS + shadcn/ui |
| Animasyon | framer-motion |
| İkon | lucide-react |
| Backend | Node.js + Express (REST API) |
| Veritabanı | SQLite (`node:sqlite`, ORM yok, ham SQL) |
| Auth | JWT (jsonwebtoken) + RBAC |
| Doğrulama | zod (tüm girdi doğrulaması) |
| Dosya | multer (memory) + heic-convert (HEIC→JPEG) + sharp |
| Test | Vitest (birim, frontend + backend) + supertest (API entegrasyon) |
| Dağıtım | Tek sunucu: Express statik + API (SPA fallback) |

---

## Klasör yapısı

```
/project
  package.json           → Frontend bağımlılıkları + script'ler
  vite.config.ts         → dev server + /api proxy (/uploads proxy YOK)
  tsconfig.json
  index.html
  /src
    /components          → UI bileşenleri
    /pages               → Sayfalar (admin, teacher, guardian, student, login, r/[token])
    /services            → API istemcileri
    /constants           → Sabitler
    /utils               → Yardımcı fonksiyonlar
    /types.ts            → Global tip tanımları
  /backend
    package.json
    /src
      /db                → veritabanı bağlantısı + şema kurulumu
      /middleware        → auth, adminOnly, rateLimit
      /routes            → REST rotaları
      /services          → iş mantığı (storage.ts dahil — dosya yolu/key üretimi)
      /utils             → hash, token vb.
    /db                  → app.db (git'e girmez)
    /uploads             → yüklenen dosyalar (git'e girmez)
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
- OTP: `crypto.randomInt(100000, 1000000)` — `Math.random()` kullanılmaz.

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
- Bileşen kütüphanesi: **Tailwind CSS + shadcn/ui**. Ek animasyon için
  framer-motion, ikonlar için lucide-react kullanılır.
- Tüm metinler Türkçe. Tarih/saat gösterimi `Europe/Istanbul`.
- Form durumları: yükleniyor, hata, boş durum — üçü de mutlaka ele alınır.

**OTP (veli ve öğrenci girişi)**
- 6 haneli, 10 dakika geçerli.
- Aynı telefona 2 dakika içinde ikinci OTP gönderilemez (rate limit).
- 5 hatalı denemede OTP geçersiz kılınır; yeni OTP alınması gerekir.
- `SMS_PROVIDER_KEY` boşsa OTP `console.log`'a yazılır (geliştirme modu).
- SMS gönderimi tek bir fonksiyon arkasındadır: `sendSms(phone, message)`.
  Sağlayıcı seçimi (Netgsm, İleti Merkezi, Twilio vb.) yalnızca bu fonksiyonun
  içini değiştirir; çağıran kod sağlayıcıyı bilmez.

**Zaman**
- Gün hesapları (`day_of_week`, `due_date`) yerel takvime göre yapılır;
  UTC üzerinden gün çıkarımı yapılmaz.

---

## Çalışma kuralları

1. **Aşama sırasını atlama.** Aşağıdaki sırayla ilerle. Bir aşama bitmeden
   sonrakine geçme.
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
7. **Her başarılı aşama sonunda `PROGRESS.md` güncellenir** — süreç özeti,
   doğrulamalar, commit hash'i, çözülen sorunlar ve güncel dosya yapısı
   işlenir. Bu güncelleme o aşamanın commit'ine dahil edilir.

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
npm run db:reset      # db sil + migrate + seed
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
SMS_PROVIDER_KEY=             # boşsa OTP konsola yazılır
STORAGE_DRIVER="local"        # local | r2
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
- Express + **TypeScript** backend iskeleti (backend'de de TS)
- Migration runner kurulumu: `PRAGMA user_version` tabanlı migration listesi,
  `WAL + foreign_keys`, hata fırlatır
- **Tüm rotalar `/api/v1/...`** prefix ile başlar. Vite proxy `/api`
  üzerinden geçer, frontend değişmez.
- `.gitignore`: `backend/db/app.db*`, `backend/uploads`, `.env`
- `typecheck`, `lint`, `test` komutları çalışır durumda
- Temel layout: rol bazlı navigasyon iskeleti (içerik boş)

**Bitti kriteri:** `npm run dev` (frontend) + `npm run dev` (backend)
çalışıyor, frontend'den `/api/v1/health` çağrısı 200 dönüyor.

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

- JWT: admin/öğretmen e-posta+şifre, veli/öğrenci telefon+OTP
  (`spec.md` §2.1 OTP kuralları — 6 hane, 10 dk, 5 deneme, 2 dk aralık)
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
- Öğrenci ve veli yönetimi, enrollment, `whatsapp_phone` alanı
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
  - tablo: satır = öğrenci; devamsızlık, ödev puanı (1–10), ilgi puanı (1–10),
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
- Yükleme: `jpg/jpeg/png/heic/pdf`, dosya başına 10 MB, teslim başına 10 dosya
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

## Aşama 6 — İyileştirmeler

- Veli panelinde hafta bazlı trend grafiği
- Admin: riskli öğrenci listesi (üst üste düşük puan / teslim etmeme)
- Ödev hatırlatma: son tarihten **2 gün önce** ve **son tarih günü** veliye/
  öğrenciye `wa.me` linki gönderilir; sistem cron'u + `X-Cron-Secret` ile
  korunan `POST /api/internal/reminders` endpoint'i tetikler
- R2 storage implementasyonu ve üretime geçiş
- Saklama temizliği: 1 yıllık teslim dosyalarının silinmesi
- KVKK: aydınlatma metni, `consent_at` akışı
- Yıl sonu PDF özeti

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
