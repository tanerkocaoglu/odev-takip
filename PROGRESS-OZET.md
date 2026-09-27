# PROGRESS-OZET — Dershane Ödev Takip Sistemi

> `PROGRESS.md`'nin kısa hâli. Ayrıntılı kayıtlar (doğrulama dökümleri, dosya
> listeleri) `PROGRESS.md`'dedir; bu dosya planlama ve karar verme içindir.
> Son güncelleme: 2026-09-27.

---

## Güncel durum

- **Aşama 0–5 tamamlandı**, sistem üretimde (Render + Cloudflare R2).
- Aşama 6'nın büyük kısmı tamamlandı (aşağıda).
- Denetim turu kapandı: tüm bulgular (#3, #6, #7, #8, #9, NOT NULL borcu,
  `routes/admin.ts` bölünmesi) ve bağımlılık grupları 1–4 kapatıldı.
- Son işler: **sent rapor öğretmen için salt-okunur** (yeni `locked_for_teacher`
  bayrağı + birleşik arayüz kilidi + "gönderildi" banner'ı; admin serbest kalır);
  admin "Haftalar" ekranında satır bazlı tarih **"Düzenle"**
  (`PATCH /admin/weeks/:id`); "bugün" artık **Europe/Istanbul** (`localTodayISO`
  UTC kayması giderildi); yeni öğrenci + CSV toplu eklemede **başlangıç
  haftası** seçimi (enrollment `start_date` artık bugün değil, seçilen/aktif
  haftanın başlangıcı; geçmiş hafta seçilemez).
- Son doğrulama (2026-09-27): backend **460/460**, frontend **148/148** yeşil;
  `typecheck` + `lint` temiz. Şema sürümü: **migration #13**.

## Aşama durumu

| Aşama | Durum |
|---|---|
| 0 İskelet | ✅ |
| 1 Veri modeli ve seed | ✅ |
| 2a Kimlik doğrulama | ✅ (retrofit: OTP kaldırıldı → username + şifre) |
| 2b Admin CRUD | ✅ |
| 3 Toplu rapor giriş ekranı | ✅ |
| 4 Ödev ve teslim | ✅ |
| 5 Veli görünümü ve haftalık gönderim | ✅ |
| 6 İyileştirmeler | Kısmen — aşağıya bak |

**Aşama 6 ayrıntısı**
- ✅ Riskli öğrenci listesi, R2 depolama, KVKK aydınlatma metni + `consent_at`,
  atama takası / öğretmen atamalarını devretme, admin haftalık ödev özeti
  (WhatsApp görseli, spec §5.8), CSV içe/dışa aktarma, yedekleme (`db:backup`,
  `BACKUPS_DIR` + yaşlandırma).
- 🔄 Hatırlatma: yalnızca öğretmen dashboard'unda iç hatırlatma. `wa.me` +
  cron hatırlatması uygulanmadı.
- 🔄 Saklama: elle `cleanup-submissions` CLI'ı; otomatik 1 yıllık temizlik
  ertelendi.
- ⏸ Veli trend grafiği (veri hazır, grafik yok), yıl sonu PDF özeti.

## Migration listesi

| # | İçerik |
|---|---|
| 1 | Temel şema (STRICT + kısmi indeksler) — dondurulmuş |
| 2 | `otp_codes` (sonradan #5 ile devre dışı) |
| 3 | `name_normalized` kolonları + backfill |
| 4 | `submission_files` |
| 5 | `username_login` (OTP → username) |
| 6 | `schools`, `students.school_id/grade_level`, digest görüntülenme alanları |
| 7 | `users.must_change_password` |
| 8 | `submission_files.thumb_key` |
| 9 | `password_hash` / `whatsapp_phone` NOT NULL |
| 10 | `report_entries` CHECK ayrıştırma (devamsızda `homework_score`) |
| 11 | `weekly_digests.class_id` |
| 12 | `submission_files.storage` (`local` / `r2`) |
| 13 | `homework_attachments` (öğretmen PDF ekleri) |

## Kalıcı kararlar (kullanıcı onaylı)

**Haftalar ve zaman**
- Hafta aralığı **tam 7 gün**; aksi 400. Ders günü aralık dışıysa yazma 409.
- Göreli gün sırası her haftanın gerçek `start_date`'inden türetilir
  (Cumartesi koda sabit yazılmaz). Tarihler ISO 8601 saklanır.
- "Bugün" `Europe/Istanbul`'a göre hesaplanır (`localTodayISO`).
- **Enrollment başlangıcı:** yeni öğrenci (tekil + CSV) admin'in seçtiği haftanın
  `start_date`'inden başlar; seçim yoksa aktif haftanın başlangıcı. Geçmiş
  (bitmiş) hafta **seçilemez** (backend 400). CSV'de tüm batch tek haftadan.
  Şema değişmez — kural uygulama katmanında (`services/enrollmentStart.ts`).
- Hafta etiketi backend'de tarihten türetilir (`gg.aa - gg.aa.yyyy`); tarih
  değişince yeniden üretilir. Admin yalnızca tarihi düzenler, `week_no` sabit.
- Başlamamış hafta: öğretmen rapor girişinde salt-okunur önizleme (DB'ye
  yazmaz); yazma **admin dahil herkese** kapalı. Admin dashboard'unda "eksik"
  sayılmaz.
**Operasyon**
- Production DB'sini değiştiren her müdahaleden (reset, wipe, elle SQL
  düzeltmesi, script tabanlı toplu güncelleme) **hemen önce** `npm run
  db:backup` zorunlu. Backup alınmadan production'a yazma işlemi
  yapılmaz — geri dönüş garantisi olmadan geri dönüşü olmayan işlem
  yapılmaması içindir.

**Raporlar ve digest**
- `sent` rapor: öğretmen düzenleyemez (403), admin düzenleyebilir. Arayüz
  bunu `locked_for_teacher` bayrağıyla uygular (hafta `read_only`'den ayrı):
  öğretmende tüm alanlar baştan kapalı + "gönderildi" banner'ı, autosave hiç
  tetiklenmez; admin `locked_for_teacher=false` alır, düzenlemeye devam eder.
- Geri çekilmiş + gönderilmemiş digest'te "Düzenle" görünür; yeniden gönderim
  elle ("Yeniden gönder"). Diğer öğrencilerin snapshot'larına dokunulmaz.
- Veride konum/sınıf gibi bilgiler satırda saklanır, okuma sırasında yeniden
  türetilmez (`weekly_digests.class_id`, `submission_files.storage`).

**Risk ve hatırlatma**
- Riskli öğrenci: son 3 **bitmiş** hafta; kriterlerden biri yeterli (OR):
  ortalama ≤ 4, ≥ 2 teslim edilmemiş ödev, ardışık ≥ 2 hafta `absent`
  (`excused` sayılmaz). Eşikler `backend/src/constants.ts`'te.
- Hatırlatma arka plan mekanizması yok; yalnızca dashboard sayacı.

**Dosyalar**
- Öğrenci: teslim başına 30 dosya, dosya başına 10 MB.
- Öğretmen ödev eki: ödev başına 5 PDF, 10 MB; süresiz saklanır,
  `cleanup-submissions` kapsamı dışında, yedeğe dahil.
- R2: imzalı URL 5 dk + 302. Eski yerel dosyalar R2'ye taşınmadı.
- `wipe` / `reset` R2'ye asla dokunmaz.

**KVKK** — sistem dışa kapalı, ~400 kişi, düşük risk kabul edildi. Veli açık
rıza sürümleme, otomatik saklama süresi ve okuma audit log'u **ertelendi**;
ölçek büyürse (400+ kişi, çoklu şube) yeniden ele alınacak.

## Açık işler

1. ~~Üretim hafta teşhisi bekliyor~~ → **Çözüldü (2026-09-26):** `diagnose-weeks`
   production'da 0 hatalı hafta gösterdi (9 hafta, tümü 7 gün). Test
   ortamında tespit edilen hatalı hafta production'a yansımamıştı; kullanıcı
   bu süreçte production DB'sini `db:reset` ile sıfırdan kurdu. Reset
   sonrası gerçek veri teyit edildi: 21 öğrenci, 20 veli, 7 öğretmen mevcut.
   R2 dosyaları etkilenmedi (`reset` R2'ye dokunmuyor kararı geçerli).
2. ~~PROGRESS.md commit kayıtları~~ → **Çözüldü (2026-09-26):** tüm
   "Henüz commit edilmedi" / "Bu commit" placeholder'ları (42 kayıt)
   `git log --oneline --all` ile eşleştirilip gerçek kısa hash + subject ile
   değiştirildi; eşleşmeyen/belirsiz kayıt kalmadı.
3. **Aşama 6 kalanları:** veli trend grafiği, yıl sonu PDF özeti — önceliği
   belirlenmedi.

## Bilinen ve belgelenmiş sınırlar

- "Başlamamış hafta eksik sayılmaz" kuralı yalnızca admin dashboard'unda;
  digest gönderim varsayılanı, ödev özeti ve digest backfill bilinçli olarak
  kapsam dışı.
- `currentDigestWeek()` ailesi risk penceresi düzeltmesine dahil edilmedi.

## Kapsam dışı

`spec.md` §11: WhatsApp Cloud API, çoklu şube, ödeme, yoklama modülü, sınav
sonuçları, öğretmen-veli mesajlaşma, mobil uygulama (mimari mobil için
hazır — §12).
