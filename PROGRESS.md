# PROGRESS — Dershane Ödev Takip Sistemi

> Bu dosya her başarılı aşama sonunda güncellenir. İlerleme raporu: süreç
> özeti, doğrulamalar, commit hash'i, çözülen sorunlar ve güncel dosya yapısı.

---

## Aşama 2a retrofit — OTP kaldırıldı, username + şifre girişi ✅

### Süreç özeti

OTP/telefon tabanlı veli/öğrenci girişi tamamen kaldırıldı; yerine otomatik
üretilen `username` + admin'in belirlediği başlangıç şifresi geldi
(spec.md §2.1, §3.1). `users.phone` → `users.username` (migration #5),
`otp_codes` tablosu düşürüldü, `guardians.whatsapp_phone` zorunlu yapıldı
(fallback yok). Tek `/auth/login` endpoint'i `identifier` (email veya username)
alıp rolü buna göre çözer; admin/öğretmen tarafı işlevsel olarak değişmedi.
Veli/öğrenci için şifre unutma çıkışı `POST /students/:id/reset-password` ve
`POST /guardians/:id/reset-password` ile kapatıldı (öğretmen deseni, tv+1,
audit).

### Yapılanlar

**Spec + şema**
- spec.md §2.1/§3.1 (kullanıcı tarafından güncellendi): OTP yok; `users.username`;
  `guardians.whatsapp_phone` NOT NULL.
- **Migration #5 (`username_login`):** `DROP INDEX idx_users_phone` → `DROP COLUMN
  phone` → `ADD COLUMN username` → `idx_users_username` + `idx_users_email`
  (kısmi) → `DROP TABLE otp_codes`. Dondurulmuş #1-4'e dokunulmadı.
- Backfill: migration yalnızca şema (UNIQUE indeks NULL'a izin verir); mevcut
  (seed) satırların username/şifresi seed'in "boşluk doldurma" geçişiyle atanır.
- **NOT (Aşama 6 adayı):** `users.password_hash` ve `guardians.whatsapp_phone`
  DB seviyesinde **NOT NULL değildir** — yalnızca uygulama seviyesinde (Zod +
  tüm yazma yolları) zorlanıyor. SQLite'ta mevcut sütun NOT NULL'a
  `ALTER` ile çevrilemez; üretime geçmeden önce tablo yeniden kurulumu
  (12 adımlı rebuild, migration runner'da `PRAGMA foreign_keys` düzenlemesi
  gerekir) ile kapatılmalı.

**Backend**
- Silindi: `services/otp.ts`, `services/sms.ts`, `services/otp.test.ts`,
  `SMS_PROVIDER_KEY` env'i.
- `routes/auth.ts` yeniden yazıldı: tek `POST /auth/login { identifier,
  password }`; email→admin/teacher, username→guardian/student çözümü;
  bulunamayan hesapta **sahte hash'e `verifyPassword`** (zamanlama sızıntısı
  önlenir); brute-force identifier bazlı (IP+hesap); `/otp/*` kaldırıldı;
  `/me` ve `publicUser` `username` döner.
- `utils/username.ts` (yeni): `nextUsername('student'|'guardian')` →
  `ogrenci<n>` / `veli<n>` (max+1; çakışmada n++, UNIQUE indeks güvence).
- `routes/admin.ts`: öğretmen/admin/öğrenci `phone` kaldırıldı (spec §9);
  veli/öğrenci create'e `password` eklendi (admin girer, asenkron hash) ve
  otomatik `username`; `whatsapp_phone` create'te **zorunlu**, PATCH'te
  **opsiyonel-ama-null-olamaz** (kısmi güncelleme bozulmaz);
  **`POST /guardians/:id/reset-password`** + **`POST /students/:id/reset-password`**
  eklendi (tv+1, audit `guardian.password_reset` / `student.password_reset`).
- Seed async (`hashPassword`): yeni `SEED_USER_PASSWORD` env'i (admin şifresinden
  ayrı); öğrenci/veli `username` + şifre; `fillUsername`/`fillPasswordHash` ile
  eski DB backfill'i (yalnızca NULL'ken, idempotent; admin güncellenmez).
- `utils/env.ts`, `.env.example`, `.env` güncellendi.

**Frontend**
- `types.ts`: `User.phone` → `username`; `LoginRequest { identifier, password }`;
  OTP tipleri silindi; Teacher/Guardian/Student `phone` → `username`.
- `api.ts`: `authApi.login` tek uç; OTP uçları silindi; admin guardian/student
  create `password` + whatsapp zorunlu; reset-password uçları.
- `AuthContext`: `loginWithOtp` kaldırıldı; tek `login(identifier, password)`.
- `LoginPage`: tek form ("E-posta veya kullanıcı adı" + "Şifre"); rol seçici,
  OTP iki aşaması ve sayaç kaldırıldı.
- Admin sayfaları: Teachers/Students/Guardians `phone` gösterimi → `username`;
  create formlarına başlangıç şifresi; satırlarda "Şifre sıfırla" + modal;
  veli formunda WhatsApp zorunlu.

**Testler**
- `auth.test.ts` yeniden yazıldı (4 rol username/email login, yanlış/olmayan
  hesap 401, brute-force, tv uyumsuzluğu, yetki matrisi).
- `admin.test.ts`: teacher/admin `phone` kalktı; guardian/student create
  `password` + otomatik `username` + whatsapp zorunlu; PATCH whatsapp null → 400;
  guardian/öğrenci reset-password testleri.
- `test/helpers.ts`: `otp_codes` temizlik listesinden çıktı; test kullanıcıları
  username+şifreli.
- `teacher.test.ts` / `student.test.ts`: ham INSERT'lerde `phone` → `username`.
- `schema.test.ts`: `otp_codes` listeden çıktı; `await seedDatabase(admin, user)`;
  username unique + password_hash dolu testi.
- `migration-backfill.test.ts`: rewind'e #5 geri sarımı (users `phone`/`idx`,
  `otp_codes` yeniden kurulur) + `user_version` 5.
- Frontend `api.test.ts` / `App.test.tsx`: identifier login, tek form, username.

### Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| Backend testleri (taze test.db) | ✅ 141/141 (11 dosya) |
| Frontend testleri | ✅ 25/25 (4 dosya) |
| typecheck (kök + backend) + lint + build | ✅ |
| Canlı (gerçek app.db, `db:reset`): admin/öğretmen e-posta + `ogrenci1`/`veli1` username → 200 + JWT | ✅ |
| Yanlış şifre ve olmayan identifier → 401 (aynı mesaj) | ✅ |
| `/auth/otp/request` → 404 (rota kaldırıldı) | ✅ |
| `user_version` = 5 | ✅ |

### Çözülen sorunlar

- **PowerShell `Set-Content` UTF-8 mojibake:** `admin.test.ts`'i PowerShell'le
  düzenlerken dosya UTF-8 olarak değil sistem kod sayfasıyla okunup yeniden
  yazıldı; tüm Türkçe karakterler bozuldu (arama/çakışma testleri başarısız
  oldu). Dosya git'ten geri alınıp düzenlemeler UTF-8 güvenli edit aracıyla
  yeniden yapıldı.
- **Migration-backfill rewind #5'i kapsamıyordu:** v2 geri sarımı yalnızca
  classes/courses/submissions'ı düzeltiyordu; #5 eklenince users + otp_codes
  geri sarımı da eklendi.
- **Test DB kalıntısı:** bozuk durumdaki `test.db` sıralı koşuda hata veriyordu;
  temizlenerek taze şemadan koşuldu.

### Commit

(Aşama 2a retrofit commit hash'i)

### Güncel dosya yapısı

```
backend/src
  /db/migrations.ts        (+ migration #5 username_login)
  /utils/username.ts       (yeni — otomatik ogrenci<n>/veli<n>)
  /routes/auth.ts          (yeniden yazıldı — tek identifier login)
  /routes/admin.ts         (username + password + whatsapp zorunlu + reset-password)
  /services/otp.ts sms.ts otp.test.ts   (silindi)
  /test/helpers.ts         (username + şifre; otp_codes'suz temizlik)
  /db/migration-backfill.test.ts  (#5 geri sarımı; user_version 5)
src
  /pages/LoginPage.tsx     (tek form)
  /pages/admin/*           (username + başlangıç şifresi + şifre sıfırlama)
  /services/api.ts types.ts context/AuthContext.tsx  (identifier login)
```

---

## Aşama 4 — Ödev ve teslim ✅

### Süreç özeti

`homeworks` kaydı raporla birlikte draft olarak zaten oluşuyordu (Aşama 3);
öğrenci "Ödevlerim" ekranında yalnızca `completed`/`sent` raporların ödevleri
görünür (karar noktası 1). Teslim dosyaları `submissions.files` JSON'undan
ayrılıp tek doğru kaynak olan `submission_files` tablosuna taşındı (migration
#4 — karar noktası 2). Multer + heic-convert + sharp ile HEIC→JPEG ve
görsel küçültme (2000px, q80) yapılır; PDF aynen saklanır. Dosyalara
`express.static` yerine korumalı `GET /api/v1/files/:key` rotası üzerinden
erişilir (rol × sahiplik matrisi). Öğretmen teslim kontrol ekranı bir ödevin
tüm teslimlerini gezdirir ve "İncelendi" işaretler. `is_late`, submitted_at'ın
Europe/Istanbul yerel günü > due_date ise 1 olur (kullanıcı kararı).

### Yapılanlar

**Spec + şema**
- `spec.md` §3.2: `submissions.files` JSON kaldırıldı; **`submission_files`**
  (id, submission_id, key UNIQUE, filename, size, mime, ext) tek doğru kaynak
  olarak eklendi (migration #4'ten önce spec güncellendi — kural #4).
- Migration #4: `ALTER TABLE submissions DROP COLUMN files` +
  `CREATE TABLE submission_files` + indeks; #1-3'e dokunulmadı (dondurulmuş).

**Backend (`services/storage.ts`, `middleware/upload.ts`)**
- `saveUpload`: mime/uzantı çözümleme → HEIC ise `heic-convert` (JPEG buffer;
  başarısızlıkta Türkçe hata "Bu fotoğraf formatı işlenemedi, lütfen JPEG
  olarak yükleyin.") → sharp (`rotate()` + `resize` 2000px `inside` +
  `jpeg({quality:80})`) → `backend/uploads`'a yaz. PDF aynen. Ham dosya
  saklanmaz. Key: `{timestamp}-{randomHex}.{ext}`.
- `localPathFor(key)`: sıkı key regex'i ile path traversal koruması.
- Multer `memoryStorage`, `fileFilter` (jpg/jpeg/png/heic/pdf), 10 MB/dosya,
  10 dosya. Multer limit ihlalleri `errorHandler`'da 400 VALIDATION_ERROR'a
  çevrildi.
- `utils/time.ts`: `localDateISO` (Europe/Istanbul) + `isLateSubmission`.
- **`routes/student.ts`** (tamamı `requireAuth`, student rolü):
  - `GET /student/homeworks` — enrollment eşleşmesi + `completed/sent` +
    `description <> ''`; puan/not/rapor asla dönmez; teslim dosyalarıyla.
  - `POST /student/homeworks/:id/submit` — çoklu dosya; `is_late` otomatik;
    yeniden yüklemede eski dosyalar değiştirilir (commit sonrası diskten silinir).
- **`routes/teacher.ts` ekleri:**
  - `GET /teacher/submissions` (seçici: teslimi olan ödevler + sayım) ve
    `?homework_id=` (teslim detayı + dosyalar).
  - `PATCH /teacher/submissions/:id` — **zincir yetki handler ilk satırında:**
    submission → homework → class_course → `teacher_id = req.user.id`
    (kullanıcı kararı 2).
  - `buildReportPayload`'a teslim rozeti + dosya önizleme anahtarları eklendi.
- **`routes/files.ts`** — `GET /files/:key`: `auth` + yetki matrisi (öğrenci:
  kendi; öğretmen: kendi ödevinin; veli: çocuğunun; admin: hepsi);
  `files_purged_at` → 404; yerel `res.sendFile()`; `express.static` kullanılmaz.
- `routes/index.ts` — student + files mount.
- Bağımlılıklar `backend/package.json`'a: multer, sharp, heic-convert,
  @types/multer; `UPLOADS_DIR` env'i ile testler ayrı temp dizin kullanır.

**Frontend**
- `services/api.ts`: `studentApi` (homeworks, submit — FormData'da Content-Type
  set edilmez), `teacherApi` teslim uçları, `fileUrl(key)`.
- `pages/student/HomeworkListPage.tsx` ("Ödevlerim", `comfortable`): ders/
  öğretmen/hafta/açıklama/son tarih + teslim rozetleri (yüklendi/geç/yüklenmedi),
  çoklu dosya seçimi (uzantı + 10MB + 10 dosya doğrulaması), not, "Gönder",
  yüklenen dosya linkleri. Puan/not yok.
- `pages/teacher/SubmissionsReviewPage.tsx` ("Teslim kontrol"): seçici panel +
  teslim listesi, dosya açma, "İncelendi olarak işaretle".
- `ReportEntryPage`: öğrenci satırında teslim rozeti (mobil kart dahil) —
  tıklayınca dosyayı açar.
- `App.tsx` + `AppLayout`: `/student` rotası + "Ödevlerim"/"Teslimler" nav;
  `DashboardPage` giriş sonrası role göre yönlendirir (student→/student vb.).

**Testler**
- `storage.test.ts` (6): key formatı, PNG→JPEG küçültme, PDF aynen, HEIC hata
  mesajı, mime yoksa uzantıdan çözüm, path traversal.
- `student.test.ts` (21): tamamlanmış ödev listesi (draft/başka sınıf gizli,
  puan sızması yok), yükleme → JPEG saklama, `is_late` (Istanbul), yeniden
  yükleme, boş/hatalı tip/10MB 400'leri, **dosya yetki matrisi** (öğrenci/
  öğretmen/admin/veli 200; başka öğrenci + başka öğretmen 403), teslim listesi,
  PATCH reviewed (zincir yetki + başka öğretmen 403).
- Frontend `student.test.tsx` (6): studentApi birim + HomeworkListPage
  (rozetler, boş durum, geç rozet, yükleme akışı).

### Doğrulamalar (adım adım kanıt)

**Statik**
- `npm run typecheck` (kök + backend) → ✅ `tsc --noEmit` temiz
- `npm run lint` → ✅ `eslint .` temiz; `npm run build` → ✅ (vite)

**Backend testleri** — ✅ 155/155 (12 dosya; önceki 128 + yeni 27)
- `src/student.test.ts` (21) + `src/storage.test.ts` (6) ayrıca doğrulandı.
- Taze `test.db` + `db:reset` üzerinde sıralı tam paket ✅.
- `migration-backfill.test.ts` güncellendi: rewind #2 durumuna `submission_files`
  düşürme + `submissions.files` geri eklemeyi de içerir; #4 sonrası `user_version`
  beklentisi 4.

**Frontend testleri** — ✅ 26/26 (4 dosya; önceki 20 + yeni 6)
- `src/student.test.tsx` (6); `App.test.tsx`'in öğretmen /admin testi rol
  yönlendirmesine göre güncellendi ("Bu hafta doldurulacaklar").

**Canlı sunucu (gerçek app.db, `db:reset`) — 19/19 adım ✅**
1. `GET /student/homeworks` 200 → tamamlanmış ödev listede; yanıtta
   puan/not/konu sızmıyor.
2. `POST /submit` PNG → 200, `is_late=true` (seed week-19 ödevi geçmiş);
   dosya diskte JPEG olarak saklandı (270 B, `<200 KB` küçültme kanıtı).
3. Dosya erişimi: sahip öğrenci ✅ 200 · öğretmen (kendi ödevi) ✅ 200 ·
   admin ✅ 200 · **başka öğrenci ✅ 403** · **başka öğretmen ✅ 403**.
4. Öğretmen `GET /teacher/submissions?homework_id` ✅ teslimi görüyor;
   `PATCH reviewed` ✅ 200; başka öğretmenle ✅ 403 (zincir yetki).
5. Rapor giriş payload'ında öğrenci satırı teslim rozeti ✅ (dosya anahtarıyla).
6. Temizlik: teslim + dosya silindi, ardından `db:reset` ile app.db temizlendi.

### Çözülen sorunlar

- **Test DB bozulması (migration-backfill):** Rewind #2 durumuna #4'ün
  `DROP COLUMN files`'ı hesaba katmıyordu; test.db "v3 + files yok +
  submission_files var" tutarsız durumuna düşüyordu. Rewind'a `DROP TABLE
  submission_files` + `ALTER TABLE submissions ADD COLUMN files` eklendi;
  `user_version` beklentisi 4'e çekildi.
- **`resetDb` FK sırası:** `submission_files` listeye `submissions`'tan önce
  eklendi (yoksa DELETE submissions FK ihlali veriyordu); schema.test.ts
  temizlik listesi de güncellendi.
- **Express 5 param tipi:** `asyncHandler`'da `req.params.id` `string|string[]`
  oluyordu → `asyncHandler<{ id: string }>`.
- **`heic-convert` tipi:** paketin tipi yok → `backend/src/heic-convert.d.ts`.
- **Multer hataları 500 düşüyordu:** `MulterError` (10 MB / 10 dosya)
  `errorHandler`'da 400 VALIDATION_ERROR'a çevrildi.
- **Seed kimlik ayrımı:** canlı doğrulamada `users.id` (`seed-user-student-001`)
  ile `students.id` (`seed-student-001`) farklı — token `id` users.id,
  `student_id` students.id olmalı.
- **`is_late` test beklentisi:** due_date geçmişte olan ödeve yükleme gerçekten
  geç sayılır; "normal teslim" testi due'yu geleceğe alarak düzeltildi.

### Commit

`9b0cf0a` — Aşama 4: ödev ve teslim (submission_files migration #4, storage/
sharp/HEIC, korumalı dosya rotası, student rotaları, teslim kontrol, rozetler,
testler + spec.md güncellemesi)

### Güncel dosya yapısı (Aşama 4 ekleri)

```
/backend/src
  /middleware/upload.ts        (yeni — multer memory + tipler + limitler)
  /routes/student.ts           (yeni — Ödevlerim + submit)
  /routes/files.ts             (yeni — korumalı dosya rotası)
  /services/storage.ts         (yeni — key + HEIC/sharp + yerel disk)
  /utils/time.ts               (yeni — Istanbul yerel gün + isLate)
  heic-convert.d.ts            (yeni — tip bildirimi)
  storage.test.ts student.test.ts   (yeni)
  /db/migrations.ts            (+ #4 submission_files)
  /db/migration-backfill.test.ts /db/schema.test.ts  (rewind güncellendi)
  /routes/teacher.ts           (+ teslim listesi/reviewed + rozet payload)
  /routes/index.ts             (+ student/files mount)
  errors.ts                    (+ MulterError → 400)
  vitest.config.ts             (+ UPLOADS_DIR)
/src
  /pages/student/HomeworkListPage.tsx        (yeni)
  /pages/teacher/SubmissionsReviewPage.tsx   (yeni)
  /pages/teacher/ReportEntryPage.tsx         (+ teslim rozetleri)
  /services/api.ts (+ studentApi, teacherApi teslim, fileUrl)
  /types.ts (+ submission/homework tipleri)
  App.tsx AppLayout.tsx DashboardPage.tsx    (rol yönlendirme + rotalar)
  student.test.tsx (yeni)
spec.md  (§3.2 submissions.files → submission_files)
```

---

## Aşama 3 — Toplu rapor giriş ekranı ✅

### Süreç özeti

Öğretmen "Bu hafta doldurulacaklar" listesinden rapor açıyor; get-or-create
rapor, aktif enrollment'lardan öğrenci satırlarını ve taslak ödev satırını
otomatik üretiyor. Rapor giriş ekranı klavye navigasyonlu (Enter/ok) tablo,
2 sn debounce'lu autosave, devamsız satırda puanların zorunlu null olması,
toplu doldurma çubuğu ve mobilde kart görünümü içeriyor. "Raporu tamamla"
eksik puan ve son hafta due_date doğrulamasından geçerek `completed` yapıyor.

### Yapılanlar

**Backend (`routes/teacher.ts` — tamamı `requireAuth`; admin de doldurabilir)**
- `GET /dashboard`: güncel hafta (aktif yılın `start_date <= bugün` son kaydı;
  yoksa ilk kayda düşer); öğretmen sorgusu `teacher_id = req.user.id` filtreli;
  `day_of_week + lesson_time` sıralı; completed/sent düşer; günü geçmiş
  taslaklar `is_overdue` bayrağıyla üstte (önce `is_overdue`, sonra gün).
- `POST /reports` get-or-create: yoksa tek akışta rapor + hafta başında aktif
  enrollment'lardan `report_entries` + draft `homeworks` satırı (`description`
  boş, `due_date` sunucuda `calculateDueDate()`; son haftada null → homework
  satırı oluşturulmaz). `prev_homework_text`, önceki ders haftasının aynı
  atamadaki ödev açıklamasından otomatik dolar (yoksa boş serbest metin).
- `PUT /reports/:id` autosave: topic, verilmiş ödev (`prev_homework_id` null +
  `prev_homework_text` elle değişince — tablo CHECK bunu zorlar), yapılacak
  ödev + `due_date`; **normal haftada due_date boşaltılamaz** (kullanıcı
  düzeltmesi: boş gelirse önceki değer korunur; yalnızca son hafta senaryosunda
  null kabul edilir); devamsız (`absent`/`excused`) satırda puanlar zorunlu
  null; `completed` düzenlemesinde `audit_logs.report.update` yazılır.
- `POST /reports/:id/complete`: devamsız olmayan her satırda iki puan da dolu
  olmalı (eksik → 400 `VALIDATION_ERROR` + `fields`); son hafta due_date null
  ise 400; başarılıysa `status='completed'` + `completed_at`.
- Yetki: her handler ilk satırında — öğretmen yalnızca kendi `class_course`
  (`assertCanFill`), admin tümü; `sent` rapora PUT/complete 403.

**Seed**
- Haftalar göreceli üretilir: week 20 = bu hafta, week 21 = sonraki hafta —
  dashboard her zaman "dolacak bir hafta" ve `calculateDueDate()` her zaman
  sonuç üretir (Aşama 3 akışı her zaman test edilebilir).

**Frontend**
- `pages/teacher/TeacherDashboardPage`: "Bu hafta doldurulacaklar", günü
  geçmişler amber rozetle üstte, tamamlananlar listede yok, boş durum metni.
- `pages/teacher/ReportEntryPage` (spec §6.1): üst alanlar (verilmiş ödev,
  işlenen konu, yapılacak ödev, son tarih — date input), son haftada
  "Yılın son haftası — teslim tarihini siz belirleyin" uyarısı + boş tarih;
  compact tablo (13px, `tabular-nums`): devamsızlık, ödev puanı, ilgi puanı,
  not; klavye nav (Enter/oklar), devamsızlık → puanlar disable + null,
  toplu doldurma ("Tümünü geldi yap", "Tümü için puan Uygula"), 2 sn debounce
  autosave + "Kaydediliyor…/Kaydedildi", "Raporu tamamla", satır içi hata
  (fields → alan altında); mobilde öğrenci başına kart + Önceki/Sonraki.
- `components/admin/ui`'deki şablonlar (Field, LoadingState, EmptyState,
  FormError, PrimaryButton) kullanıldı; tasarım token'larından sapma yok.

**Testler**
- `backend/src/teacher.test.ts` (22 test): oluştur → doldur → eksik puanla
  tamamla (400) → tamamla (200); yabancı öğretmen 403; `sent` düzenleme 403;
  prev homework otomatik dolumu; devamsız satır null zorlaması; **son hafta
  fixture** (sahne akademik yıl + tek hafta, seed'e dokunmadan) → due_date
  null → complete 400 → tarih girilince 200.
- `src/teacher.test.tsx` (8 test): dashboard listeleme + gecikme bayrağı;
  rapor giriş ekranı otomatik kaydetme, devamsızlık-disable, toplu doldurma.

### Doğrulamalar (adım adım kanıt)

**Statik**
- `npm run typecheck` (kök + backend) → ✅ `tsc --noEmit` temiz
- `npm run lint` → ✅ `eslint .` temiz

**Backend testleri — `teacher.test.ts` (22 test, ayrı çalıştırıldı ✅)**
- `entegrasyon zinciri: eksik puanla tamamla 400, doldurunca 200 + completed`
- `başka öğretmenin atamasına rapor oluşturulamaz (403)`
- `gönderilmiş (sent) rapor düzenlenemez ve tamamlanamaz (403)`
- `rapor + satırlar + draft homeworks oluşturur; prev ödev otomatik dolar`
- `devamsız satırda puanlar null yapılır`
- `tek haftalık yılda due_date null; tarih girilmeden tamamla 400, girilince 200`
- Tüm backend paketi: ✅ 128/128 (10 dosya)

**Frontend testleri**
- `src/teacher.test.tsx` (8 test): dashboard listeleme + gecikme bayrağı,
  rapor giriş ekranı autosave, devamsızlık-disable, toplu doldurma
- Tüm paket: ✅ 20/20 (3 dosya)

**Canlı sunucu (seed öğretmeni, temiz `db:reset`) — 7/7 adım**
1. `ogretmen1@dershane.local` / `admin123` giriş → ✅ HTTP 200 (JWT)
2. `GET /teacher/dashboard` → ✅ week 20, 9 kayıt ("bu hafta doldurulacaklar")
3. `is_overdue` bayrağı → ✅ 9 gecikmiş
4. `POST /teacher/reports` get-or-create → ✅ rapor `b1f2494c...`, 6 öğrenci
5. `prev_homework_text` otomatik dolu → ✅ "Hafta 19 ödevi — ders 1"
6. Eksik puanla `POST /reports/:id/complete` → ✅ 400 `VALIDATION_ERROR` +
   `fields` (ör. `{"seed-student-001":"Ödev ve ilgi puanı girilmeli.", ...}`)
7. Tüm satırları doldur (PUT 200) → `complete` (200) → **DB sorgusu:**
   `SELECT status, completed_at FROM reports WHERE id = ?` →
   `{"status":"completed","completed_at":"2026-08-04T14:21:07.592Z"}`

**Canlı yetki kanıtı**
- `ogretmen2` → `ogretmen1`'in atamasına `POST /teacher/reports` →
  ✅ **403** `{"error":{"code":"FORBIDDEN","message":"Bu rapora erişim yetkiniz yok."}}`

### Kullanıcı geri bildirimi — "tamamlanan rapor kayboluyor" ✅ (eklenti)

- **Sorun:** Dashboard yalnızca draft/açılmamış gösteriyor; tamamlanan raporlar
  listeden düşüyordu ve öğretmenin bunları görüntüleyeceği bir ekran yoktu.
- **Çözüm (spec.md §6 "Geçmiş raporlarım" — Aşama 3'te atlanmıştı):**
  - Backend: `GET /teacher/reports` — öğretmenin **tüm** raporları (draft/
    completed/sent), hafta başı azalan sıralı, sınıf/ders/öğrenci sayısı ve
    `class_course_id`/`week_id` ile; `?status=` filtresi; öğretmen sahiplik +
    admin tümü.
  - Frontend: `pages/teacher/ReportHistoryPage.tsx` ("Geçmiş raporlarım"),
    rota `/teacher/reports/history`, dashboard'dan link, satırlar durum
    rozetiyle ve "Aç" (rapor giriş ekranına geri döner).
- **Doğrulama:** canlı `GET /teacher/reports` → ✅ 14 rapor; `completed`
  örneği `{"id":"b1f2494c","class_course_id":"seed-class-course-001-1",
  "week_id":"seed-week-20","status":"completed","student_count":6}`;
  testler 128/128 (backend) + 20/20 (frontend); typecheck ×2 + lint + build ✅.

### Çözülen sorunlar

- **Header merge sırası:** doğrulama script'inde `...opts` headers'ı
  `content-type`'ın üzerine yazıyordu → JSON body tanınmıyordu; headers her
  zaman sonradan merge edilecek şekilde düzeltildi.
- **Eski seed:** canlı DB'de eski hafta verisi dashboard'u `week 1` fallback'ine
  düşürüyordu; `db:reset` ile göreceli haftalar (20/21) yüklendi → `week 20`.

### Commit

`38a9f2f` — Aşama 3 (adım 1): öğretmen dashboard + rapor get-or-create
`e962f42` — Aşama 3 (adım 2): PUT autosave + POST complete + son hafta fixture testleri
`921fe6b` — Aşama 3 (adım 3-4): öğretmen dashboard + rapor giriş ekranı frontend'i
`59b9af9` — Aşama 3 FX: öğretmen "Geçmiş raporlarım" (GET /teacher/reports + ReportHistoryPage + dashboard link)

---

## Aşama 2b — Admin CRUD ✅

### Süreç özeti

Admin; eğitim yılı, hafta, sınıf, ders, öğretmen-sınıf-ders atamaları,
öğrenci-veli yönetimi ve enrollment'ları API + web arayüzü üzerinden
yönetebiliyor. Sınıf değişikliği **hafta sınırında** zorlanıyor (admin hafta
seçer, tarihler sistem tarafından kurulur). İsim aramaları için
`classes`/`courses` tablolarına `name_normalized` eklendi (migration #3).
Hassas yönetim işlemleri `audit_logs`'a yazılıyor.

### Yapılanlar

**Spec + şema**
- `spec.md` §3.1: `classes.name_normalized` + `courses.name_normalized`
  (isim araması/çakışma ASCII'ye indirgenmiş ad üzerinden).
- Migration #3: kolonlar + JS backfill (`normalizeTurkish`) + UNIQUE
  indekslerin normalized'a taşınması; seed güncellendi.

**Backend (`routes/admin.ts`, tamamı `requireAuth` + `adminOnly`)**
- Yardımcılar: `utils/pagination.ts` (page/pageSize clamp, `paged`),
  `utils/phone.ts` (normalizePhone — auth.ts'ten taşındı),
  `services/audit.ts` (`writeAuditLog` + `isUniqueViolation`),
  `utils/asyncHandler.ts` (Express 4 async hata taşıma; generic P).
- Eğitim yılı: GET/POST/PATCH; tek aktif (is_active geçişi transaction);
  ad çakışması 409.
- Hafta: GET (yıl filtresi), POST (`week_no` UNIQUE → 409; aralık yıl
  dışına taşamaz → 400), PATCH **yalnızca tarih/label — `week_no`
  düzenlenemez** (kullanıcı düzeltmesi), DELETE (raporlu hafta 409).
- Sınıf/ders: GET (normalized arama), POST/PATCH/DELETE; UNIQUE çakışma
  Türkçe harf duyarsız 409; silme korumaları (aktif enrollment'lı sınıf,
  atanmış ders → 409).
- Atamalar: GET (JOIN adlar), POST (sınıf+ders çifti UNIQUE → 409,
  `teacher_id` öğretmen olmalı), PATCH (gün/saat/öğretmen), DELETE (raporlu
  atama 409).
- Öğretmen: GET (arama + sayfalama), POST (şifre **admin girer**, asenkron
  `hashPassword`), PATCH, `reset-password` (`token_version` +1 + audit),
  DELETE (aktif atamalı öğretmen 409 + audit).
- Admin ekleme: `POST /admins` + audit `user.create` (spec §2).
- Veli: GET (arama + sayfalama + çocuk sayısı; kimlik `guardians.id` —
  students FK'sıyla tutarlı), POST (users+guardians transaction), PATCH
  (`whatsapp_phone` null yapılabilir), DELETE (çocuğu olan veli 409 + audit).
- Öğrenci: GET (ad **veya veli adı** araması + sınıf filtresi + sayfalama),
  POST (users+students+enrollments tek transaction), PATCH, DELETE (soft +
  tv+1 + aktif enrollment kapanır), **`change-class`**: admin `week_id`
  seçer → yeni enrollment `start_date` = hafta başı, eski enrollment
  `end_date` = önceki ders haftası sonu (`getPreviousWeek`; ilk haftaysa
  hafta başı - 1 gün); yıl uyuşmazlığı 400, aynı sınıf 409 + audit
  `student.class_change`.

**Frontend**
- `services/api.ts`: `adminApi` (tüm uçlar) + `query()` helper.
- `hooks/useList.ts`: arama + sayfalama + yenileme state yönetimi.
- `components/admin/`: `AdminLayout` (8 sekme), `Modal`, `Pagination`,
  `ui.tsx` (Field/SearchBox/EmptyState/butonlar — token'lardan türetilir).
- 8 sayfa: Eğitim yılı (tek aktif), Haftalar, Sınıflar, Dersler, Atamalar,
  Öğretmenler (şifre oluşturma + sıfırlama), Öğrenciler (veli aramalı
  seçici + hafta seçimli sınıf değiştirme modalı), Veliler (whatsapp notu).
- `App.tsx`: `/admin` → `ProtectedRoute roles={['admin']}`; AppLayout'da
  admin'e özel "Yönetim" linki.

### Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| Backend testleri (103) — sıfırdan kurulum zinciri, arama/sayfalama, 409'lar, yetki, tv+1, audit | ✅ (fresh test.db) |
| Frontend testleri (12) — adminApi, admin erişim engeli (öğretmen → ana sayfa), admin yönetim sayfası | ✅ |
| `npm run typecheck` (kök + backend) + `npm run lint` + `npm run build` | ✅ |
| Canlı: admin ile 2028-2029 yılını sıfırdan kurma (yıl→hafta→sınıf→ders→veli→öğrenci→öğretmen→atama) | ✅ |
| Hafta sınırında sınıf değişikliği: week 2 seçilince start 08-09, eski end 07-09 | ✅ |

### Çözülen sorunlar

- **Guardian kimlik tutarsızlığı:** API `users.id` dönerken
  `students.guardian_id` FK'sı `guardians.id` bekliyordu → öğrenci
  oluşturma 404. Guardian rotaları `guardians.id` bazlına çekildi.
- **Express 5 `req.params` tipi:** generic'siz handler'da `string |
  string[]` → `asyncHandler` generic yapıldı (`Request<{id: string}>`).
- **`react-hooks/set-state-in-effect`:** useEffect + async load deseninde
  yanlış alarm ürettiği için eslint config'de kapatıldı (React docs fetch
  deseni).
- **Migration runner sıralama bug'ı** (Aşama 2a'dan): fresh DB'de #3 dahil
  üç migration sıralı koştu — düzeltme doğrulandı.
- **Windows db kilidi:** canlı doğrulama sonrası arka planda kalan tsx
  process'i app.db'yi kilitliyordu (EPERM) — process temizliği eklendi.
- **Migration #3 backfill doğrulaması:** canlı app.db sorgusu (`ÖKLİD →
  oklid`, `Türkçe → turkce`, boş değer 0) + `migration-backfill.test.ts`:
  şema #2 durumuna geri sarılıp eski şemayla veri eklenerek #3'ün backfill'i
  gerçek eski-veri senaryosunda kanıtlandı (regresyon testi olarak kalıcı).
- **Aşama 6 notu:** atamalı öğretmen silinemediği için "öğretmen atamalarını
  toplu devretme" akışı spec.md §10 + CLAUDE.md Aşama 6'ya işlendi.

### Commit

`Aşama 2b` — 6 commit (adım 1-5 + final):
- adım 1: pagination/phone/audit yardımcıları + eğitim yılı + hafta
- adım 2: sınıf + ders + atamalar + migration #3 (name_normalized)
- adım 3: öğretmen + admin + audit
- adım 4: öğrenci + veli + enrollment + hafta sınırında sınıf değişikliği
- adım 5: admin frontend (8 sayfa)
- adım 6: bitti kriteri doğrulaması + PROGRESS.md (bu commit)

### Güncel dosya yapısı

```
/backend/src
  /routes/admin.ts                (yeni — tüm admin CRUD)
  /services/audit.ts              (yeni)
  /utils/pagination.ts phone.ts asyncHandler.ts   (yeni)
  /db/migrations.ts               (+ migration #3 name_normalized)
  /db/seed.ts                     (name_normalized alanları)
  /src/admin.test.ts              (yeni — 39 test)
/src
  /hooks/useList.ts               (yeni)
  /components/admin/              (yeni: AdminLayout, Modal, Pagination, ui)
  /pages/admin/                   (yeni: 8 CRUD sayfası)
  /services/api.ts                (+ adminApi)
  /types.ts                       (+ admin tipleri)
  App.tsx AppLayout.tsx App.test.tsx  (admin rotaları + erişim testleri)
```

---

## Aşama 2a — Kimlik doğrulama ve yetki ✅

### Süreç özeti

JWT kimlik doğrulama (admin/öğretmen e-posta+şifre, veli/öğrenci telefon+OTP),
`token_version` karşılaştırmalı `auth` middleware'i, `adminOnly`, login
brute-force rate limit, rol bazlı frontend koruması ve 4 rol × yetki test
matrisi eklendi. OTP kayıtları için `spec.md`'ye `otp_codes` tablosu eklendi
ve migration #2 olarak yazıldı.

### Yapılanlar

**Spec + şema**
- `spec.md` §3.1: `otp_codes` tablosu (is_valid, attempts, expires_at,
  last_sent_at, used_at); §2.1: JWT ömrü (admin/öğretmen 7 gün, veli/öğrenci
  30 gün) + login brute-force kuralı (15 dk / 5 deneme → 429).
- Migration #2 `otp_codes` (migration #1 donduruldu).

**Backend**
- `utils/token.ts` — JWT sign/verify; payload `{ id, role, teacher_id?,
  student_id?, guardian_id?, tv }`; ömür rol bazlı (`as const satisfies`).
- `services/sms.ts` — `sendSms(phone, message)`; `SMS_PROVIDER_KEY` boşsa
  konsola yazar.
- `services/otp.ts` — `requestOtp` (6 hane, 10 dk, 2 dk rate limit, yeni
  istekte kullanılmamış eski OTP'ler `is_valid = 0`), `verifyOtp`
  (invalid/expired/locked; 5. denemede OTP ölür; tek kullanımlık).
- `middleware/auth.ts` — Bearer JWT + `users.token_version` karşılaştırması
  + `deleted_at`/`is_active` kontrolü; rol DB'den okunur (payload'a
  güvenilmez).
- `middleware/adminOnly.ts` — admin dışı 403.
- `middleware/rateLimit.ts` — in-memory sabit pencere; `clearRateLimits()`
  testlerde; login'de IP + e-posta anahtarıyla 15 dk / 5 deneme.
- `routes/auth.ts` — `POST /auth/login` (scrypt doğrulama **asenkron**
  `verifyPassword` — seed'deki `scryptSync` login'de KULLANILMAZ),
  `POST /auth/otp/request`, `POST /auth/otp/verify`, `GET /auth/me`.
  Hesap var/yok sızıntısı önlenir (login: tek mesaj; otp/verify: genel mesaj).
- `types.ts` — `AuthUser` + Express `Request.user` global bildirimi.
- `index.ts` — `loadEnv()` eklendi (JWT_SECRET için zorunluydu).

**Frontend**
- `services/api.ts` — fetch sarmalayıcı (Bearer, `ApiClientError`,
  401'de token temizleme), `authApi` uçları.
- `context/AuthContext.tsx` — token localStorage, açılışta `/auth/me`
  doğrulaması, `login` / `loginWithOtp` / `logout`.
- `components/ProtectedRoute.tsx` — token yoksa `/login`, rol uyuşmazsa `/`.
- `pages/LoginPage.tsx` — rol seçimi; admin/öğretmen e-posta+şifre;
  veli/öğrenci telefon → OTP iki aşama (kod iste → kodu gir, 120 sn sayaç);
  alan altı hata, yükleniyor durumu.
- `App.tsx` — `/` ProtectedRoute + AppLayout; `*` → `/`; `AppLayout`'a
  kullanıcı adı + rol + çıkış.

### Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| Backend testleri (64) — login, OTP akışları, rate limit, tv uyumsuzluğu, yetki matrisi | ✅ |
| Frontend testleri (10) — api client, LoginPage, ProtectedRoute yönlendirme | ✅ |
| `npm run typecheck` (kök + backend) | ✅ |
| `npm run lint` | ✅ |
| `db:reset` (migration #1→#2 sıralı, fresh DB) | ✅ |
| Canlı: admin login + `/auth/me`, öğretmen yanlış şifre 401, OTP request→verify (kod konsola loglandı) | ✅ |

### Çözülen sorunlar

- **Migration runner sıralama bug'ı:** `runMigrations` `currentVersion`'ı
  döngü başında bir kez okuyordu; 2+ migration birlikte koşunca (ör. fresh
  DB'de #1 → #2) "beklenen 1, alınan 2" hatası fırlatıyordu. Aşama 1'de
  test.db hep güncel olduğundan gizliydi. Döngü içinde `nextVersion`
  güncellenerek düzeltildi.
- **Express 4 hata akışı:** Test router'ı `createApp`'in `errorHandler`'ından
  SONRA mount edilince adminOnly hatası HTML 403'e düşüyordu (error handler
  en sonda olmalı). Test app'ine errorHandler yeniden eklendi.
- **OTP 2 dk kuralı test izolasyonu:** `last_sent_at` DB'de olduğundan
  testler arası sızıyordu; `beforeEach`'te `otp_codes` temizliği eklendi.
- **`jsonwebtoken` expiresIn tipi:** `Record<Role, string>` literal genişliyor
  → `as const satisfies` ile `StringValue` tipi korundu.

### Commit

`cef93b2` — Aşama 2a: JWT + OTP kimlik doğrulama, auth/adminOnly/rateLimit middleware, rol bazlı frontend koruması, migration #2 (otp_codes)

### Güncel dosya yapısı

```
/backend/src
  /db/migrations.ts   (+ migration #2 otp_codes; runner sıralama düzeltmesi)
  /middleware/auth.ts /adminOnly.ts /rateLimit.ts   (yeni)
  /services/sms.ts /services/otp.ts                 (yeni)
  /utils/token.ts                                   (yeni)
  /routes/auth.ts + /routes/auth.test.ts → src/auth.test.ts (taşındı)
  /services/otp.test.ts /test/helpers.ts            (yeni)
  /src/types.ts (AuthUser + Request.user)
/src
  /services/api.ts + api.test.ts                    (yeni)
  /context/AuthContext.tsx                          (yeni)
  /components/ProtectedRoute.tsx                    (yeni)
  /pages/LoginPage.tsx                              (yeniden yazıldı)
  /components/layout/AppLayout.tsx                  (rol + çıkış)
  App.tsx / App.test.tsx                            (rol korumalı rotalar)
```

---

## Aşama 1 — Veri modeli ve seed ✅

### Süreç özeti

`spec.md` §3'teki tüm tablolar STRICT + kısmi indeks deseniyle migration #1
olarak kuruldu. Türkçe normalizasyon, hafta/son tarih hesapları ve parola
hash'leme util'leri birim testleriyle eklendi. Ayrı CLI seed script'i
(idempotent, deterministik id'ler) örnek veriyi üretiyor; geçen hafta
raporları `completed` durumunda.

### Yapılanlar

**Migration #1 — Şema (donduruldu)**
- `registerMigration(1, 'schema', ...)` — `spec.md` §3 DDL birebir:
  - `users`, `guardians`, `students`, `academic_years`, `weeks`, `classes`,
    `courses`, `class_courses`, `enrollments`
  - `reports`, `homeworks`, `report_entries`, `submissions`,
    `weekly_digests`, `audit_logs`
- Tüm tablolar `STRICT`; tip eşlemesi TEXT/INTEGER; CHECK kısıtları:
  - `role`, `status` kümeleri; `is_active`/`is_late`/`is_revoked` 0/1;
    `day_of_week BETWEEN 1 AND 7`; puanlar `BETWEEN 1 AND 10`
  - `reports`: `CHECK (prev_homework_id IS NULL OR prev_homework_text IS NULL)`
  - `report_entries`: devamsızsa puan null CHECK
- Kısmi indeksler: `idx_users_phone`, `idx_guardians_user`, `idx_students_user`,
  `idx_classes_name`, `idx_courses_name`, `idx_class_courses_pair`
  (tümü `WHERE deleted_at IS NULL`)
- Tablo içi UNIQUE (soft delete'siz): `weeks`, `reports`, `report_entries`,
  `submissions`, `weekly_digests`

**Util'ler + testler**
- `utils/text.ts` — `normalizeTurkish()`: tam ASCII (ö→o, ü→u, ş→s, ç→c, ğ→g,
  İ→i, I→ı→i — "İIıi" → "iiii"); `toLocaleLowerCase('tr')` sonra harita.
  Arama sorgusu da aynı fonksiyondan geçer (yazma ve arama birebir eşleşir).
- `utils/weeks.ts` — `getPreviousWeek()` ve `calculateDueDate()`:
  tatil haftaları kayıtsız olduğundan önceki/sonraki ders haftası takvimde
  (start_date) en yakın kayıt olarak bulunur; yılın ilk haftasında
  `getPreviousWeek()` null, yılın son haftasında `calculateDueDate()` null.
- `utils/hash.ts` — `node:crypto` scrypt: senkron (`hashPasswordSync`,
  `verifyPasswordSync` — seed CLI) ve asenkron (`hashPassword`,
  `verifyPassword` — Aşama 2a girişi). Format: `scrypt$N$r$p$salt$hash`.
- `utils/env.ts` — `.env` okuyucu (harici paket yok).

**Seed**
- `db/seed.ts` — ayrı CLI (`npm run db:seed`), sunucuda çalışmaz.
- İdempotent: tüm eklemeler `INSERT OR IGNORE` + deterministik id'ler
  (`seed-user-teacher-001`, `seed-class-course-001-1`, `seed-week-2025-19`
  vb.) — enrollments'ta UNIQUE yok ama sabit id sayesinde çoğalmaz.
- İlk admin: `ADMIN_PASSWORD` env'inden hash'lenir; ikinci çalıştırmada
  güncellenmez.
- Hacim: 10 öğretmen, 25 sınıf, 5 ders, 100 class_courses, 200 öğrenci,
  200 veli, 200 enrollment, 20 hafta, 100 `completed` rapor, 800
  report_entry, 100 homework.
- Geçen hafta (19) raporları `completed` + `completed_at` dolu; homework
  due_date'leri `calculateDueDate()` ile hesaplanır.
- `scripts/reset.ts` güncellendi: `db:reset` = sil + migrate + seed
  (statik import Windows'ta app.db'yi kilitlediği için dinamik import).

**Test altyapısı**
- `vitest.config.ts`: testler `DB_PATH` ile ayrı `backend/db/test.db`
  kullanır (gerçek app.db'ye dokunulmaz); `.gitignore`'a test.db eklendi.
- `schema.test.ts`: foreign key ihlali testleri (class_courses, students,
  report_entries) + seed hacim, idempotentlik, completed raporlar ve admin
  hash doğrulaması.

### Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| `db:reset` (migrate + seed) | ✅ |
| `db:seed` ikinci kez → kayıt çoğalmaz | ✅ (411/200/100/800 sabit) |
| Backend testleri (28 test) | ✅ foreign key ihlali + idempotentlik dahil |
| Frontend testleri (2 test) | ✅ |
| `npm run typecheck` (kök + backend) | ✅ |
| `npm run lint` | ✅ |
| `user_version` = 1 | ✅ |
| Tablolar: 14, İndeksler: 20 | ✅ |

### Senaryo verileri (kullanıcı talebi üzerine eklendi)

- **Kardeş senaryosu:** 5 yeni öğrenci (`seed-student-201..205`), ilk 5 veliye
  bağlı → o velilerin 2'şer çocuğu var. Kardeşler farklı sınıflara dağıtıldı
  (SİGMA/DELTA/ALFA/BETA/GAMMA = sınıf 6-10), veli paneli "öğrenci seçimi"
  Aşama 5'te gerçek veriyle test edilebilir.
- **Sınıf değişikliği:** öğrenci 3 → SİGMA (eski: EURİST), öğrenci 4 → DELTA.
  Eski enrollment `end_date = 2025-11-02` ile kapatılır, yeni enrollment
  `start_date = 2025-11-03` ile açılır.
- **"Geçmiş raporlar eski sınıfta kalır" kanıtı:** öğrenci 3'ün week 8 raporu
  EURİST'te, week 19 raporu SİGMA'da — Aşama 5 veli panelinde kronolojik
  geçmiş doğru sınıf etiketiyle listelenebilir.
- **Yeni hacimler:** users 416, students 205, guardians 200, enrollments 207,
  reports 108, homeworks 108, report_entries 884 (week 19: 820 + week 8: 64).
- `schema.test.ts`'e kardeş + sınıf değişikliği doğrulamaları eklendi.

### Elle doğrulama (kullanıcı talebi üzerine, canlı DB'de)

Tüm kontroller çalışan `app.db` üzerinde elle tekrar kanıtlandı:

1. **Seed idempotentliği:** `db:reset` sonrası enrollment=200, users=411;
   `db:seed` ikinci kez çalıştırıldığında sayılar **değişmedi** (200/411,
   ayrıca reports=100, report_entries=800, homeworks=100 sabit) — UNIQUE'si
   olmayan `enrollments` için asıl kanıt bu.
2. **Türkçe normalizasyon:** `Örnek Kişi 6 → ornek kisi 6`, `Örnek Kişi 5 →
   ornek kisi 5`, `Örnek Kişi 7 → ornek kisi 7`, `Öğrenci 1 → ogrenci 1` —
   yani `ı→i`, `ş→s`, `ğ→g` doğru; "ışık" değil "isik" kuralı.
3. **Geçen hafta raporları:** `reports` GROUP BY → yalnızca `completed = 100`;
   `homeworks = 100` — Aşama 3 "verilmiş olan ödev" (prev_homework) mantığı
   için veri hazır.
4. **FK açık mı:** Uygulamanın kullandığı bağlantı üzerinden
   `PRAGMA foreign_keys = 1`; olmayan referansla `report_entries` INSERT'i
   `FOREIGN KEY constraint failed` ile engellendi. (Not: `sqlite3` CLI yeni
   bağlantı açtığı için yanıltıcı olabilir; doğru doğrulama uygulama
   bağlantısındandır — `db/index.ts`'te WAL'dan hemen sonra açılır.)

### Çözülen sorunlar

- **FK sıralaması:** `students.guardian_id → guardians(id)` — önce guardian,
  sonra student eklenmeliydi; düzeltildi.
- **Windows'ta db kilidi:** `reset.ts`'te `seedDatabase`'in statik import'u
  db bağlantısını silme işleminden önce açıyordu → `EPERM`; dinamik import
  ile çözüldü.
- **`getPreviousWeek`/`getNextWeek` tasarımı:** `week_no ± 1` yerine takvimde
  (start_date) en yakın kayıt bulunuyor — tatil haftası kayması doğru çalışır.

### Commit

`5744e57` — Aşama 0: frontend/backend iskeleti, tasarım token'ları, migration runner, /api/v1 health
`669a58b` — PROGRESS.md: Aşama 0 commit hash eklendi
`524d432` — Aşama 1: veri modeli (migration #1), normalizasyon/hafta/hash util'leri, idempotent seed, FK + idempotentlik testleri
`529731b` — PROGRESS.md: Aşama 1 elle doğrulama sonuçları
`a8df0f8` — Aşama 1: seed'e kardeş (201-205) ve sınıf değişikliği (öğrenci 3-4) senaryoları + schema.test.ts güncellemesi

### Güncel dosya yapısı

```
/project
  .gitattributes
  .gitignore            (test.db eklendi)
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
    /pages/DashboardPage.tsx
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
    vitest.config.ts     (DB_PATH → test.db)
    .env / .env.example
    /src
      /db/index.ts        (bağlantı + WAL + foreign_keys + DB_PATH)
      /db/migrations.ts   (runner + migration #1 — şema)
      /db/migrate.ts      (CLI)
      /db/seed.ts         (idempotent seed + ilk admin)
      /db/schema.test.ts  (FK ihlali + seed testleri)
      /utils/text.ts      (normalizeTurkish)
      /utils/text.test.ts
      /utils/weeks.ts     (getPreviousWeek, calculateDueDate)
      /utils/weeks.test.ts
      /utils/hash.ts      (scrypt senkron + asenkron)
      /utils/hash.test.ts
      /utils/env.ts       (.env okuyucu)
      routes/index.ts
      app.ts
      app.test.ts
      errors.ts
      index.ts
    /scripts/reset.ts    (sil + migrate + seed)
PROGRESS.md