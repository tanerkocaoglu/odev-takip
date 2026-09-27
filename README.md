# Ödev Takip

[![CI](https://github.com/tanerkocaoglu/odev-takip/actions/workflows/ci.yml/badge.svg)](https://github.com/tanerkocaoglu/odev-takip/actions/workflows/ci.yml)

Bir dershanenin haftalık ödev ve ders içi performans takibini Excel'den web'e
taşıyan, gerçek bir kurumda üretimde kullanılan tam yığın web uygulaması.

> Bu depo, sistemin **anonimleştirilmiş portföy kopyasıdır**. Kurum adı,
> adresler, kişi verileri ve anahtarlar çıkarılmıştır.

## Problem

Öğretmenler her hafta her ders için devamsızlık, ödev puanı, ders içi
performans puanı ve not giriyordu; veriler Excel dosyaları ve formlar arasında
dağınıktı, velilere haftalık rapor elle hazırlanıyordu.

Sistemin gerçek rakibi o Excel dosyasıydı. Bu yüzden öğretmenin rapor giriş
ekranı, klavyeden çıkmadan ve Excel'den hızlı doldurulacak şekilde tasarlandı;
veli ve öğrenci ekranları ise telefonda tek seferlik okuma için.

| Rol | Ne yapar |
|---|---|
| Admin | Eğitim yılı, hafta, sınıf, ders ve öğretmen atamalarını kurar; kullanıcıları yönetir; haftalık veli raporlarını gönderir |
| Öğretmen | Haftalık rapor girer: devamsızlık, ödev puanı, ders içi performans puanı, not, verilen ödev (PDF eki) |
| Öğrenci | Ödevlerini görür, fotoğraf veya PDF olarak teslim eder. Puanını ve öğretmen notunu hiçbir zaman göremez |
| Veli | Haftalık birleşik raporu WhatsApp linkiyle (girişsiz) veya kendi hesabıyla görür |

## Öne çıkan teknik kararlar

- **Yetki her uçta.** Her route handler ilk iş olarak yetki kontrolü yapar.
  Admin uçlarının tamamının korunduğu, statik ve çalışma zamanı kontrolü yapan
  bir envanter script'iyle doğrulanır
  ([`backend/scripts/audit-admin-routes.ts`](backend/scripts/audit-admin-routes.ts)).
- **Oturum iptali.** JWT içindeki `token_version` her istekte veritabanıyla
  karşılaştırılır; şifre değişince eski oturumlar geçersiz olur.
- **Girişsiz veli raporu.** `/r/{token}` sayfası kimlik doğrulamasız açıldığı
  için token UUID değil, 256 bit rastgele bir değerdir. Her gönderimde
  yenilenir, iptal edilebilir (iptal edilen link `410 Gone` döner). Rapor,
  gönderim anındaki snapshot'tan okunur.
- **Dosya güvenliği.** Yüklenen dosyalar `express.static` ile servis edilmez;
  yetki kontrollü bir uçtan servis edilir. Yüklemelerde magic-byte doğrulaması
  yapılır: beyan edilen tip ile gerçek içerik uyuşmazsa dosya diske yazılmadan
  reddedilir. HEIC fotoğraflar JPEG'e çevrilip küçültülür, ham dosya saklanmaz.
  Nesne depolamada bucket public değildir; erişim 5 dakikalık imzalı URL'ye
  yönlendirmeyle olur.
- **SQLite, bilinçli bir seçim.** `node:sqlite` (harici sürücü yok), `STRICT`
  tablolar, WAL, foreign key'ler, soft delete için kısmi `UNIQUE` indeksler ve
  `PRAGMA user_version` tabanlı, transaction içinde çalışan migration'lar.
  Dondurulmuş bir migration asla düzenlenmez; her şema değişikliği yeni
  numaralı migration'dır. Tek kurum ölçeği için ayrı bir veritabanı sunucusu
  gereksiz bulundu.
- **Tarih mantığı sunucuda.** Haftalar kurumun takvimine göre tanımlanır ve
  tam 7 gün olmak zorundadır; gün sırası haftanın gerçek başlangıcından
  türetilir; "bugün" `Europe/Istanbul` saatine göre hesaplanır.
- **Tek hata biçimi.** Tüm girdiler Zod ile doğrulanır; tüm hatalar sabit
  kodlu tek bir JSON biçiminde ve Türkçe mesajla döner.
- **Güvenli operasyon araçları.** Yedekleme, teşhis ve temizlik CLI'ları
  varsayılan olarak dry-run çalışır; yıkıcı işlemler önce otomatik yedek alır;
  üretimde veritabanı sıfırlama ayrıca açık bir ortam bayrağı ister.

## Teknoloji yığını

| Katman | Seçim |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, react-router-dom |
| Backend | Node.js, Express, TypeScript |
| Veritabanı | SQLite (`node:sqlite`, ORM yok, ham SQL) |
| Kimlik doğrulama | JWT + rol bazlı yetki (admin, öğretmen, öğrenci, veli) |
| Doğrulama | Zod |
| Dosya işleme | multer, sharp, heic-convert |
| Depolama | Yerel disk (geliştirme), Cloudflare R2 (üretim) |
| Test | Vitest, supertest |
| Dağıtım | Render (tek servis: API + SPA) |

## Kalite

- **460 backend testi** (Vitest + supertest ile API entegrasyon testleri) ve
  **149 frontend testi** (Vitest, jsdom).
- Yetki kuralları her rol için ayrı ayrı test edilir.
- Her push'ta CI: typecheck, lint, test ve production build.

## Yerelde çalıştırma

Gereksinim: **Node.js 24** (`node:sqlite` için).

```bash
# Bağımlılıklar
npm ci
cd backend && npm ci

# Ortam değişkenleri: JWT_SECRET, ADMIN_PASSWORD ve SEED_USER_PASSWORD'ü doldurun
cp .env.example .env

# Veritabanı ve kurgusal örnek veri
npm run db:migrate
npm run db:seed

# API (http://localhost:3001)
npm run dev
```

Ayrı bir terminalde, kök dizinde `npm run dev` ile arayüz
http://localhost:5173 adresinde açılır. Seed yalnızca kurgusal veri üretir.
Admin girişi: `admin@dershane.local` ve `.env`'deki `ADMIN_PASSWORD`.

## Nasıl geliştirildi

Bu proje, **spec odaklı ve AI destekli** bir süreçle geliştirildi.

- **Ürün sahibi (Taner Kocaoğlu):** Gereksinimleri kurumla birlikte çıkardım,
  [`spec.md`](spec.md)'yi oluşturup güncel tuttum. Mimari, veri modeli, yetki
  ve güvenlik kararlarını verdim; her işi kapsamı ve kabul kriteri belli küçük
  görevlere böldüm; sonuçları doğrulayıp üretime aldım.
- **Kodlama:** Kodu, bu görev tanımlarına göre OpenCode üzerinde çalışan bir
  AI kodlama ajanı yazdı.
- **Planlama ve karar desteği:** Seçeneklerin artı/eksi analizi ve görev
  tanımlarının netleştirilmesi için Claude (Anthropic) kullanıldı.

Süreç üç dosya üzerine kurulu ve üçü de depoda:

| Dosya | Rolü |
|---|---|
| [`spec.md`](spec.md) | Ne inşa ediliyor: gereksinimler, veri modeli, kapsam |
| [`CLAUDE.md`](CLAUDE.md) | Ajanın kuralları: kod, tasarım ve çalışma akışı |
| [`PROGRESS.md`](PROGRESS.md) | Her işin kaydı: kapsam, onaylanan kararlar, doğrulama |

Her iş aynı döngüden geçti: kapsam → kararların ürün sahibince onayı → küçük
adımlar (kod → typecheck → test → commit) → doğrulama → kayıt. Şema
değişiklikleri önce spec'e, sonra yeni numaralı migration'a yazıldı. Üretim
verisine dokunan her işlemden önce salt-okunur teşhis yapıldı ve yedek alındı.
Üretime geçtikten sonra ayrı bir güvenlik denetim turu yapıldı.

> `PROGRESS.md`'deki commit hash'leri özel depoya aittir. Bu kopyanın geçmişi
> anonimleştirme için yeniden yazıldığından hash'ler eşleşmez.

## Lisans

Tüm hakları saklıdır. Kod incelenebilir; izin alınmadan kullanılamaz,
kopyalanamaz veya dağıtılamaz. Güvenlik bildirimleri için
[`SECURITY.md`](SECURITY.md).
