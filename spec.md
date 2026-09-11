# Dershane Haftalık Ödev Takip Sistemi — Teknik Spec

> Bu doküman Claude Code'a bağlam olarak verilmek üzere yazılmıştır.
> Kapsam: tek şube, tek dershane. Aşama 0–5 arası MVP.

---

## 1. Amaç ve ölçek

Öğretmenlerin hâlihazırda Excel üzerinde tuttuğu haftalık ödev/derse ilgi
raporlarını web tabanlı bir sisteme taşımak; öğrenciye ödevini göstermek ve
ödev teslimini toplamak; veliye haftada **tek** bir birleştirilmiş rapor
göndermek. 4 rol: admin, öğretmen, veli, öğrenci.

**Beklenen ölçek**

| | Adet |
|---|---|
| Öğretmen | ~10 |
| Öğrenci | ~200 |
| Veli | ~200 |
| Sınıf | ~25 (sınıf başına ~8 öğrenci) |
| `class_courses` kaydı | ~100 (sınıf başına 4 ders) |
| Haftalık rapor | ~100 |
| Haftalık öğrenci satırı | ~800 |
| Öğretmen başına haftalık rapor | ~10 |

Bu ölçek veritabanı için önemsiz, **arayüz tasarımı için belirleyici.**
100 raporluk bir haftayı yöneten ekranlar liste/filtre odaklı olmalı, dev
matrisler değil (bkz. §5.5). Asıl büyüyen kaynak dosya depolamadır (§8).

---

## 2. Roller ve yetkiler

| Yetki | Admin | Öğretmen | Veli | Öğrenci |
|---|:-:|:-:|:-:|:-:|
| Kullanıcı / sınıf / ders / eğitim yılı yönetimi | ✓ | – | – | – |
| Öğretmen–sınıf–ders ataması | ✓ | – | – | – |
| Hafta tanımlama | ✓ | – | – | – |
| Rapor doldurma (`draft`) | ✓ | kendi atandığı sınıf-ders için | – | – |
| `completed` raporu düzenleme | ✓ | kendi raporu (audit log'a yazılır) | – | – |
| `sent` raporu düzenleme | ✓ | ✗ | – | – |
| Ödev tanımlama | ✓ | kendi atandığı sınıf-ders için | – | – |
| Ödev teslimi yükleme | – | – | – | kendi ödevi için |
| Ödev teslimi görme | ✓ | kendi verdiği ödev için | kendi öğrencisininki | kendisininki |
| Haftalık raporu görme | ✓ (tümü) | kendi girdiği satırlar | kendi öğrencisinin gönderilmiş raporları | ✗ |
| Puan ve öğretmen notu görme | ✓ | kendi girdikleri | ✓ | ✗ |
| Veliye gönderim tetikleme | ✓ | – | – | – |
| Eksik rapor paneli | ✓ | – | – | – |
| Audit log görüntüleme | ✓ | – | – | – |

**Kritik kurallar**
- Veli, raporu ancak `status = 'sent'` olduktan sonra görebilir. Taslak veya
  tamamlanmış ama gönderilmemiş rapor veliye asla görünmez.
- Öğrenci **hiçbir puanı ve öğretmen notunu görmez.** Öğrencinin gördüğü tek
  şey: kendisine verilen ödevler ve hangisini yükleyip yüklemediği.
- Öğretmen yalnızca kendi atandığı `class_course` kayıtlarının raporlarını
  görür; aynı sınıftaki diğer derslerin raporlarını göremez.
- **Rapor düzenleme yetkisi duruma bağlıdır:**
  - `draft` → öğretmen serbestçe düzenler.
  - `completed` → öğretmen düzenleyebilir; her düzenleme `audit_logs`'a
    `report.update` olarak yazılır. (Öğretmenin akşam fark ettiği bir puan
    hatası için admin'e başvurmak zorunda kalmaması içindir.)
  - `sent` → öğretmen **düzenleyemez** (403). Veliye ulaşmış bir raporun
    içeriği öğretmen tarafından tek taraflı değiştirilemez. Yalnızca admin
    düzenler; sonrasında dilerse yeniden gönderir (yeni snapshot, yeni token).
  - Velinin gördüğü kopya `weekly_digests.snapshot`'tır; `sent` sonrası admin
    düzenlemesi mevcut linki değiştirmez.
- **Öğretmen ataması tek doğru kaynaktır (`class_courses.teacher_id`).** Takas
  veya devir sonrası **geçmiş raporlar atamayı (kişiyi değil) izler**: yeni
  öğretmen o atamanın geçmiş raporlarını görür ve (`completed` olanları)
  düzenleyebilir; eski öğretmen o atamaya ait geçmiş raporlara artık kendi
  listesinden erişemez. Bu **bilinçli bir tasarım kararıdır** — atama, kişiden
  bağımsız yaşar; "yan etki" olarak görülmez.

**İlk admin oluşturma**
- Sistemin ilk admin kullanıcısı ayrı CLI seed script'i (`npm run db:seed`)
  tarafından oluşturulur; şifresi
  `backend/.env` içindeki `ADMIN_PASSWORD` değerinden okunur.
- Seed ikinci kez çalıştırılırsa mevcut admin kaydı güncellenmez (`INSERT OR IGNORE`).
- Admin başka admin ekleyebilir; bu işlem `audit_logs`'a yazılır.

---

## 2.1 Giriş ve kullanıcı adı kuralları

Tüm roller **kullanıcı adı/e-posta + şifre** ile giriş yapar. SMS/OTP
kullanılmaz — hem sürekli bir maliyet kalemi hem de gereksiz bir telefon
numarası bağımlılığı yaratıyordu (bkz. §9 KVKK).

- **Admin / öğretmen:** `email` + şifre (değişmedi).
- **Veli / öğrenci:** `username` + şifre.

**`username` üretimi — otomatik, isim tabanlı, admin elle girmez:**
- `normalizeTurkish(full_name)` ile ASCII'ye indirgenmiş, boşluk/noktalama
  temizlenmiş isim + sıralı sayaç. Örnek: "Örnek Kişi 8" → `ornekkisi81`,
  ikinci "Örnek Kişi 8" → `ornekkisi82`.
- Sayaç: bu önekle başlayan (`prefix%`) mevcut kullanıcı adlarındaki en yüksek
  sayının +1'i; önek rol ayrımı taşımaz (öğrenci/veli aynı öneki paylaşırsa
  çakışma sayaca yansır).
- Üretilen ad zaten doluysa (örn. eşzamanlı iki kayıt) sayaç artırılarak
  yeniden denenir; `username` `UNIQUE` kısıtı bunu garanti eder.
- **Geriye dönük:** yalnızca yeni üretilen adları etkiler; sistemdeki mevcut
  `ogrenci1` / `veli3` gibi kullanıcı adlarına dokunulmaz.
- Admin, kayıt sonrası `username`'i isterse değiştirebilir (yine unique).

**Şifre:** Öğretmen kaydında olduğu gibi, öğrenci/veli için de **admin
oluşturma anında bir başlangıç şifresi girer.** Şifremi unuttum akışı yoktur
(e-posta/SMS kanalı yok) — unutulursa admin `reset-password` ile yeni şifre
belirler; bu işlem `token_version`'ı artırır (eski oturumlar biter).

**İlk girişte zorunlu şifre değiştirme (yalnızca öğrenci/veli):**
- Admin'in belirlediği başlangıç şifresi **geçicidir**; öğrenci/veli ilk
  girişte kendi şifresini belirlemek zorundadır. `teacher`/`admin` bu akışın
  tamamen dışındadır.
- `users.must_change_password` bayrağı `1` olur: öğrenci/veli oluşturulduğunda
  (tekli + CSV toplu) ve öğrenci/veli `reset-password` ile sıfırlandığında.
  Öğretmen oluşturma/reset bu bayrağa hiç dokunmaz (`0` kalır).
- `POST /auth/login` ve `GET /auth/me` yanıtı `user.must_change_password`
  taşır.
- **Kullanıcının kendi seçtiği yeni şifre kuralı:** en az 8 karakter, en az bir
  büyük harf, bir küçük harf ve bir rakam. (Admin'in girdiği geçici başlangıç
  şifresi ve CSV ortak şifresi bu katı kurala tabi değildir — eski min 6 kuralı
  geçerlidir.)
- `POST /auth/change-password` (korumalı) mevcut şifreyi doğrular, yeni şifreyi
  politikaya göre denetler; başarıda `password_hash` güncellenir,
  `must_change_password = 0` yapılır ve `token_version` artırılır. Artan
  `token_version` eski token'ı öldürür; yanıt **yeni bir token** döner, böylece
  kullanıcı yeniden giriş yapmadan devam eder.
- **Backend zorlaması (atlanamaz):** `must_change_password = 1` iken `auth`
  middleware yalnızca `/auth/me` ve `/auth/change-password` uçlarına izin verir;
  diğer tüm korumalı uçlar `403 FORBIDDEN` döner. Frontend yönlendirmesi yalnızca
  UX'tir, asıl güvence budur.

**JWT ömrü (rol bazlı):** admin/öğretmen 7 gün, veli/öğrenci 30 gün.
**Login brute-force koruması:** girişte 15 dakikada 5 başarısız denemeden
sonra `429 RATE_LIMITED` döner (IP + hesap bazlı).

---

## 3. Veri modeli

**Veritabanı: SQLite** (`node:sqlite` — `DatabaseSync`, ham SQL). ORM yoktur;
şema ve sorgular SQL olarak yazılır. Postgres'e geçiş yolu §7'de.

### 3.1 Temel tablolar

> **Not:** Aşağıdaki DDL migration #1'de birebir kullanılacak şekilde yazılmıştır.
> STRICT tablolarda `enum` tipi yoktur; sabit değer kümeleri `TEXT` + `CHECK`
> kısıtı ile zorlanır. `bool` → `INTEGER` (0/1), tarih ve zaman damgaları
> `TEXT` (ISO 8601), JSON alanları `TEXT` (uygulama tarafında parse edilir).
> Soft delete'li tablolarda `UNIQUE` kısıtı tablo içine yazılmaz; `WHERE
> deleted_at IS NULL` koşullu kısmi indeks kullanılır.

**`users`** — tüm roller tek tabloda
```sql
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  full_name            TEXT NOT NULL,
  full_name_normalized TEXT NOT NULL,   -- küçük harf + Türkçe karakter sadeleştirme
  username             TEXT,            -- veli/öğrenci giriş anahtarı; UNIQUE indeks aşağıda
  email                TEXT,            -- admin/öğretmen giriş anahtarı
  password_hash        TEXT NOT NULL,   -- tüm roller şifreyle girer
  role                 TEXT NOT NULL CHECK (role IN ('admin','teacher','guardian','student')),
  is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  token_version        INTEGER NOT NULL DEFAULT 1,  -- JWT iptali için
  must_change_password INTEGER NOT NULL DEFAULT 0
                         CHECK (must_change_password IN (0,1)),  -- migration #7
  deleted_at           TEXT,            -- ISO 8601; soft delete
  created_at           TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX idx_users_normalized ON users(full_name_normalized);
```
> `token_version`: `auth` middleware her istekte JWT payload'ındaki `tv` ile
> DB'deki değeri karşılaştırır; eşit değilse 401. Kullanıcı pasifleştirilince,
> silinince veya şifresi değişince `token_version` +1 yapılır. JWT payload:
> `{ id, role, teacher_id?, student_id?, guardian_id?, tv }`.
>
> `full_name_normalized` zorunlu: SQLite'ın `LIKE`'ı sadece ASCII için harf
> duyarsızdır. Yazma anında `toLocaleLowerCase('tr')` + aksan sadeleştirmesi,
> **yalnızca sunucuda** üretilir.

**`guardians`** — veli detayı (1 hesap = 1 veli, N öğrenci)
```sql
CREATE TABLE guardians (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  whatsapp_phone  TEXT NOT NULL,   -- WhatsApp gönderimi; sistemde tek telefon alanı
  phone_secondary TEXT,   -- ikinci ebeveyn, yalnızca bilgi amaçlı
  consent_at      TEXT,   -- KVKK açık rıza zamanı (ISO 8601)
  deleted_at      TEXT
) STRICT;

CREATE UNIQUE INDEX idx_guardians_user ON guardians(user_id) WHERE deleted_at IS NULL;
```
> `whatsapp_phone` zorunludur — `users.username` girişte kullanılır, telefon
> numarası taşımaz, bu yüzden fallback yoktur. Veli kaydı bu alan olmadan
> oluşturulamaz. Sistemde telefon numarasının tutulduğu **tek** yer burasıdır;
> `consent_at` ile korunur (§9).

**`students`**
```sql
CREATE TABLE students (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  guardian_id TEXT REFERENCES guardians(id),
  school_id   TEXT REFERENCES schools(id),   -- okul (migration #6; nullable)
  grade_level TEXT CHECK (grade_level IN
                 ('1','2','3','4','5','6','7','8','9','10','11','12','Hazırlık','Mezun')),
  deleted_at  TEXT
) STRICT;

CREATE UNIQUE INDEX idx_students_user ON students(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_guardian ON students(guardian_id);
```
> **Terim uyarısı:** `classes` tablosu zaten "dershane grubu" anlamında "sınıf"
> sözcüğünü kullanır. Bu yeni alanlar **asla "sınıf" olarak adlandırılmaz**:
> `school_id` → arayüzde **"Okul"**, `grade_level` → **"Sınıf seviyesi"**.
> Gelecekteki trend grafikleri (`GROUP BY school_id` / `GROUP BY grade_level`)
> için normalize edilmiş veri hazırlar; grafiklerin kendisi kapsam dışıdır.

**`schools`** — öğrencinin bağlı olduğu okul (migration #6; `classes`/`courses`
deseninin birebir kopyası)
```sql
CREATE TABLE schools (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  name_normalized  TEXT NOT NULL,   -- arama için; yazım anında normalizeTurkish
  deleted_at       TEXT
) STRICT;

CREATE UNIQUE INDEX idx_schools_name ON schools(name_normalized) WHERE deleted_at IS NULL;
```

**`academic_years`** — eğitim yılı (dönem/yarıyıl ayrımı YOK)
```sql
CREATE TABLE academic_years (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,    -- "2025-2026"
  start_date TEXT NOT NULL,    -- ISO 8601 tarih
  end_date   TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1))
) STRICT;
```

**`weeks`** — hafta numarası hesaplanmaz, tanımlanır
```sql
CREATE TABLE weeks (
  id               TEXT PRIMARY KEY,
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  week_no          INTEGER NOT NULL,   -- yıl içinde 1'den başlar
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  label            TEXT NOT NULL,      -- "17 - 23 Ocak" (Excel'deki gösterim)
  UNIQUE (academic_year_id, week_no)
) STRICT;

CREATE INDEX idx_weeks_dates ON weeks(academic_year_id, start_date);
```
> Tatil haftası kayıt olarak **açılmaz**; böylece `week_no - 1` her zaman bir
> önceki **ders yapılan** haftayı verir ve "verilmiş olan ödev" doğru çekilir.
> Bu tabloda soft delete yoktur, bu yüzden `UNIQUE` tablo içinde yazılabilir.

**`classes`**
```sql
CREATE TABLE classes (
  id               TEXT PRIMARY KEY,
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  name             TEXT NOT NULL,   -- "ÖKLİD", "PİSAGOR", "SEVA", ...
  name_normalized  TEXT NOT NULL,   -- arama için; yazım anında normalizeTurkish
  deleted_at       TEXT
) STRICT;

CREATE UNIQUE INDEX idx_classes_name
  ON classes(academic_year_id, name_normalized) WHERE deleted_at IS NULL;
```
> `name_normalized` migration #3 ile eklendi (Aşama 2b): isim aramaları ve
> çakışma kontrolü ASCII'ye indirgenmiş ad üzerinden yapılır (SQLite LIKE
> Türkçe karakterlerde harf duyarsız değildir). Yazma anında yalnızca sunucuda
> üretilir — `normalizeTurkish(name)`.

**`courses`**
```sql
CREATE TABLE courses (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,   -- "Matematik", "Geometri", ...
  name_normalized TEXT NOT NULL,   -- arama için; yazım anında normalizeTurkish
  deleted_at      TEXT
) STRICT;

CREATE UNIQUE INDEX idx_courses_name ON courses(name_normalized) WHERE deleted_at IS NULL;
```
> `name_normalized` migration #3 ile eklendi; `classes` notu aynen geçerlidir.

**`class_courses`** — sistemin merkez tablosu
```sql
CREATE TABLE class_courses (
  id          TEXT PRIMARY KEY,
  class_id    TEXT NOT NULL REFERENCES classes(id),
  course_id   TEXT NOT NULL REFERENCES courses(id),
  teacher_id  TEXT NOT NULL REFERENCES users(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=Pazartesi
  lesson_time TEXT,        -- "HH:mm", sıralama ve gösterim için
  deleted_at  TEXT
) STRICT;

CREATE UNIQUE INDEX idx_class_courses_pair
  ON class_courses(class_id, course_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_class_courses_teacher ON class_courses(teacher_id);
```
> `day_of_week` ödev son tarihinin otomatik hesaplanması için zorunludur
> (§5.2). Bir öğretmen birden fazla `class_course` kaydında yer alır
> (ortalama 10). Bir sınıfta ders sayısı sabit 4 DEĞİLDİR.

**`enrollments`** — öğrenci-sınıf, tarihli
```sql
CREATE TABLE enrollments (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  class_id   TEXT NOT NULL REFERENCES classes(id),
  start_date TEXT NOT NULL,
  end_date   TEXT            -- null = hâlâ bu sınıfta
) STRICT;

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_class ON enrollments(class_id, end_date);
```
> Aktif sınıf sorgusu: `end_date IS NULL OR end_date >= :date`.
> Sınıf değişikliği hafta ortasında yapılmaz; hafta sınırında yapılır.
> Eski kayıt kapatılır, yenisi açılır. **Geçmiş raporlar silinmez ve
> öğrencinin o tarihteki sınıfına bağlı kalır.**

### 3.2 Rapor tabloları

**`reports`** — bir sınıf-dersin bir haftalık raporu
```sql
CREATE TABLE reports (
  id                 TEXT PRIMARY KEY,
  class_course_id    TEXT NOT NULL REFERENCES class_courses(id),
  week_id            TEXT NOT NULL REFERENCES weeks(id),
  topic_covered      TEXT,            -- "İşlenen konu"
  prev_homework_id   TEXT REFERENCES homeworks(id),  -- "Verilmiş olan ödev" referansı
  prev_homework_text TEXT,            -- referans yoksa manuel giriş
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','completed','sent')),
  completed_at       TEXT,
  created_by         TEXT NOT NULL REFERENCES users(id),
  updated_at         TEXT NOT NULL,
  UNIQUE (class_course_id, week_id),
  CHECK (prev_homework_id IS NULL OR prev_homework_text IS NULL)
) STRICT;

CREATE INDEX idx_reports_week ON reports(week_id, status);
```
> Tablo düzeyindeki `CHECK`, "ya referans ya metin" kuralını veritabanı
> seviyesinde zorlar: `prev_homework_id` ve `prev_homework_text` **asla aynı
> anda dolu olmaz.** Sistem önceki haftanın ödevini bulursa `prev_homework_id`
> dolar; öğretmen metni elle değiştirirse `prev_homework_id` null olur ve yeni
> metin `prev_homework_text`'e yazılır.
>
> `reports` ve `homeworks` birbirine karşılıklı referans verir. `homeworks`
> tablosu `reports`'tan sonra oluşturulur; migration içinde sıralama buna
> göre yapılır (SQLite ileriye dönük FK referansına izin verir, kısıt yalnızca
> yazma anında kontrol edilir).

**`homeworks`** — "Yapılacak ödev". Ayrı varlık; metin alanı değil.
```sql
CREATE TABLE homeworks (
  id              TEXT PRIMARY KEY,
  report_id       TEXT NOT NULL REFERENCES reports(id),        -- hangi raporda verildi
  class_course_id TEXT NOT NULL REFERENCES class_courses(id),  -- denormalize
  week_id         TEXT NOT NULL REFERENCES weeks(id),
  description     TEXT NOT NULL,
  attachments     TEXT,        -- JSON dizi; öğretmenin yüklediği dosyalar
  due_date        TEXT NOT NULL   -- otomatik: bir sonraki ders günü
) STRICT;

CREATE UNIQUE INDEX idx_homeworks_report ON homeworks(report_id);
CREATE INDEX idx_homeworks_lookup ON homeworks(class_course_id, week_id);
```
> "Veren hoca" ve "verildiği hafta" ayrıca saklanmaz — `class_course_id`
> ve `week_id` üzerinden gelir.

**`report_entries`** — öğrenci satırları
```sql
CREATE TABLE report_entries (
  id             TEXT PRIMARY KEY,
  report_id      TEXT NOT NULL REFERENCES reports(id),
  student_id     TEXT NOT NULL REFERENCES students(id),
  attendance     TEXT NOT NULL DEFAULT 'present'
                   CHECK (attendance IN ('present','absent','late','excused')),
  homework_score INTEGER CHECK (homework_score BETWEEN 1 AND 10),
  interest_score INTEGER CHECK (interest_score BETWEEN 1 AND 10),
  teacher_note   TEXT,
  UNIQUE (report_id, student_id),
  CHECK (
    attendance IN ('absent','excused')
      AND homework_score IS NULL AND interest_score IS NULL
    OR attendance IN ('present','late')
  )
) STRICT;

CREATE INDEX idx_report_entries_student ON report_entries(student_id);
```
> Son `CHECK`, §4'teki "devamsız öğrencide puan `null` olur" kuralını
> veritabanı seviyesinde zorlar. `present`/`late` durumunda puanların dolu
> olması zorunluluğu **raporun tamamlanması** anında uygulama tarafında
> kontrol edilir (taslak halinde boş kalabilmelidir).

**`submissions`** — öğrenci ödev teslimi
```sql
CREATE TABLE submissions (
  id              TEXT PRIMARY KEY,
  homework_id     TEXT NOT NULL REFERENCES homeworks(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  note            TEXT,
  submitted_at    TEXT NOT NULL,
  is_late         INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0,1)),
  status          TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','reviewed')),
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  files_purged_at TEXT,            -- saklama süresi sonunda dosyalar silindi
  UNIQUE (homework_id, student_id)
) STRICT;

CREATE INDEX idx_submissions_student ON submissions(student_id);
```
> Yüklenen dosyaların meta bilgisi (`key`, `filename`, `size`, `mime`) `submissions`
> üzerinde JSON olarak tutulmaz; **`submission_files` tek doğru kaynaktır** (migration #4).

**`submission_files`** — teslim dosyaları (migration #4; Aşama 4)
```sql
CREATE TABLE submission_files (
  id            TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  key           TEXT NOT NULL,   -- storage anahtarı; GET /api/v1/files/:key
  filename      TEXT NOT NULL,   -- orijinal kullanıcı dosya adı
  size          INTEGER NOT NULL, -- bayt; küçültme sonrası gerçek boyut
  mime          TEXT NOT NULL,
  ext           TEXT NOT NULL,   -- key uzantısı (jpg, pdf, ...)
  UNIQUE (key)
) STRICT;

CREATE INDEX idx_submission_files_sub ON submission_files(submission_id);
```
> `key` küresel benzersizdir; dosya erişim rotası key → `submission_files` →
> `submissions` → `homeworks` zinciriyle sahiplik doğrular (spec.md §8).
> `files_purged_at` doluysa ilgili `submission_files` kayıtları kaldırılmıştır
> (saklama politikası §8).

### 3.3 Bildirim ve denetim

**`weekly_digests`** — veliye giden birleşik haftalık rapor
```sql
CREATE TABLE weekly_digests (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL REFERENCES students(id),
  week_id         TEXT NOT NULL REFERENCES weeks(id),
  guardian_id     TEXT NOT NULL REFERENCES guardians(id),
  token           TEXT NOT NULL,   -- crypto.randomBytes(32).base64url; UUID DEĞİL
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ready','sent')),
  send_count      INTEGER NOT NULL DEFAULT 0,  -- kaçıncı gönderim (ilk: 1)
  sent_at         TEXT,            -- son gönderim zamanı
  sent_by         TEXT REFERENCES users(id),
  snapshot        TEXT,            -- JSON: son gönderim anındaki rapor içeriği
  is_revoked      INTEGER NOT NULL DEFAULT 0 CHECK (is_revoked IN (0,1)),
  first_viewed_at TEXT,            -- velinin raporu ilk açtığı an (migration #6)
  last_viewed_at  TEXT,            -- son açtığı an; ayrı log tablosu YOK
  UNIQUE (student_id, week_id)
) STRICT;

CREATE UNIQUE INDEX idx_digests_token ON weekly_digests(token);
CREATE INDEX idx_digests_week ON weekly_digests(week_id, status);
```
> `snapshot` daima **son gönderimin** içeriğini tutar (üzerine yazılır).
> Gönderim geçmişi `audit_logs`'ta saklanır (`digest.send` / `digest.resend`).
>
> `is_revoked = 1` olduğunda `/r/{token}` sayfası `410 Gone` + "Bu rapor
> artık geçerli değil" mesajı döner. İptal edilen token kalıcı olarak ölüdür;
> yeniden gönderim **yeni bir token** üretir (`token` üzerine yazılır,
> `is_revoked` 0'a döner, `send_count` artar).

**`audit_logs`**
```sql
CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id),
  action      TEXT NOT NULL,   -- 'report.update', 'digest.send', ...
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  diff        TEXT,            -- JSON
  created_at  TEXT NOT NULL
) STRICT;

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
```
---

## 4. Puanlama

`homework_score` ve `interest_score` → **1–10 arası tam sayı.** Ölçeğin
yorumu öğretmene bırakılır; sistem çapa/etiket dayatmaz.

**Kurallar**
- `attendance = 'absent'` veya `'excused'` ise her iki puan da `null` olur ve
  UI puan alanlarını disable eder. Bu kural `report_entries` üzerindeki tablo
  düzeyi `CHECK` kısıtıyla veritabanı seviyesinde de zorlanır (§3.2).
- Ortalama hesaplarında `null` satırlar paydaya dahil edilmez.
- Puanlar öğrenciye hiçbir ekranda gösterilmez.

---

## 5. Akışlar

### 5.1 Öğretmenin haftalık rapor doldurması

1. Öğretmen giriş yapar → "Bu hafta doldurulacaklar". Öğretmen başına ~10
   kayıt olacağı için bu liste `day_of_week` + `lesson_time` sırasına göre
   dizilir; tamamlananlar listeden düşer, ders günü geçtiği halde `draft`
   olanlar üstte ve vurgulu görünür.
2. Bir kaydı açar. Sistem otomatik doldurur:
   - **Verilmiş olan ödev:** `week_no - 1` için aynı `class_course_id`'nin
     raporundaki `homeworks.description`. Bulunamazsa (yılın ilk haftası,
     geçen hafta rapor girilmemiş vb.) alan **boş ve serbest metin** olarak
     açılır → `prev_homework_text`.
   - **Öğrenci listesi:** o tarihte sınıfta aktif `enrollments`.
   - **Teslim durumu:** her öğrenci satırında geçen haftanın ödevine
     `submission` var mı rozeti + tıklayınca dosyaları önizleme.
3. Öğretmen doldurur: işlenen konu, yapılacak ödev, ve her satır için
   devamsızlık + 2 puan + not.
4. Otomatik `draft` olarak kaydedilir (debounce ~2sn).
5. "Tamamla" → `status = 'completed'`, `completed_at` set edilir.
   Doğrulama: devamsız olmayan her öğrenci için iki puan da dolu olmalı.

### 5.2 Ödev son tarihi

`homeworks.due_date`, ödevin verildiği tarihten sonraki **ilk aynı ders günü**
olarak otomatik hesaplanır:

```
due_date = ilk tarih > report.week.start_date
           öyle ki weekday(tarih) == class_course.day_of_week
           ve o tarih bir sonraki weeks kaydının aralığına düşüyor
```

Yani ödev, bir sonraki ders gününe kadar teslim edilmelidir. Arada tatil
haftası varsa (o hafta için `weeks` kaydı açılmadığından) son tarih
kendiliğinden bir sonraki ders yapılan haftaya kayar — ek bir kural gerekmez.

**Sınır durumu — eğitim yılının son haftası.** Sonraki `weeks` kaydı yoksa
`calculateDueDate()` `null` döner. Bu durumda:
- `homeworks.due_date` alanı zorunlu olduğundan, öğretmen tarihi **elle
  girmeden** raporu tamamlayamaz.
- Form üstünde "Yılın son haftası — teslim tarihini siz belirleyin" uyarısı
  gösterilir ve tarih alanı boş açılır.

Öğretmen hesaplanan tarihi her durumda elle değiştirebilir.

### 5.3 Öğrencinin ödev yüklemesi

1. Öğrenci giriş yapar → **"Ödevlerim"**. Ekranda yalnızca şunlar vardır:
   ders adı, öğretmen adı, hafta, ödev açıklaması, son tarih ve teslim durumu
   (yüklendi / yüklenmedi / geç yüklendi). **Puan, öğretmen notu, derse ilgi
   ve rapor içeriği bu ekranda yoktur.**
2. Yükleme: çoklu dosya, izin verilen tipler `jpg/jpeg/png/heic/pdf`,
   dosya başına max 10 MB, teslim başına max 10 dosya.
3. **Görsel küçültme zorunludur** — yüklenen görseller uzun kenarı max 2000px
   olacak şekilde yeniden boyutlandırılır ve JPEG q80 olarak saklanır.
   Ham telefon fotoğrafı olduğu gibi saklanmaz (§8 hacim hesabı).
4. Son tarih geçtikten sonra da yükleyebilir; `is_late = true` işaretlenir ve
   öğretmen ekranında "geç teslim" rozeti çıkar.
5. Geçmiş ödevler listesi: hangi ödevi yüklemiş, hangisini yüklememiş.

### 5.4 Veliye haftalık gönderim (birleştirilmiş)

Öğretmenler ayrı ayrı bildirim **göndermez.** Akış:

**Digest oluşturma ve tetikleme:**
- İlk rapor `completed` yapıldığında o sınıfın o haftadaki aktif öğrencileri
  için `INSERT OR IGNORE INTO weekly_digests (...) VALUES (... 'pending')` çalışır.
- Her rapor tamamlandığında sunucu, o `class_course`'un haftasındaki **tüm**
  raporları kontrol eder. Hepsi `completed`'sa aynı kayıtlar `status = 'ready'`
  yapılır. Admin ekranı açıldığında yeniden hesaplama yapılmaz.

1. Admin "Haftalık gönderim" ekranı `ready` **ve** `pending` kayıtların ikisini
   listeler:
   - `ready` → "Tüm dersler tamam", gönder butonu aktif.
   - `pending` → "4 dersten 3'ü girildi", gönder butonu aktif ama uyarılı;
     eksik ders sayısı satırda gösterilir.
2. Sınıf filtresiyle çalışır (200 öğrenci tek listede gösterilmez).
3. **Gönderim öncesi admin düzenleme:** gönderilmemiş (`pending`/`ready`, iptal
   edilmemiş) digest önizlemesinde, `completed` durumdaki her ders kartında
   **"Düzenle"** bağlantısı vardır. Admin mevcut `ReportEntryPage`'e gider
   (`/teacher/reports/{classCourseId}/{weekId}?returnTo=/admin/digests`), raporu
   düzenler; **status `completed` kalır** (henüz `sent` olmaz) ve her düzenleme
   `audit_logs`'a `report.update` olarak yazılır (spec §2, `by_role`). Öğretmene
   bildirim/gösterge göstermez — sessiz değişiklik. `missing` derslerde ve
   `sent`/iptal digest'lerde "Düzenle" **görünmez**. Öğretmen ekranındaki dönüş
   butonu admin için "Gönderim ekranına dön" olur; dönüşte liste tazelenir.
4. Admin tek tek veya sınıf bazında toplu olarak "Gönder"e basar.
5. Sistem `snapshot`'ı yazar, **yeni `token` üretir**, `status = 'sent'` yapar,
   `send_count` artırır ve `wa.me` linkini açar:
   ```
   https://wa.me/<numara>?text=<urlencoded mesaj>
   ```
   Numara: `guardians.whatsapp_phone` (zorunlu alan, fallback yok — §2.1/§3.1).
6. Mesaj içeriği kısa tutulur, tam rapor linkten okunur:
   ```
   Sayın {veli adı}, {öğrenci adı} için {hafta etiketi} haftalık
   ödev takip raporu hazır:
   {BASE_URL}/r/{token}
   ```
7. `/r/{token}` sayfası: giriş gerektirmez, salt okunur, o haftanın tüm
   derslerinin raporunu tek sayfada gösterir.

> Toplu gönderimde `wa.me` linkleri tek tek açılır (tarayıcı çoklu sekme
> açmayı engelleyebilir). Bu yüzden toplu mod, sıradaki veliyi gösteren bir
> "gönder ve sonraki" akışı olarak tasarlanır — koordinatör listeyi tek
> tuşla ilerletir.
>
> **Popup engelleme deseni (zorunlu):** `window.open` yalnızca doğrudan
> kullanıcı jesti içinde çağrıldığında izin verilir; `send` yanıtı gelince
> açmak engellenir. Desen:
> 1. "Gönder" tıklandığı anda **senkron boş sekme** açılır:
>    `const w = window.open('', '_blank')`.
> 2. `send` yanıtı dönünce `w.location.href = waMeUrl` atanır. Yanıt çok
>    hızlıysa sekmede kısa bir "yükleniyor" anı görülebilir — bilinçlidir.
> 3. Hata (örn. 409 KVKK) gelirse sekme `w.close()` ile kapatılır, hata
>    satırda gösterilir.
> 4. `w` null ise (popup engellenmiş) sekme açılmaz; bunun yerine kullanıcıya
>    `wa.me` linki kopyalanabilir buton olarak sunulur.

**Eksik rapor durumu:** Bir hafta içinde 4 dersten 3'ü doldurulmuşsa admin
yine de gönderebilir; digest yalnızca dolu dersleri içerir ve eksik ders
"Bu hafta rapor girilmedi" olarak görünür.

**Gönderim öncesi kontrol (KVKK — spec §9):** `send` çağrısı iki ayrı ön
kontrol yapar, ikisi de `409 CONFLICT` döner:
- `guardians.whatsapp_phone` boş/null ise → "Veli için WhatsApp numarası
  tanımlı değil."
- `guardians.consent_at` null ise → "Velinin KVKK açık rızası alınmamış."
İki kontrol farklı hata mesajı üretir; karıştırılmaz.

**`reports.status = 'sent'` kaskadı (zorunlu):** Bir digest `sent` yapıldığı
anda, aynı transaction içinde o öğrencinin **sınıfı + haftasındaki tüm
digest'ler** `sent` olduysa, o sınıf+haftanın `status = 'completed'` raporları
`status = 'sent'` yapılır. Bu kaskad **gönderimden ayrı bir istek değildir**;
`send` handler'ının kendi transaction'ında çalışır. Sonuç: veliye ulaşmış bir
haftanın raporları §2'deki "sent → öğretmen düzenleyemez (403)" kuralına
fiilen girer. Eksik derslerin raporları `completed` kalmaya devam eder
(gönderilmediği için).

**Yeniden gönderim:** Öğretmen raporu düzeltirse velinin linki değişmez.
Admin dilerse yeniden gönderir:
- Mevcut `weekly_digests` kaydı güncellenir: `snapshot` üzerine yazılır,
  `send_count` +1, `sent_at` / `sent_by` güncellenir.
- Her gönderim `audit_logs`'a yazılır: ilk gönderim `digest.send`,
  sonrakiler `digest.resend`; `diff` alanına o anki snapshot konur.

**Görüntüleme takibi (migration #6):** `weekly_digests.first_viewed_at` +
`last_viewed_at` — ayrı log tablosu yoktur (veri minimizasyonu). İki görünümde
güncellenir: `/r/{token}` public görünümü ve `/guardian/reports/:id` girişli
görünümü. Admin gönderim listesinde gösterilir ("Görüntülendi: 3 Şub" /
"Henüz görüntülenmedi").
- **Bot önizleme atlaması:** WhatsApp mesajı gönderilir gönderilmez tarayıcı/
  uygulama linki otomatik önizleyebilir; bu yanlış "görüntülendi" kaydı üretir.
  `markDigestViewed` yazma kararında `User-Agent`'ta bilinen link-önizleme botu
  imzaları (`whatsapp`, `facebookexternalhit`, `telegrambot`, `slackbot`,
  `linkedinbot`, `twitterbot`, `discordbot`, `skypeuripreview` vb.) varsa yazma
  **atlanır** — sayfa yine 200 döner, yalnızca sayaç/zaman damgası güncellenmez.

**Token iptali:**
- Admin, haftalık gönderim listesinden bir digest'i iptal edebilir.
- `is_revoked = true` yapılır; `audit_logs`'a `digest.revoke` yazılır.
- `/r/{token}` sayfası `410 Gone` HTTP kodu + "Bu rapor artık geçerli
  değil" mesajı döner.
- **İptal edilen token dizesi kalıcı olarak ölüdür.** Yeni içerikle göndermek
  için yeniden gönderim yapılır: **yeni bir `token` üretilir** (eski dizenin
  üzerine yazılır), `snapshot` güncellenir, `send_count` artar ve
  `is_revoked` 0'a döner.
- `is_revoked` token'ın değil **satırın** alanıdır (`UNIQUE (student_id,
  week_id)` — öğrenci-hafta başına tek satır). 1'de bırakılırsa yeni token da
  aynı satırı bulup 410 alır; bu yüzden yeniden gönderimde 0'a çekilmesi
  zorunludur. Eski token'ın ölü kalmasını sağlayan şey `is_revoked` değil,
  `token` sütununun üzerine yazılmasıdır — eski dize artık veritabanında yok.
- **Bilinmeyen token:** Veritabanında karşılığı olmayan her token için de
  `410 Gone` ve aynı mesaj döner (`404` değil) — böylece bir token'ın hiç var
  olup olmadığı dışarıya sızmaz.

### 5.5 Admin — eksik rapor görünümü

Haftada ~100 rapor var; 25×4'lük bir matris tek ekranda okunmaz. Bu yüzden
**varsayılan görünüm özet + eksik listesidir:**

- Üstte tek satır özet: "Bu hafta 100 rapordan 87'si tamamlandı."
- Altında **yalnızca eksik olanların listesi**: sınıf, ders, öğretmen,
  ders günü, durum (`draft` / hiç açılmamış). Ders günü geçmiş olanlar
  vurgulu ve üstte.
- Öğretmene göre gruplama seçeneği ("Kim geride kalmış?").
- Tam matris (satır = sınıf, sütun = ders) ikincil bir sekmede, yatay
  kaydırmalı olarak bulunur.
- **"Tüm raporlar" görünümü (admin'in "tüm raporları görme" hakkının
  karşılığı):** eksik listesinin yanında aynı sayfada ikincil bir sekme.
  Durum filtresi (`draft` / `completed` / `sent`) ve sınıf/hafta filtresiyle
  raporlar listelenir; satıra tıklandığında rapor **salt-okunur** açılır
  (üst alanlar + devamsızlık/puan/not tablosu; hiçbir düzenleme UI'ı yok).
  Bu görünüm canlı rapor verisini gösterir — digest `snapshot`'ı değil.

### 5.6 Admin — CSV ile toplu öğrenci içe aktarma

Süreç hâlâ Excel/CSV tablosunda yürüdüğü için, admin öğrenci listesini tek tek
formla değil **tek bir CSV dosyasıyla** kurabilir. Biçim **CSV'dir** (gerçek
`.xlsx` değil — ek kütüphane gerekmez, Excel'de sorunsuz açılır/düzenlenir).

**Şablon:** `GET /admin/students/import/template` doğru sütun başlıklarıyla boş
bir örnek CSV döner (`text/csv; charset=utf-8`, UTF-8 BOM'lu). Admin panelde
"Şablon indir" butonu bulunur.

**Sütunlar** (mevcut öğrenci/veli oluşturma formundan türetilir):

| Sütun | Karşılık | Zorunlu |
|---|---|---|
| `ogrenci_adi` | `users.full_name` (öğrenci) | ✓ |
| `dershane_sinifi` | aktif eğitim yılındaki `classes.name` (`enrollments`) | ✓ |
| `veli_adi` | `users.full_name` (veli) | ✓ |
| `veli_whatsapp` | `guardians.whatsapp_phone` (eşleştirme anahtarı) | ✓ |
| `okul_adi` | `schools.name` (isimle eşleşir, yoksa oluşturulur) | – |
| `sinif_seviyesi` | `students.grade_level` (CHECK kümesi) | – |

> **Kullanıcı adı CSV'de yer almaz.** Öğrenci ve veli `username`'i her zaman
> isim tabanlı otomatik üretilir (`normalizeTurkish(full_name)` + sayaç — §2.1);
> admin elle giremez. `guardians.phone_secondary` de toplu akışın parçası
> değildir; admin isterse Veliler ekranından elle girer.

**Şifre:** tek bir **ortak başlangıç şifresi** admin tarafından import ekranında
girilir ve o işlemde oluşturulan **tüm** yeni öğrenci + velilere uygulanır; CSV'de
şifre sütunu yoktur. Hash bir kez hesaplanır (spec §2.1 otomatik `username` +
admin'in girdiği başlangıç şifresi kuralının toplu hali).

**Uçlar:**
- `POST /admin/students/import?dry_run=true` — dosyayı doğrular, **hiçbir şey
  yazmaz**; özet + hata/uyarı listesi döner.
- `POST /admin/students/import?dry_run=false` — dosyayı yeniden doğrular ve
  **tek transaction'da** yazar (`BEGIN/COMMIT`, hata → `ROLLBACK`). Satır hatası
  varsa **400 `VALIDATION_ERROR`** döner (`error.details.errors` satır listesi)
  ve hiçbir kayıt oluşmaz.
- Dosya `multipart/form-data` (`multer` memory, `text/csv` / `.csv`; max ~2 MB,
  max 500 satır). Ortak şifre body'de `password` alanındadır.

**Eşleştirme kuralları:**
- **Dershane sınıfı:** aktif eğitim yılındaki `classes.name_normalized` ile
  eşleşir. Bulunamazsa **satır hatası** — sınıf otomatik oluşturulmaz (okuldan
  farklı olarak; sınıflar admin tarafından önceden kurulur).
- **Okul:** `schools.name_normalized` ile eşleşir; büyük/küçük harf ve Türkçe
  karakter farkı aynı okulu ikiye bölmez. Eşleşme yoksa yeni okul oluşturulur.
- **Veli:** normalize edilmiş `whatsapp_phone` ile eşleştirilir. (a) mevcut aktif
  veli, (b) dosya içinde önceki satır varsa **aynı veli** (kardeş senaryosu) —
  her satırda yeni veli açılmaz. Eşleşme yoksa yeni veli oluşturulur. Telefon
  eşleşip ad farklıysa mevcut ad korunur ve satır **uyarı** olarak işaretlenir
  (hata değil).
- **Soft delete:** yalnızca `deleted_at IS NULL` kayıtlarla eşleşir; silinmiş
  kayıt geri getirilmez, yeni kayıt açılır.
- **`username`:** her zaman isim tabanlı otomatik üretilir (`nextUsername`,
  §2.1); dosyada bu sütun yoktur.

**Hepsi ya da hiçbiri:** tek satır bile hatalıysa **hiçbir kayıt oluşturulmaz**;
admin dosyayı düzeltip yeniden yükler. Kısmi kabul bu sürümde yoktur. Başarılı
içe aktarma `audit_logs`'a `student.import` olarak yazılır (özet sayaçlar).

### 5.7 Admin — filtreli CSV dışa aktarma

Admin'in "Tüm raporlar", "Öğrenciler" ve "Veliler" ekranlarındaki **mevcut
filtre/arama sonucu**, ekranda görünen sütunlarla CSV olarak indirilebilir.
Biçim yine UTF-8 BOM'lu CSV'dir (Türkçe karakterler Excel'de doğru açılır).

- `GET /admin/reports/export` — `status`, `class_id`, `week_id` filtreleri
  (`GET /teacher/reports` ile aynı WHERE mantığı), sayfalama uygulanmaz: tüm
  eşleşen satırlar iner.
- `GET /admin/students/export` — `q` (ad/veli normalize arama) + `classId`.
- `GET /admin/guardians/export` — `q`.
- Yanıt `text/csv; charset=utf-8` + `Content-Disposition: attachment`.
- Sütunlar ekranla birebir:
  - **Raporlar:** hafta (no + etiket), sınıf, ders, ders günü/saat, öğrenci
    sayısı, durum, tamamlanma tarihi.
  - **Öğrenciler:** ad, veli, sınıf, okul, sınıf seviyesi, kullanıcı adı.
  - **Veliler:** ad, kullanıcı adı, WhatsApp, çocuk sayısı, KVKK onayı.

---

## 6. Ekranlar

**Admin**
- Dashboard (panel): haftalık özet + eksik rapor listesi (sayfalı), bekleyen
  gönderimler, **tüm raporlar görünümü** (durum/sınıf/hafta filtresi + satıra
  tıklayınca salt-okunur içerik — §5.5)
- Eğitim yılı / hafta yönetimi
- Sınıf, ders, öğretmen ataması (`class_courses`, ders günü dahil) — **tüm
  atamalar tek listede (sınıf filtresiz)**, isim araması ile; **iki atama
  seçip "Yer değiştir"** ile öğretmenler sınıflar arası takas edilir
  (örn. ÖKLİD Cebir ↔ PİSAGOR Cebir); takas tek transaction + audit
- **Öğretmenin tüm atamalarını devretme** (ayrılan öğretmen akışı): tek hedef
  öğretmene toplu devir, tek transaction + audit; devir tamamlanınca öğretmen
  silinebilir (409 → 204)
- Öğrenci ve veli yönetimi, sınıf atama (enrollment) — 200 kayıt olduğu için
  arama (`full_name_normalized`) ve sayfalama zorunlu; öğrenci listesinde
  **"CSV ile toplu ekle"** (şablon + önizleme + hepsi-ya-da-hiçbiri) ve
  **"CSV indir"**; veli listesinde **"CSV indir"** (§5.6/§5.7)
- Raporlar / öğrenciler / veliler listelerinde filtreli **"CSV indir"**
  (ekranda görünen sütunlar + aktif filtre, §5.7)
- **Okul yönetimi** (CRUD; öğrenci formunda **"Okul"** seçici + hızlı ekle ve
  **"Sınıf seviyesi"** dropdown — `classes` ile karışmaz)
- Haftalık gönderim ekranı (sınıf filtreli; digest görüntülenme bilgisi;
  önizlemede gönderilmemiş kayıtlarda `completed` ders başına **"Düzenle"** —
  §5.4 madde 3)
- **Riskli öğrenci listesi** (panel sekmesi): son 3 hafta, üç kriter — herhangi
  biri tetiklerse riskli (OR); nedenler ayrı rozet ("Düşük ortalama" /
  "Teslim etmeme" / "Devamsızlık"). Tanım: ortalama(ödev+ilgi) ≤ 4; verilen
  ödevlerden ≥ 2'si teslim edilmemiş (ardışık şart yok); ARDIŞIK ≥ 2 hafta
  `absent` (`excused` sayılmaz). Eşikler kod içinde sabit (backend `constants.ts`
  — tek dosya; ileride ayarlanabilir yapılacaksa yalnızca o dosya değişir)
- **Yedek indir** (db:backup CLI'ını tetikler, tek .zip indirir)
- Audit log

**Öğretmen**
- Bu hafta doldurulacaklar (~10 kayıt, ders gününe göre sıralı) — günü geçmiş
  taslaklar üstte ve belirgin; **iç hatırlatma banner'ı**: "Bu hafta N raporunuz
  gecikti" (yalnızca uygulama içi — WhatsApp/SMS yok; arka plan mekanizması
  gerekmez, mevcut `is_overdue` verisinden türetilir)
- **Toplu rapor giriş ekranı** (§6.1)
- Ödev teslim kontrol ekranı (bir ödevin tüm teslimlerini sırayla gezme)
- Geçmiş raporlarım

**Veli**
- Öğrenci seçimi (birden fazla çocuk varsa)
- **Öğrencinin sistemdeki tüm gönderilmiş raporları** — sınıf değişmiş olsa
  bile geçmiş raporlar listede kalır, hafta bazında kronolojik, hangi sınıftan
  geldiği bilgisiyle birlikte; **hafta** (görece etiket) ve **ders** bazlı filtre
- Rapor detayı + ödev teslim geçmişi
- Basit trend grafiği: hafta bazında ödev/ilgi ortalaması

**Öğrenci**
- Bu haftanın ödevleri + yükleme
- Geçmiş ödevler ve teslim durumu
- (Puan, not, rapor ekranı YOK)

### 6.1 Toplu rapor giriş ekranı — detay

Projenin benimsenmesi bu ekrana bağlı. Gereksinimler:

- Tek sayfada tablo: satır = öğrenci (~8), sütunlar = devamsızlık, ödev puanı,
  ilgi puanı, not.
- Üstte sınıf düzeyi alanları: verilmiş ödev (otomatik dolu, düzenlenebilir),
  işlenen konu, yapılacak ödev, hesaplanmış son tarih.
- Klavye navigasyonu: `Tab` / `Enter` ile aşağı satır, ok tuşlarıyla hücre.
- Puan girişi tek tıkla: 1–10 arası butonlar veya doğrudan rakam tuşu.
- Not alanı satır içinde genişleyen textarea, zorunlu değil.
- Devamsızlık seçilince o satırın puan hücreleri otomatik disable + null.
- Toplu doldurma kısayolu ("tümünü X yap"), sonra tek tek düzeltme.
- Otomatik kaydetme + "kaydedildi" göstergesi.
- **Mobil:** tabloyu yatay kaydırmaya zorlama; dar ekranda öğrenci başına
  kart görünümüne geç, kartlar arası ileri/geri.

---

## 7. Teknik yığın

| Katman | Seçim |
|---|---|
| Frontend | React 18 + TypeScript + Vite (SPA) |
| Routing | react-router-dom |
| UI | Tailwind + shadcn/ui |
| Backend | Node.js + Express (REST API) |
| DB | SQLite (`node:sqlite` — ORM yok, ham SQL) |
| Auth | JWT (jsonwebtoken) — admin/öğretmen: e-posta+şifre; veli/öğrenci: username+şifre |
| Doğrulama | Zod |
| Dosya (geliştirme) | Yerel disk, `backend/uploads` |
| Dosya (üretim) | Cloudflare R2, presigned upload |
| Görsel işleme | sharp + heic-convert (HEIC→JPEG, yeniden boyutlandırma, JPEG q80) |
| Paket yöneticisi | npm |
| Dağıtım | Tek sunucu: Express statik + API (SPA fallback) |

### 7.1 SQLite kuralları

Bu ölçekte (~32.000 satır/yıl, ~100 MB) SQLite fazlasıyla yeterlidir.

1. **ORM kullanılmaz.** Tüm erişim `node:sqlite` (`DatabaseSync`) üzerinden;
   sorgular `db.prepare().run()/get()/all()` deseniyle yazılır. Parametreler
   her zaman `?` placeholder ile bağlanır.
2. **`PRAGMA foreign_keys = ON`** — bağlantı kurulduğunda WAL'dan hemen sonra
   çalıştırılır. Yabancı anahtar kısıtları varsayılan olarak kapalıdır.
3. **`PRAGMA journal_mode = WAL`** — eşzamanlı okuma/yazma için.
4. **`STRICT` tablolar** — tüm `CREATE TABLE` ifadeleri `STRICT` ile biter.
   ORM yokken tip güvenliğini DB seviyesinde sağlar. Tip eşlemesi:
   `uuid/text → TEXT`, `bool → INTEGER (0/1)`, `timestamp/date/json → TEXT`,
   `int → INTEGER`. **STRICT tablolarda `enum` tipi yoktur:** sabit değer
   kümeleri `TEXT NOT NULL CHECK (x IN (...))` ile zorlanır. Tam DDL §3'tedir
   ve migration #1'de birebir kullanılır.
5. **Kısmi indeks** — soft delete'li tablolarda `UNIQUE` kısıtı tablo içine
   yazılmaz; bunun yerine `WHERE deleted_at IS NULL` koşullu ayrı indeks oluşturulur.
6. **Migration runner** (`PRAGMA user_version` tabanlı, sıralı liste):
   - Her migration bir fonksiyon; `BEGIN / COMMIT / ROLLBACK` ile sarılır.
   - Hata olursa uygulama açılmaz (yutulmaz).
   - **Migration yalnızca şema içerir.** Seed verisi migration'a konmaz; ayrı
     bir CLI script'idir (`npm run db:seed`).
   - **Dondurma kuralı:** Aşama 1 bitmeden #1 numaralı migration düzenlenebilir,
     DB silinip yeniden kurulur. Aşama 1 commit'lendiği anda o migration dondurulur;
     sonraki değişiklikler yeni numaralı migration olarak eklenir.
7. **`mode: 'insensitive'` kullanılmaz** — SQLite desteklemiyor. İsim aramaları
   `full_name_normalized` üzerinden yapılır.
8. **Sunucusuz ortama dağıtılamaz** (Vercel vb.). Dağıtım hedefi VPS'tir.
9. pg-boss kullanılmaz. Zamanlanmış işler sistem cron'u + `X-Cron-Secret` ile
   korunan iç endpoint ile tetiklenir (Aşama 6).
10. **`DatabaseSync` senkrondur** — event loop'u bloklar. Transaction'lar tek
    bir istek kapsamında ve kısa tutulur. Seed, temizlik ve toplu işlemler
    sunucu içinden değil, **ayrı CLI script'i** olarak çalıştırılır.

### 7.2 Genel notlar

- Zaman dilimi: `Europe/Istanbul`. Gün hesapları (`day_of_week`, `due_date`)
  yerel takvime göre yapılır; UTC üzerinden gün çıkarımı yapılmaz.
- Yetki kontrolü `auth` ve `adminOnly` middleware'lerinde toplanır; JWT
  payload'ındaki role göre erişim verilir (bkz. §2 yetki tablosu).
- Silme işlemleri soft delete; rapor ve teslim kayıtları fiziksel silinmez.

**Silme stratejisi — üç farklı mekanizma (bilinçli):**
1. **`deleted_at` soft delete** (`users`, `guardians`, `students`, `classes`,
   `courses`, `class_courses`, `schools`): kayıt fiziksel silinmez,
   `WHERE deleted_at IS NULL` ile gizlenir. UNIQUE kısıtları kısmi indekste
   olduğundan aynı ad yeniden eklenebilir; silme idempotenttir.
2. **Tarihli geçerlilik** (`enrollments.start_date` / `end_date`): geçmişin
   tarihsel doğruluğu korunur — sınıf değişikliği yeni satırla açılır, eski
   raporlar öğrencinin o tarihteki sınıfına bağlı kalır.
3. **Korumalı / immutable:** `weeks` rapor referansları olduğu için fiziksel
   silinmez (raporlu hafta silme girişimi 409); `weekly_digests` iptal için
   `is_revoked` kullanır (token ömrü §5.4); `reports`, `homeworks`,
   `report_entries`, `submissions`, `audit_logs` hiç silinmez — denetim izi ve
   saklama politikası (§8) bunlara dayanır.

---

## 8. Dosya depolama ve saklama

**Hacim tahmini:** haftada ~800 teslim × ~3 dosya × ~500 KB (küçültülmüş)
≈ **1,2 GB/hafta, ~50 GB/yıl.** Küçültme yapılmazsa bu rakam 8 katına çıkar.
Bu yüzden §5.3'teki yeniden boyutlandırma opsiyonel değildir.

**Sonuçlar**
- Geliştirmede yerel disk yeterli. **Üretimde Cloudflare R2 kullanılır**;
  50 GB VPS diskinde biriktirilmez.
- Storage işlemleri `backend/src/services/storage.ts` modülünde toplanır
  (multer memory → heic-convert (gerekiyorsa) → sharp → diske yaz). R2'ye
  geçiş Aşama 6'da bu modülün içi değiştirilerek yapılır.
  Modül: dosya yolu/key üretimi ve meta bilgisi (key, filename, size, mime).
- **Dosya erişimi** (Aşama 4'ten itibaren): `express.static` kullanılmaz.
  `GET /api/v1/files/:key` rotası `auth` middleware'i + yetki kontrolü içerir
  (öğrenci: kendi teslimi; öğretmen: kendi ödevinin teslimi; veli: çocuğununki;
  admin: hepsi). Yerel modda `res.sendFile()`, R2 modunda imzalı URL'ye 302.
- Bucket public değildir.

**Saklama politikası**
- Ödev teslim **dosyaları**: 1 yıl sonra silinir, `files_purged_at` işaretlenir.
  Teslim kaydının kendisi (kim ne zaman yükledi) kalır.
- Rapor kayıtları (puanlar, notlar, digest snapshot'ları): eğitim yılı
  bitiminden itibaren 2 yıl, sonra anonimleştirilir.
- Silme işi Faz 6'da otomatikleştirilir; öncesinde manuel bir bakım komutu
  yeterlidir.

---

## 9. KVKK ve gizlilik

- Veli kaydında açık rıza zamanı (`consent_at`) tutulur; rıza alınmadan
  WhatsApp gönderimi yapılmaz.
- **Telefon numarası yalnızca `guardians.whatsapp_phone`'da tutulur** —
  amacı (WhatsApp bildirimi) açık, rızaya bağlı ve süre sınırlıdır. Öğretmen
  ve öğrenci kayıtlarında telefon numarası hiç tutulmaz; giriş `username`
  iledir (§2.1). Bu, veri minimizasyonu ilkesinin doğrudan uygulamasıdır.
- Aydınlatma metni giriş ekranında ve `/r/{token}` sayfasının altında.
- Öğrenci notları hassas veri kabul edilir; erişimler `audit_logs`'a yazılır.
- Saklama süreleri §8'de.
- Dosya URL'leri kısa ömürlü imzalı; bucket public olmayacak.

---

## 10. Faz planı

| Aşama | Kapsam | Bitiş kriteri |
|---|---|---|
| 0 | Vite + React + TypeScript iskeleti, Express + TypeScript backend, `/api/v1` prefix, migration runner (Aşama 1'e kadar #1 düzenlenebilir), `PRAGMA WAL + foreign_keys`, temel layout | `npm run dev` çalışıyor, `/api/v1/health` 200 dönüyor |
| 1 | STRICT tablolar + kısmi indeksler (§3.1) — migration #1 yalnızca şema; ayrı CLI seed script'i (ilk admin dahil); `backend/src/utils` altında Türkçe normalizasyon ve hafta hesap util'leri; migration #1 dondurulur | Seed çalışıyor, foreign key ihlali testi geçiyor, normalizasyon/hafta testleri geçiyor |
| 2a | JWT kimlik doğrulama (e-posta+şifre, username+şifre — §2.1), otomatik `username` üretimi, `token_version` karşılaştırması, `auth`+`adminOnly` middleware, rol bazlı route koruması (ProtectedRoute), yetki birim testleri. **Retrofit notu:** OTP/telefon tabanlı girişten username+şifreye geçildi (bkz. Aşama 2a-retrofit) | 4 rolle giriş yapılabiliyor, token_version uyumsuzluğunda 401, yetki testleri geçiyor |
| 2b | Admin CRUD: eğitim yılı, hafta, sınıf, ders, class_courses ataması, öğrenci-veli yönetimi, arama (`full_name_normalized`) + sayfalama | Admin bir eğitim yılını seed'e dokunmadan sıfırdan kurabiliyor |
| 3 | Toplu rapor giriş ekranı, `reports`+`report_entries`, önceki ödev çekme, otomatik kaydetme, klavye nav, supertest entegrasyon testi | Bir öğretmen 8 kişilik sınıfın haftalık raporunu klavyeden çıkmadan doldurabiliyor |
| 4 | `homeworks`+son tarih, HEIC dönüşümü (heic-convert→sharp), multer+sharp, `GET /api/v1/files/:key` korumalı rota (flag yok), öğrenci yükleme + öğretmen teslim kontrol ekranı | Öğrenci HEIC/JPEG yüklüyor, küçültülerek kaydediliyor, dosyaya yetkisiz erişim 403 dönüyor |
| 5 | `weekly_digests` pending oluşturma + ready tetikleme, admin gönderim ekranı (pending+ready), `/r/{token}` (is_revoked kontrolü), veli paneli, re-send (yeni token), revoke, audit log | Koordinatör toplu gönderim yapıyor, veli 4 dersi birlikte görüyor, iptal sonrası 410 dönüyor |
| 6 | Veli trend grafiği, riskli öğrenci listesi, hatırlatma (wa.me, 2 gün önce + son gün, cron+`X-Cron-Secret`), saklama temizliği CLI, R2 implementasyonu, yıl sonu PDF, KVKK akışı. **Ayrıca:** ayrılan öğretmenin atamalarını toplu devretme akışı (Aşama 2b'de atamalı öğretmen silinemediği için gerekli; yoksa admin öğretmeni çıkaramaz) | — |

---

## 11. Kapsam dışı (şimdilik)

WhatsApp Cloud API, multi-tenant/çoklu şube, ödeme, ayrı yoklama modülü,
sınav sonuçları, öğretmen-veli mesajlaşma, mobil uygulama.

Bunlardan biri gerekli görünüyorsa önce konuş.

---

## 12. Gelecek notu — mobil uyumluluk

Mevcut mimari (Express REST API + JWT + node:sqlite) mobil uygulamaya geçiş
için bilinçli olarak seçilmiştir.

- **Backend aynen kalır:** REST API, JWT auth, veri modeli, dosya yükleme
  (multer + sharp) ve `wa.me` gönderimi — mobil uygulama bu API'ye doğrudan
  bağlanır, backend yeniden yazılmaz.
- **Frontend yeniden yazılır:** Mobil istemci (React Native / Expo veya
  Flutter) aynı API'ye bağlanan ayrı bir istemci olur. Web UI'ı (React + Vite)
  korunur; ikisi paralel çalışır ve aynı veritabanını paylaşır.
- **API versionlama:** Aşama 0'dan itibaren tüm rotalar `/api/v1/...` prefix'ini
  kullanır. Vite proxy `/api` üzerinden geçtiği için frontend değişmez. Mobil
  yayınlandığında web'i kırmadan API geliştirilebilir.
- **`/r/[token]` public sayfa:** Token tabanlı mantık mobilde deeplink olarak
  aynen kullanılabilir.
