# PROGRESS-OZET — Dershane Ödev Takip Sistemi

> `PROGRESS.md`'nin kısa hâli. Ayrıntılı kayıtlar (doğrulama dökümleri, dosya
> listeleri) `PROGRESS.md`'dedir; bu dosya planlama ve karar verme içindir.
> Son güncelleme: 2026-09-26.

---

## Güncel durum

- **Aşama 0–5 tamamlandı**, sistem üretimde (Render + Cloudflare R2).
- Aşama 6'nın büyük kısmı tamamlandı (aşağıda).
- Denetim turu kapandı: tüm bulgular (#3, #6, #7, #8, #9, NOT NULL borcu,
  `routes/admin.ts` bölünmesi) ve bağımlılık grupları 1–4 kapatıldı.
- Son işler: admin "Haftalar" ekranında satır bazlı tarih **"Düzenle"**
  (`PATCH /admin/weeks/:id`); "bugün" artık **Europe/Istanbul** (`localTodayISO`
  UTC kayması giderildi — hafta başlangıcında "henüz başlamadı" banner'ı
  düzeldi).
- Son doğrulama (2026-09-26): backend **450/450**, frontend **143/143** yeşil;
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
- Hafta etiketi backend'de tarihten türetilir (`gg.aa - gg.aa.yyyy`); tarih
  değişince yeniden üretilir. Admin yalnızca tarihi düzenler, `week_no` sabit.
- Başlamamış hafta: öğretmen rapor girişinde salt-okunur önizleme (DB'ye
  yazmaz); yazma **admin dahil herkese** kapalı. Admin dashboard'unda "eksik"
  sayılmaz.

**Raporlar ve digest**
- `sent` rapor: öğretmen düzenleyemez (403), admin düzenleyebilir.
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

1. **Üretim hafta teşhisi bekliyor:** Render Shell'de `npm run diagnose-weeks`
   çalıştırılıp 21–26 Eylül haftasının gerçek durumu görülecek. Sonuç
   görülmeden veri düzeltmesi yapılmayacak. Düzeltme: admin UI'deki
   **"Düzenle"** ile bitiş tarihini +1 gün çekmek; bozuk aralık yüzünden
   `null` kalmış `homeworks.due_date`'ler otomatik dolmaz.
2. **PROGRESS.md commit kayıtları (kısmen tamamlandı):** dört örnek işlendi —
   ders sıralaması `2a7ca03`, başlamamış hafta önizlemesi `fb08c62`,
   migration #11 `925bcc1`, Aşama 2a retrofit (`f7f239a`…`4717b09`). Eski
   UI/Demo dönemi ~20 kayıtta hâlâ "Henüz commit edilmedi" var; gerektiğinde
   `git log` ile tamamlanacak.
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
