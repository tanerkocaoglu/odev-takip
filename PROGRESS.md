# PROGRESS — Dershane Ödev Takip Sistemi

> Bu dosya her başarılı aşama sonunda güncellenir. İlerleme raporu: süreç
> özeti, doğrulamalar, commit hash'i, çözülen sorunlar ve güncel dosya yapısı.

---

## Öğrenci "Ödevlerim" ekranı — admin görsel dili ✅

### Süreç özeti

`HomeworkListPage` (öğrenci "Ödevlerim") admin panelindeki görsel dağarcıkla
zenginleştirildi: duruma göre sol kenar şeridi, ders ikonu, elevation,
dropzone focus/hover'da Level 2. **Yalnızca görsel katman değişti** — route,
API çağrıları, veri modeli, `comfortable` yoğunluk ve mobil öncelik aynen
korundu. Öğrencinin puan/not/değerlendirme süreci görmeme kuralı dokunulmadı.

### Yapılanlar

**`src/pages/student/HomeworkListPage.tsx`**
- **Durum türetme (`cardStatus`):** `submitted` (yüklendi) / `late` (geç
  yüklendi) / `overdue` (süresi geçti, yüklenmedi) / `pending` (süresi var,
  yüklenmedi). Kartta test edilebilir `data-status` özniteliği.
- **Sol kenar şeridi (`border-l-4`):** submitted=yeşil (`border-l-sub-uploaded`),
  late/overdue=amber (`border-l-sub-late`), pending=nötr (`border-l-status-draft`).
  **`--accent` kullanılmadı** — kart etkileşimli değil, accent kuralı korunur.
- **Rozetler dolgulu** (zaten öyleydi) ve tek kaynağa normalize edildi:
  `bg-sub-uploaded/10`, `bg-sub-late/10`, `bg-sub-missing/10`; bekleyen
  "Yüklenmedi" **nötr** (`status-draft`), süresi geçmiş "Yüklenmedi" amber.
  İkonlar korundu (`CheckCircle2`/`Clock3`/`XCircle`).
- **Ders ikonu:** `BookOpen` (16px, `aria-hidden`, `text-muted`) ders adının
  yanında; metin düğümü bölünmedi (mevcut test sorgusu bozulmadı).
- **Elevation:** kartlar `elevation-1`; sayfa başlığı paylaşılan `PageTitle`.
- **Dropzone:** `card-interactive` + seçilen dosya satırları `bg-bg` zeminli,
  temiz liste. Basit "Dosya seç" akışı korundu (drag-drop eklenmedi — karar).

**`src/index.css`**
- `.card-interactive:focus-within` eklendi (accent kenarlık + Level 2 gölge) —
  dropzone içindeki kontrole odaklanınca "şu an önde". `prefers-reduced-motion`
  davranışı global kuralca korunur.

**Tek liste kararı:** Geçmiş ödevler için ayrı/katlanır bölüm **eklenmedi**
(mevcut `ORDER BY w.start_date DESC` listesi korunur; test/akış riski yok).

### Doğrulamalar

- typecheck ✅, lint ✅, build ✅.
- Frontend **63/63** (12 dosya) ✅ — `student.test.tsx` +1 test
  (dört `data-status` türetimi) ve gizlilik assertion'ı
  `/inceleme|değerlendir|sırada/i` ile güçlendirildi.
- Backend: **198/198** ✅. **Önemli not — bu bir regresyon DEĞİLDİR:** Bu
  turdan önce backend paketi kırıktı. `db/schema.test.ts`'teki 7 test,
  `c714072` ("seed sıfırlaması" — 3 sınıflı demo) `seed.ts`'i küçültürken
  testlerin eski 88 kullanıcı / 42 öğrenci / 8 sınıf / risk senaryosu
  beklentilerinde kalmasından dolayı başarısız oluyordu. Bu, görsel
  değişiklikten **tamamen bağımsız, önceden var olan** bir uyumsuzluktu; aynı
  turda ayrı bir commit ile giderildi (bkz. alttaki "Backend test bakımı").
- **Canlı (headless Chrome/CDP + gerçek app.db, `ogrenci1`):**
  - Mobil (390px) + masaüstü (1280px): dört durum birlikte — nötr "bekleyen",
    yeşil "Yüklendi", amber "Geç yüklendi", amber "Yüklenmedi".
  - Dropzone odak ölçümü: `box-shadow: rgba(10,120,163,0.08) 0px 4px 12px`,
    `transition: 0.15s` (`focus-within` gerçekten uygulanıyor).
- **Gizlilik teyidi:** Render'da puan/not/inceleme/değerlendirme/sırada yok;
  `student/homeworks` yanıtı yalnızca `id, description, due_date, course_name,
  teacher_name, week, submission` döner (puan alanı yok). "Not (isteğe bağlı)"
  alanı öğrencinin *kendi* teslim notudur, öğretmen notu değildir.

### Etkilenen dosyalar

```
src/pages/student/HomeworkListPage.tsx
src/index.css
src/student.test.tsx
PROGRESS.md
```

### Commit

`370c221` — öğrenci "Ödevlerim" görsel zenginleştirme (durum şeridi, ikon,
elevation, dropzone odak dili).

---

## Backend test bakımı — `schema.test.ts` güncel seed'e göre ✅

### Süreç özeti

`db/schema.test.ts`'teki **7 test**, `c714072` ("seed sıfırlaması" — 3 sınıflı
demo) `seed.ts`'i küçültürken testlerin güncellenmemesinden dolayı başarısız
oluyordu. Test beklentileri **güncel seed verisine** göre yeniden yazıldı.
**Uygulama kodu, şema ve seed değişmedi** — yalnızca testler düzeltildi.
Görsel turla karışmasın diye **ayrı commit** olarak atıldı.

> **Not:** Bu 7 hata yeni bir regresyon **değildir**; öğrenci "Ödevlerim"
> görsel turundan bağımsız, önceden var olan bir seed/test uyumsuzluğudur.

### Yapılanlar

- Hacim testi: users 29, students/guardians 12, classes 3, courses 4,
  class_courses/enrollments 12, reports/homeworks 36, report_entries 144,
  schools 4, submissions 0, weekly_digests 4.
- Rapor durumu: geçmiş haftalar 17/18/19 → her biri 12 `completed` (eski
  19/20 risk penceresi beklentisi kaldırıldı).
- Okul/seviye: 12 öğrencinin tamamı atanmış (öğrenci 001 → `seed-school-001`,
  seviye `6`); teslim yok; tüm satırlar `present` + puanlı.
- Yapı: 4 öğretmen tek dersi 3 sınıfta verir; ders → gün sabit
  (Matematik=Pzt … İngilizce=Perşembe); ders id'leri
  `seed-course-matematik/fizik/turkce/ingilizce`.
- Kaldırılan eski senaryolar (yeni seed'de yok): kardeş (2 veli × 2 çocuk),
  sınıf değiştiren öğrenci, risk senaryoları. Yerine: her velinin tek çocuğu,
  her öğrencinin tek aktif enrollment'ı, öğrenci 3'ün tüm haftalarda aynı
  sınıfta olması.

### Doğrulamalar

- Taze `test.db` ile backend **198/198** (17 dosya) ✅; backend `typecheck` ✅;
  kök `lint` ✅. (Düzeltme öncesi: 191/198.)

### Commit

Ayrı commit: `test: schema.test seed beklentileri güncel 3 sınıflı demo seed'e göre`.

---

## Marka görseli — "Ödev Takip" ✅

### Süreç özeti

Üç yerdeki marka metni görsel öğesi kaldırılıp `src/assets/logo.png` logosu
kullanıldı: admin sol menüsü, üst çubuk (AppLayout) ve giriş ekranı (LoginPage).
Marka adı "Ödev Takip" olarak hem erişilebilirlik metnine
(`alt`) hem de tarayıcı sekmesi başlığına (`index.html <title>`) işlendi.

### Yapılanlar

- `src/components/BrandLogo.tsx` (yeni): tek `<img>` (`alt="Ödev Takip"`), boyut/kırpma `className` ile verilir.
- **AdminLayout:** marka bloğu logoya döndü; genişte `h-16 object-contain`,
  `<lg` ikon-only durumda `h-16 w-16 object-cover` (kare merkez kırpma).
- **AppLayout (üst çubuk):** marka linki `<img h-16 object-contain>`; başlık
  yüksekliği `h-14 → h-20` (64px logo sığsın).
- **LoginPage:** marka `<h1>` metni ve "…giriş yapın" alt yazısı kaldırıldı →
  ortalanmış `<img h-16 object-contain>`.
- **`index.html`:** `<title>` → "Ödev Takip".
- Logo kendi renklerini taşır; tasarım token'larına/renk paletine dokunulmadı.

### Doğrulamalar

- typecheck ✅, lint ✅, build ✅, frontend **62/62** (12 dosya) ✅.
- `App.test.tsx`: marka başlığı sorguları yeni logoya güncellendi
  (`getByRole('img', { name: 'Ödev Takip' })`);
  `admin-layout.test.tsx`'e logo testi eklendi.
- Canlı ekran görüntüleri: admin sidebar geniş + dar (kare), üst çubuk
  (öğretmen), giriş ekranı.

### Not

- İstenen `src/assets/logo.jpeg` repoda yok; mevcut tek marka görseli
  `src/assets/logo.png` (1024×1024) kullanıldı.

### Etkilenen dosyalar

```
src/components/BrandLogo.tsx (yeni)
src/components/admin/AdminLayout.tsx
src/components/layout/AppLayout.tsx
src/pages/LoginPage.tsx
index.html
src/App.test.tsx
src/admin-layout.test.tsx
PROGRESS.md
```

### Commit

Henüz commit edilmedi.

---

## Admin navigasyonu — üst sekmelerden sol sabit menüye ✅

### Süreç özeti

Admin panelinin navigasyon kabuğu üst sekmeli `AdminLayout`'tan sol sabit dikey
menüye çevrildi (ikon + etiket, aktif sekmede accent sol şerit + hafif dolgu;
üstte kurum/marka, altta kullanıcı + çıkış). **Route'lar, veri akışı ve API
çağrıları birebir aynı kaldı** — yalnızca kabuk değişti. Diğer üç rolün
navigasyonu (`AppLayout`) etkilenmedi.

### Yapılanlar

- **`App.tsx`:** admin dalı `AppLayout → AdminLayout` yerine doğrudan
  `<ProtectedRoute roles={['admin']}><AdminLayout/></ProtectedRoute>` oldu.
  URL'ler/route ağacı değişmedi.
- **`AdminLayout.tsx` (yeniden yazıldı):** `flex min-h-screen` → sol `aside`
  (sabit), sağda `<main class="admin-content">`. 12 sekme `NavLink` (ikon +
  etiket, `aria-label` korunur), aktif vurgu accent sol şerit + `bg-accent/10`.
  Altta kullanıcı adı/rol + Çıkış. `h1 "Yönetim"` korundu (erişilebilirlik +
  `App.test.tsx` uyumu).
- **Mobil:** `<lg` (>640px değil; `lg`=1024px) altında menü **ikon-only
  şeride** daralır (`w-16`, etiketler gizli) — JS state yok. Masaüstünde sabit
  `lg:w-60` (~240px).
- **Panel özet kartları 4'e çıktı**, üst kenarlık anlam rengiyle: Tamamlanan
  (yeşil `status-sent`), Eksik (`total-completed`, amber `att-late`), Bekleyen
  gönderim (mavi `status-completed`), Rapor arşivi (accent). Yeni API alanı
  gerekmedi.
- **Filtre sekmeleri** ("Eksik raporlar / Tam matris / Riskli öğrenciler")
  düz metinden **sayı rozetli kart-butonlara** dönüştü (`card-interactive` +
  `elevation-1`, ikonlu daire; aktifte accent kenarlık). `role=button` +
  `aria-label` korundu.
- `src/admin-layout.test.tsx` (yeni): 12 linkin href'i, aktif içerik ve
  "Yönetim" başlığı sabitlendi.

### Doğrulamalar

- typecheck ✅, lint ✅, build ✅, frontend **61/61** (12 dosya) ✅.
- `App.test.tsx` ve `admin-risk.test.tsx` **değişmeden** geçti (başlık +
  filtre butonu erişilebilir adları korundu).
- Canlı (headless Chrome, gerçek app.db): masaüstü sidebar (1440px), dar ekran
  ikon-only (700px) ve Haftalar sekmesi; `adminContent:true` (satır hover
  kapsamı korunur).

### Etkilenen dosyalar

```
src/App.tsx
src/components/admin/AdminLayout.tsx
src/pages/admin/AdminDashboardPage.tsx
src/admin-layout.test.tsx (yeni)
CLAUDE.md (admin navigasyon notu)
PROGRESS.md
```

### Commit

Henüz commit edilmedi.

---

## Admin — paylaşılan bileşenlerle tüm sekmelerin görsel dili ✅

### Süreç özeti

Admin sekmelerinin tümü (Panel, Eğitim yılı, Haftalar, Sınıflar, Dersler,
Atamalar, Öğretmenler, Öğrenciler, Veliler, Okullar, Raporlar, Gönderim)
paylaşılan bileşenler üzerinden tutarlı biçimde zenginleştirildi. Layout, sütun
yapısı ve tablo verileri değişmedi; yalnızca paylaşılan bileşenlerin görsel
katmanı güncellendi.

### Yapılanlar

**Paylaşılan bileşenler (`components/admin/ui.tsx`)**
- `Badge` (tone: neutral/positive/warning/danger/info) + `StatusBadge` +
  `AttendanceBadge` — düz metin/hafif gri rozetler tek dolgulu stile toplandı.
- `PageTitle` — sayfa başlığı + sekme ikonu.
- `EmptyState` — `Inbox` ikonu, yuvarlatılmış kenar, `bg-surface` + Level 1.
- `SearchBox` — magnifier ikonu (solda) + `pl-9`.
- `PrimaryButton` — `card-interactive` ile hover'da Level 2 yükselme.

**`index.css`**
- `.admin-content tbody tr` hover: hafif `--bg` zemin + ilk hücrede solda 2px
  accent şeridi (`inset box-shadow`); reduced-motion'da geçiş kapalı.

**`AdminLayout`**
- 12 sekmeye tek ikon seti: Panel=LayoutDashboard, Eğitim yılı=CalendarRange,
  Haftalar=CalendarDays, Sınıflar=Layers, Dersler=BookOpen, Atamalar=Shuffle,
  Öğretmenler=UserCog, Öğrenciler=GraduationCap, Veliler=Users, Okullar=School,
  Raporlar=FileText, Gönderim=Send. `<main>` artık `admin-content`.

**Rozet eşlemesi**
- Tamamlandı → mavi (`status-completed`), Gönderildi → yeşil (`status-sent`),
  Taslak → nötr gri (`status-draft`). "Tamamlandı↔Gönderildi" ayrımı korunur.
- Aktif / Onaylı → yeşil; Hazır (digest) → mavi (rapor tamam, gönderim
  bekliyor); Onaysız / Günü geçti / Eksik / Eksikli → amber.
- Risk nedenleri → kırmızı (`danger`).
- `GuardiansPage` KVKK rozeti ham hex (`#d1fadf`/`#fef3c7`) yerine token
  sınıflarına (`status-sent`/`att-late`) çevrildi.

### Doğrulamalar

- typecheck ✅, lint ✅, build ✅, frontend **58/58** (11 dosya) ✅ (davranış
  testleri bozulmadı; ikonlar `aria-hidden`, arama/rozet metinleri korundu).
- Canlı (headless Chrome/CDP, gerçek app.db) **önce/sonra**: Haftalar,
  Öğrenciler, Raporlar. Hover'da satır zemini + sol accent şeridi; nav
  sekmeleri ikonlu; Öğrenciler arama kutusunda magnifier; Raporlar
  "Tamamlandı" mavi / "Taslak" gri dolgu.

### Ek düzeltme (onay sonrası)

- `StatusBadge`'de `completed` tekrar **maviye** (`status-completed`) alındı;
  `sent` yeşil kaldı — admin "gönderildi mi" ayrımını görsel olarak korur.
  Aynı nedenle digest `ready` rozeti de maviye çekildi.
- `AttendanceBadge` dört durumu ayrı renkte: Geldi=gri, Geç geldi=amber,
  Gelmedi=kırmızı, İzinli=mavi (`admin-badges.test.tsx` ile sabitlendi).
- `.admin-content` hover'ı yalnızca `AdminLayout` kapsamında; ReportEntryPage
  ve öğretmen dashboard'unda uygulanmıyor (canlıda `adminContent:false`).

### Etkilenen dosyalar

```
src/components/admin/ui.tsx             (Badge/StatusBadge/AttendanceBadge/PageTitle/EmptyState/SearchBox/PrimaryButton)
src/components/admin/AdminLayout.tsx    (sekme ikonları + admin-content)
src/index.css                           (.admin-content satır hover)
src/pages/admin/AdminDashboardPage.tsx  (Panel başlık ikonu, rozetler)
src/pages/admin/AdminReportsPage.tsx    (paylaşılan StatusBadge)
src/pages/admin/AdminReportViewPage.tsx (StatusBadge + AttendanceBadge + PageTitle)
src/pages/admin/DigestSendPage.tsx      (Badge + PageTitle + card-interactive)
src/pages/admin/AcademicYearsPage.tsx   (Aktif rozeti)
src/pages/admin/GuardiansPage.tsx       (KVKK rozeti token)
src/admin-badges.test.tsx               (rozet sözleşmeleri)
```

### Commit

Henüz commit edilmedi.

---

## Admin panel — kart/rozet/sekme iç tasarımı ✅

### Süreç özeti

`AdminDashboardPage` özet kartları, tam matris rozetleri ve sekme başlıkları
Stitch referansındaki gibi zenginleştirildi. Layout (üst sekmeli navigasyon,
kart sırası, sayfa genişliği), renk paleti ve compact/comfortable yoğunluk
kuralları değişmedi; yalnızca mevcut durum renkleri düz metin yerine dolgulu
rozet olarak kullanıldı. `lucide-react` ikonları eklendi (zaten bağımlılıktı).

### Yapılanlar

- Özet kartlarına sol üstte ikon: "Bu hafta tamamlanan" → `CheckCircle`,
  "Bekleyen gönderim" → `Send`, "Rapor arşivi" → `Archive`; `bg-accent/10`
  daire içinde `text-accent` ikon.
- Büyük sayı + küçük etiket hiyerarşisi: sayı `text-2xl` (24px), etiket `text-xs`
  ve soluk. (CLAUDE.md tip notu güncellendi: 24px artık admin özet kartındaki
  büyük sayıda da kullanılabilir.)
- Tam matris rozetleri: "Eksik" düz griden **amber dolguya** (`bg-amber/15
  text-amber`); "Gönderildi" ve "Tamamlandı" **yeşil dolguya** (`bg-green/15
  text-green`).
- Sekme başlıklarına ikon: Eksik raporlar → `AlertTriangle`, Tam matris →
  `Grid3x3`, Riskli öğrenciler → `AlertCircle`.

### Doğrulamalar

- typecheck ✅, lint ✅, build ✅, frontend **56/56** ✅ (davranış testleri
  bozulmadı; ikonlar `aria-hidden`, sekme erişilebilir adları değişmedi).
- Canlı (headless Chrome/CDP, gerçek app.db): özet kartlarında ikon + 24px sayı;
  "Tam matris" sekmesinde amber "Eksik" rozetleri; sekmelerde ikonlar.

### Etkilenen dosyalar

```
CLAUDE.md (tip ölçeği 24px notu)
PROGRESS.md
src/pages/admin/AdminDashboardPage.tsx
```

### Commit

Henüz commit edilmedi.

---

## Admin panel — elevation, hover, sekme geçişi, shimmer ✅

### Süreç özeti

CLAUDE.md "Tasarım kuralları"na Stitch referansından üç kural eklendi
(elevation seviyeleri, kart hover deseni, shimmer yükleme durumu) — renk
paleti, tipografi ve compact/comfortable yoğunluk kurallarına dokunmadan.
Yalnızca `AdminDashboardPage` bu yeni kelime dağarcığıyla zenginleştirildi.
Yeni rota, API çağrısı, veri alanı veya navigasyon değişikliği yok.

### Yapılanlar

**CLAUDE.md**
- `### Elevation (gölge)` — Level 0–4 token'ları, tek yerden.
- `### Kart hover deseni` — accent kenarlık + `translateY(-1px)` + Level 2 +
  `150ms cubic-bezier(0.4,0,0.2,1)`; yalnızca etkileşimli kartlarda.
- `### Shimmer yükleme durumu` — `#F0F4F8` ↔ `#E3E7EB`, 1.5s `linear` pulse.
- Erişilebilirlik notu: `prefers-reduced-motion` artık CSS geçiş/gölge/transform
  ve shimmer'ı da kapsıyor.

**index.css**
- `--elevation-1..4` (+`--backdrop-4`); `.elevation-1..4`, `.card-interactive`,
  `.shimmer` + `@keyframes shimmer`.
- `prefers-reduced-motion` bloğu: hover transformunu iptal eder (Level 1'e
  düşer), shimmer `animation: none` + statik `#F0F4F8`.

**AdminDashboardPage**
- Özet alanı üç karta dönüştü: "Bu hafta tamamlanan" (Level 1), "Bekleyen
  gönderim" ve "Rapor arşivi" (Level 1 + `.card-interactive` hover).
- Sekme içeriği `motion.div` ile yumuşak geçiş (0.18s); `useReducedMotion()`
  true iken animasyonsuz.
- Yükleme durumları `<LoadingState />` yerine shimmer iskelet blokları.
- Eksik rapor + riskli öğrenci tablo satırlarına `hover:bg-bg`.

### Doğrulamalar

**Statik** — typecheck ✅, lint ✅, build ✅.
**Testler** — frontend **56/56** (10 dosya) değişmeden geçti; davranış testleri
bozulmadı (framer-motion jsdom'da sorunsuz).

**Canlı (çalışan dev sunucusu + gerçek app.db, admin JWT, headless Chrome/CDP):**
- Önce/sonra: Level 1 gölgeli üç özet kartı (öncesi düz metin + iki link).
- Hover (CDP `forcePseudoState`): `transform: matrix(1,0,0,1,0,-1)`,
  `box-shadow: rgba(10,120,163,0.08) 0 4px 12px`, `transition: 0.15s`.
- Shimmer: `animation: shimmer / 1.5s`.
- **`prefers-reduced-motion: reduce` (CDP emülasyon):** `transform: none`,
  hover gölgesi Level 1'e düşüyor, `transition-duration: 1e-05s`, shimmer
  `animation: none`.

### Etkilenen dosyalar

```
CLAUDE.md
src/index.css
src/pages/admin/AdminDashboardPage.tsx
```

### Commit

Henüz commit edilmedi.

---

## Rapor giriş ekranı — compact + renk token düzeltmeleri ✅

### Süreç özeti

Öğretmen rapor giriş ekranında (projenin kalbi) dört UX/tasarım sorunu
giderildi: compact yoğunluğun gerçekten uygulanması, odak halkasının
doğrulanması, toplu puan davranışının netleştirilmesi ve renk token'larının
düzeltilmesi. Şema/backend değişikliği yok; tamamı frontend.

### Bulgular ve yapılanlar

**1. Compact yoğunluk gerçekten uygulandı**
- `index.css` `.compact` hücre dikey boşluğu `4px → 2px`; böylece h-8 (32px)
  input ile satır tam 36px. `.compact :is(input, select, textarea)` kuralına
  `vertical-align: middle` eklendi (inline-block kontrollerin baseline boşluğu
  satırı 41.5px'e şişiriyordu).
- `ReportEntryPage`: teslim rozeti alt satırdan tek satıra alındı (satırı
  şişiriyordu); üst alanlar `h-9/14px → h-8/13px`; section `p-4 gap-3 →
  p-3 gap-2`; sayfa `space-y-4 → space-y-2`; toplu doldurma çubuğu compact.
- Headless Chrome ölçümü (üretim CSS'i): satır **37.0px** (36px içerik + 1px
  collapsed border), tablo fontu **13px**, input **32px** — öncesi 51px.
- `CLAUDE.md` compact token bloğu güncellendi (2px dikey boşluk +
  vertical-align notu).

**2. Odak halkası doğrulandı**
- `:focus-visible` kuralı zaten doğru. Headless ölçüm: odaklanan input/select →
  `outline: 2px solid rgb(13,107,98)`, `outline-offset: -2px`,
  `:focus-visible` eşleşiyor. `outline-none`/`focus:ring` yok. Kod değişikliği
  gerekmedi; ekran görüntüsüyle görünürlük kanıtlandı.

**3. Toplu puan: iki ayrı alan**
- Tek kutu (ikisine aynı değeri yazıyordu) → **"Tümü ödev puanı"** ve
  **"Tümü ilgi puanı"** olmak üzere iki kutu + ayrı "Uygula"; devamsız/izinli
  satırlar atlanır. Etiket taşması `whitespace-nowrap` + blok düzen ile
  giderildi; mobil dokunma hedefleri 44px (`min-h-[44px] md:h-8`).
- `teacher.test.tsx`'e ayrım + devamsız-atlama testi eklendi.

**4. Renk token'ları**
- **Kök neden:** token renkleri `var(--x)` düz string olduğu için Tailwind
  `/5`, `/10`, `/30` opaklık sınıflarını üretmiyordu; tüm durum/devamsızlık
  rozetlerinin zemin tonu ve danger border'ı sessizce şeffaftı. Renkler kanal
  üçlüsüne (`--x: R G B`) çevrildi; `tailwind.config.js`
  `rgb(var(--x) / <alpha-value>)` desenine alındı. Doğrudan `var(--accent)`
  kullanan 3 sınıf `accent-accent` oldu.
- **`--danger` #B42318** (= attendance.absent) eklendi. `DangerButton` ve
  digest revoke butonu buna geçirildi; sistemde tek kırmızı tonu.
- Durum rozetlerinde `--accent` **ihlali yok** (kontrol edildi; "Rapor hazır"
  `status-completed` mavi kullanır). `attendance.present` **zaten** #5A6672
  nötr gri; değişiklik gerekmedi.
- `CLAUDE.md` renk bölümüne `--danger` eklendi.

### Doğrulamalar

**Statik** — root typecheck ✅, lint ✅, build ✅.
**Testler** — frontend **56/56** (10 dosya; +1 toplu puan testi).
**Headless Chrome (gerçek üretim CSS'i + tablo markup'ı):** satır 37.0px,
font 13px, üst input 32px/13px, odak halkası 2px #0D6B62; ekran görüntüsünde
rozet zeminleri, nötr gri "Geldi" ve kırmızı "Sil" danger butonu görünür.

### Etkilenen dosyalar

```
src/index.css                    (kanal üçlüsü token'lar + --danger, compact 2px + vertical-align)
tailwind.config.js               (rgb(var / <alpha-value>), danger)
src/components/admin/ui.tsx      (DangerButton → danger)
src/pages/teacher/ReportEntryPage.tsx  (compact, tek satır rozet, iki toplu puan)
src/pages/admin/DigestSendPage.tsx     (revoke → danger)
src/pages/admin/AdminDashboardPage.tsx ClassCoursesPage.tsx GuardiansPage.tsx (accent-accent)
src/teacher.test.tsx             (+1 toplu puan testi)
CLAUDE.md                        (compact token + --danger)
```

### Commit

Tek commit: rapor girişi compact yoğunluk ve renk token düzeltmeleri.

---

## Demo Öncesi Optimizasyonlar ✅

### Süreç özeti

Dershane yöneticisine yapılacak sunum öncesinde mevcut sistemdeki UX eksiklikleri
giderildi, seed verisi düzenlendi ve akıştaki hatalar düzeltildi. Şema değişikliği
yapılmadı; tüm değişiklikler uygulama katmanında kaldı.

### Yapılanlar

**1. KVKK `consent_at` alanı (Backend + Frontend)**
- `POST /admin/guardians` oluştururken `consent_at` desteği yoktu; yalnızca
  `PATCH` ile sonradan eklenebiliyordu.
- `backend/src/routes/admin.ts` — `PATCH /guardians/:id` handler'ına
  `consent_at` alanı eklendi: `true` gönderilirse `NOW()` yazılır, `false`
  gönderilirse `NULL` yapılır.
- `src/services/api.ts` — `guardians.patch` tipine `consent_at?: boolean` eklendi.
- `src/types.ts` — `Guardian` arayüzüne `consent_at: string | null` eklendi.
- `src/pages/admin/GuardiansPage.tsx` — veli listesine "KVKK Onayı" sütunu ve
  düzenleme formuna onay checkbox'ı eklendi; yeni veli oluşturma akışında onay
  işaretliyse `create` sonrası `PATCH` ile `consent_at` kaydediliyor.

**2. Seed verisi düzenleme**
- `backend/src/db/seed.ts` — Eklenmiş okulların sınıf kayıtlarından önce
  ekleneceği garanti altına alındı (FK sırası); tüm öğrencilere döngüsel olarak
  okul + sınıf seviyesi atandı; kullanılmayan `update` fonksiyonu kaldırıldı.
- Veritabanı (`app.db`) silindi ve `db:seed` ile yeniden oluşturuldu; öğrencilerin
  okul/sınıf seviyesi boş görünme sorunu giderildi.

**3. Öğrenci yönetimi — Düzenle modalı**
- `src/pages/admin/StudentsPage.tsx` — Öğrenci tablosuna "Düzenle" modalı eklendi
  (ad, okul, sınıf seviyesi, veli değiştirme). Tabloda `whitespace-nowrap` ve
  `overflow-x-auto` ile sütun taşma sorunları giderildi.

**4. Veli paneli routing**
- `src/pages/DashboardPage.tsx` — `guardian` rolü için giriş sonrası otomatik
  yönlendirme eklendi; veliler `/guardian` adresine doğrudan gönderiliyor.

**5. Navbar düzenleme**
- `src/components/layout/AppLayout.tsx` — Gereksiz "Ana sayfa" linki kaldırıldı;
  logo (`Dershane Ödev Takip`) tıklanabilir hale getirilerek ana sayfaya (`/`)
  yönlendirme sağlandı.

**6. Auth rate limit artırımı**
- `backend/src/routes/auth.ts` — Brute-force koruması 15 dk / 5 denemeden
  15 dk / 100 denemeye çıkarıldı; demo ve geliştirme sırasında hesap kilitlenmesi
  önlendi.

**7. Login yönlendirme düzeltmesi**
- `src/pages/LoginPage.tsx` — Farklı bir rol hesabından çıkıp başka bir hesapla
  giriş yapıldığında, `ProtectedRoute`'un bıraktığı `from` state'i (ör. `/teacher`)
  yeni kullanıcıyı yanlış sayfaya yönlendiriyordu.
- Çözüm: giriş sonrası gidilecek adres `/`, `/admin`, `/teacher`, `/student`,
  `/guardian` kök dizinlerinden biriyse her zaman `/` (DashboardPage) adresine
  yönlendiriliyor; derin linklerde (`/teacher/reports/...` gibi) mevcut davranış
  korunuyor.

**8. SearchBox state bağlama hatası**
- `src/pages/admin/TeachersPage.tsx`, `StudentsPage.tsx`, `GuardiansPage.tsx` —
  `<SearchBox>` bileşenine sabit `value={''}` atanmıştı; her tuş vuruşunda input
  sıfırlanıyordu.
- `useList` hook'undan dönen `q` değişkeni destructure listesine eklendi ve
  `value={q}` olarak bağlandı. Arama artık sorunsuz çalışıyor.

### Çözülen sorunlar

- **Öğrenci arama kutuları:** `value={''}` hardcode nedeniyle yazılan harfler
  anında siliniyor; `q` state'i bağlanarak çözüldü.
- **Login sonrası yanlış yönlendirme:** farklı rol hesapları arasında geçiş
  yapıldığında `from` state'i eski rolün sayfasını işaret ediyordu; kök adres
  kontrolüyle giderildi.
- **Demo 429 hatası:** tekrarlanan giriş denemelerinde rate limit (5) hızla
  doluyordu; limit 100'e çıkarıldı.
- **FK sırası (seed):** `schools` tablosu `students`'tan önce eklendiğinde FK
  ihlali oluşuyordu; ekleme sıraları düzeltildi.

### Commit'ler

- `898a215` — KVKK consent_at backend + frontend (GuardiansPage, api.ts, types.ts)
- `c714072` — Demo optimizasyonları (seed FK sırası, öğrenci düzenleme modalı, veli routing, navbar, rate limit, login yönlendirme, SearchBox düzeltmesi)

### Etkilenen dosyalar

```
backend/src
  /routes/admin.ts          (PATCH /guardians consent_at)
  /routes/auth.ts           (rate limit 5 → 100)
  /db/seed.ts               (FK sırası + okul/sınıf seviyesi atama)
src
  /pages/LoginPage.tsx      (kök adres yönlendirme koruması)
  /pages/DashboardPage.tsx  (guardian rol yönlendirmesi)
  /pages/admin/GuardiansPage.tsx  (KVKK sütun + checkbox + consent_at patch)
  /pages/admin/StudentsPage.tsx   (Düzenle modalı + overflow düzeltmesi + q state)
  /pages/admin/TeachersPage.tsx   (q state bağlama)
  /components/layout/AppLayout.tsx (logo link + Ana sayfa kaldırıldı)
  /services/api.ts          (guardians.patch tipi)
  /types.ts                 (Guardian.consent_at)
```

---

## Aşama 5 — Veli görünümü ve haftalık gönderim ✅

### Süreç özeti

Rapor `completed` olunca o sınıf+haftanın velisi olan aktif öğrencileri için
`pending` digest'leri açılır; sınıfın tüm ders raporları tamamlanınca aynı
kayıtlar `ready` olur (sınıf bazlı kontrol — karar 2). Admin "Haftalık
gönderim" ekranı pending/ready/sent satırlarını listeler, önizleme + "gönder
ve sonraki" akışıyla gönderir. Gönderimde yeni token üretilir, snapshot
dondurulur, send_count artar, wa.me linki açılır (popup engelleme deseni —
zorunlu düzeltme 2). **`reports.status='sent'` kaskadı** (zorunlu düzeltme 1)
aynı transaction'da çalışır: o sınıf+haftanın tüm digest'leri sent olunca
`completed` raporlar `sent` olur — §2 "sent düzenlenemez" kuralı fiilen devreye
girer. `/r/{token}` public sayfası snapshot'ı salt-okunur gösterir
(410: iptal/bilinmeyen token). Veli paneli öğrenci seçimi + tüm gönderilmiş
raporlar + detay/teslim geçmişi içerir. Admin paneline (spec §5.5) özet +
eksik rapor listesi + tam matris + **"Tüm raporlar" sekmesi** eklendi — admin'in
"tüm raporları görme" hakkının karşılığı: durum/sınıf/hafta filtresi + satıra
tıklayınca salt-okunur içerik.

### Yapılanlar

**Spec (kural #3/#4 — kapsam genişletme onaylandı)**
- spec.md §5.4: gönderim öncesi **KVKK kontrolleri** (whatsapp_phone yok →
  409 "Veli için WhatsApp numarası tanımlı değil."; consent_at yok → 409
  "Velinin KVKK açık rızası alınmamış." — iki ayrı mesaj, karar 1);
  **`reports.status='sent'` kaskadı** (ayrı istek değil, send transaction'ının
  içinde); **popup engelleme deseni** (senkron boş sekme → send yanıtı gelince
  location.href; hata → sekme kapat; engellendiyse kopyalanabilir link).
- spec.md §5.5: **"Tüm raporlar" görünümü** — eksik listesinin yanında ikincil
  sekme, durum/sınıf/hafta filtresi, satıra tıkla → salt-okunur.
- spec.md §6 Admin ekranları güncellendi.

**Backend**
- `services/digests.ts` (yeni): `ensurePendingDigests` (INSERT OR IGNORE,
  velisiz öğrenciye digest açılmaz), `maybeReadyDigests` (sınıf bazlı),
  `buildSnapshot` (yalnızca o öğrencinin satırı — KVKK veri minimizasyonu),
  `maybeCascadeSent` (transaction içinden çağrılır), `newDigestToken`
  (randomBytes(32).base64url — UUID değil), `classIdForStudentAtWeek`.
- `teacher.ts`: `POST /reports/:id/complete` sonrası digest tetikleme
  (pending + maybeReady); `GET /reports/:id` salt-okunur (öğretmen kendi,
  admin tümü); `GET /reports` filtreleri (`class_id`, `week_id`).
- `routes/public.ts` (yeni, auth'suz): `GET /public/digests/:token` —
  snapshot döner; bilinmeyen / is_revoked / sent olmayan → **410 GONE** (aynı
  mesaj, varlık sızmaz).
- `admin.ts`: `GET /admin/digests` (pending+ready+sent, sınıf/status filtresi,
  eksik ders sayısı, token sızmaz), `GET /digests/:id/preview`,
  `POST /digests/:id/send` (KVKK 409'lar + yeni token + snapshot +
  send_count+1 + **maybeCascadeSent aynı tx** + wa.me linki + audit
  digest.send/resend), `POST /digests/:id/revoke` (yalnızca sent → 409,
  audit digest.revoke); `GET /admin/dashboard` (özet "N rapordan M'si
  tamamlandı", eksik listesi is_overdue sıralı, tam matris, digest sayaçları).
- `routes/guardian.ts` (yeni): `GET /students` (kendi çocukları),
  `GET /reports?student_id=` (yalnızca sent; sınıf adı snapshot'tan),
  `GET /reports/:id` (snapshot + ödev teslim geçmişi). Sahiplik: başka
  velinin öğrencisi → 404. `token` dışarı dönmez.
- `routes/index.ts`: public + guardian mount.

**Frontend**
- `components/ReportSnapshot.tsx` (yeni): snapshot'ı salt-okunur render eder
  (hem `/r/{token}` hem veli detayı kullanır).
- `TokenReportPage` yeniden yazıldı: 200 → snapshot; 410 → "Bu rapor artık
  geçerli değil."
- `pages/guardian/GuardianHomePage` (öğrenci seçimi + rapor listesi) +
  `GuardianReportDetailPage` (snapshot + teslim geçmişi + dosya butonları).
- `pages/admin/AdminDashboardPage` (panel: özet + eksik + matris sekmesi +
  öğretmene göre gruplama + gönderim sayacı), `AdminReportsPage` (filtreli
  tüm raporlar), `AdminReportViewPage` (salt-okunur), `DigestSendPage`
  (önizleme + **boş sekme deseniyle** gönder + revoke).
- `AdminLayout` TABS: Panel (index), Eğitim yılı (`/admin/academic-years`),
  Raporlar, Gönderim. `App.tsx` rotalar, `AppLayout` veli "Raporlarım" linki.
- `types.ts` + `services/api.ts`: digest/snapshot/dashboard/guardian tipleri
  ve `publicApi`/`guardianApi`/`adminApi.digests`/`teacherApi.getReport`.

**Testler**
- Backend: `digests.test.ts` (pending/ready/idempotent), `public.test.ts`
  (200 + 3 × 410), `admin-digests.test.ts` (list/preview/send/KVKK 409'lar/
  **kaskad**/re-send/revoke → 410), `admin-dashboard.test.ts` (salt-okunur
  rapor yetki matrisi + dashboard özet/eksik/matris/sayaçlar),
  `guardian.test.ts` (öğrenci listesi, yalnızca sent, sahiplik 404, detay +
  teslim geçmişi).
- Frontend: `token-report.test.tsx` (200/410/hata), `guardian.test.tsx`
  (öğrenci seçimi, tek çocuk otomatik seçim, boş durum, detay + teslim
  geçmişi), `App.test.tsx` admin panel düzeltmesi.

### Doğrulamalar

**Statik** — root + backend `typecheck` ✅, `lint` ✅, `build` ✅.

**Testler** — backend **175/175** (16 dosya), frontend **39/39** (6 dosya).

**Canlı (gerçek app.db, `db:reset` sonrası, çalışan sunucu) — adım adım:**
1. admin + `ogretmen1` girişi ✅; `GET /teacher/dashboard` → week 20, 9 kayıt.
2. `seed-class-course-001-1` raporu doldur + tamamla → `completed`.
3. `GET /admin/digests` → 6 `pending` (EURİST, missing 3/4) ✅;
   `GET /admin/dashboard` → summary 1/100, missing 99, digests 6 pending ✅.
4. 6 digest'in tamamı gönderildi → `sent_count=1`, `wa.me` URL'leri geçerli ✅.
5. **Kaskad:** `GET /teacher/reports/:id` → rapor durumu **`sent`** ✅
   (completed → sent, tüm digest'ler gönderilince).
6. `GET /public/digests/{token}` → 200, 4 ders, ilk ders completed ✅.
7. `GET /teacher/reports/:id` (admin, salt-okunur) → 200, 6 satır ✅.
8. `veli1` girişi → `GET /guardian/students` 2 çocuk ✅ →
   `GET /guardian/reports` 1 sent rapor ✅ → detay: 4 ders + 1 teslim ✅.
9. **Revoke:** is_revoked=true → aynı token `/public` → **410** ✅.
10. Temizlik: `db:reset` → temiz seed; backend dev sunucu yeniden başlatıldı.

### Çözülen sorunlar

- **PowerShell mojibake (tekrar):** `admin-digests.test.ts` ve
  `admin-dashboard.test.ts`'i `Set-Content` ile düzenlerken UTF-8 Türkçe
  karakterler bozuldu (belgelenen kural); dosyalar edit/write aracıyla
  (UTF-8 güvenli) yeniden yazıldı. **Kod/dosya içerik değişikliklerinde
  PowerShell kullanılmaz.**
- **`window.open` engeli (zorunlu düzeltme 2):** send async olduğu için
  popup, kullanıcı jesti dışına düşüyordu. Desen uygulandı: tıklama anında
  senkron `window.open('','_blank')`, yanıt gelince `location.href=wa_me_url`;
  hata → `close()`; null sekme → kopyalanabilir link butonu.
- **Kaskad (zorunlu düzeltme 1):** ilk plan taslağında gözden kaçmıştı; send
  handler'ının transaction'ına `maybeCascadeSent` eklendi ve "tüm digest'ler
  sent değilse kaskad tetiklenmez" + "hepsi sent olunca completed→sent" test
  edildi.
- **Fake timers + audit sıralaması:** `created_at` aynı olduğundan
  `ORDER BY created_at DESC` belirsizdi → audit sorgularına `rowid DESC`
  tiebreaker eklendi.
- **wa.me formatı:** numarada `+` tutuluyordu; `wa.me` rakam bekler →
  `replace(/\D/g,'')` uygulandı.
- **Test helper'ı:** `completeReport` `created.body.report.id` yerine
  `created.body.id`'yi alıyordu → URL `/reports/undefined/...` → 404; düzeltildi.
- **Canlı giriş brute-force:** tekrarlanan scripted admin girişleri 15 dk
  penceresini aşınca 429; canlı revoke doğrulaması imzalı JWT ile yapıldı
  (jwt.sign, DB'den tv) — uygulama kodu değil, doğrulama yöntemi.

### Commit'ler

- `2e919ed` — spec.md: KVKK 409'lar, sent kaskadı, popup deseni, §5.5 Tüm
  raporlar, §6 Admin
- `310a0e0` — digest tetikleme (services/digests.ts + complete hook + testler)
- `74df016` — public token endpoint (410) + testler
- `603e067` — admin gönderim uçları (send + kaskad + revoke + audit) + testler
- `7f22748` — GET /teacher/reports/:id + GET /admin/dashboard + testler
- `4101ab4` — veli paneli uçları + testler
- `9cc29f9` — frontend (public sayfa, veli paneli, admin panel/reporlar/
  gönderim, rotalar) + testler
- `05a2a7d` — GET /teacher/reports filtreleri + lint düzeltmeleri

### Bitti kriteri

**Koşul:** Koordinatör tek ekrandan bir sınıfın tüm velilerine gönderim
yapabiliyor; veli linke tıklayınca haftanın 4 dersini birlikte görüyor.
**Sonuç:** ✅ canlı adım 3-9 ile kanıtlandı (gönderim akışı, `/r` sayfası,
veli paneli, iptal sonrası 410).

### Güncel dosya yapısı (Aşama 5 ekleri)

```
backend/src
  /services/digests.ts              (yeni — pending/ready/snapshot/cascade)
  /routes/public.ts                 (yeni — /public/digests/:token, 410)
  /routes/guardian.ts               (yeni — veli paneli)
  /routes/teacher.ts                (+ complete digest tetikleme, GET /reports/:id, filtreler, sayfalama)
  /routes/admin.ts                  (+ digests list/preview/send/revoke + dashboard)
  /routes/index.ts                  (+ public, guardian mount)
  digests.test.ts public.test.ts admin-digests.test.ts admin-dashboard.test.ts guardian.test.ts (yeni)
/src
  /components/ReportSnapshot.tsx    (yeni — salt-okunur snapshot render)
  /pages/TokenReportPage.tsx        (yeniden yazıldı — snapshot + 410)
  /pages/guardian/GuardianHomePage.tsx GuardianReportDetailPage.tsx   (yeni)
  /pages/admin/AdminDashboardPage.tsx AdminReportsPage.tsx
      AdminReportViewPage.tsx DigestSendPage.tsx                     (yeni)
  /components/admin/AdminLayout.tsx (+ Panel/Raporlar/Gönderim sekmeleri)
  /pages/admin/AcademicYearsPage.tsx → /admin/academic-years taşındı
  App.tsx AppLayout.tsx types.ts services/api.ts  (+ rotalar, tipler, API'ler)
  token-report.test.tsx guardian.test.tsx admin-digests.test.tsx admin-reports.test.tsx (yeni)
spec.md   (§5.4 KVKK/kaskad/popup, §5.5 Tüm raporlar, §6 Admin)
```

### Ek — seed gerçek dershane yapısına küçültüldü (Aşama 5 sonrası)

Aşama 5 sonrası seed, gerçek dershane desenine oturtuldu (önceki ~200 öğrenci /
25 sınıf ölçeğinden küçültüldü):
- **8 sınıf:** ÖKLİD, PİSAGOR, SEVA, FERMAT, AZİZ SANCAR, ALİ KUŞÇU, CAHİT ARF, BİRUNİ.
- **5 sabit ders:** Cebir, Geometri, Problem Çözme, Fonksiyonlar, Sayılar.
- **5 öğretmen:** her biri tek derse sabit, o dersi 8 sınıfta verir → **40 class_courses**.
- **Sabit ders günü:** Cebir=Pazartesi … Sayılar=Cuma (tüm sınıflarda aynı).
- **40 öğrenci (sınıf başına 5) + 40 veli.** Senaryolar küçük ölçekte korundu:
  kardeş (veli 1-2 × 2 çocuk: öğrenci 1&41, 2&42), sınıf değişikliği (öğrenci 3:
  week 10 başında sınıf 1 → sınıf 4).
- **Kesin sayılar:** users 88, students 42, guardians 40, classes 8, courses 5,
  class_courses 40, enrollments 43, weeks 21, reports 45, report_entries 235,
  homeworks 45.
- `schema.test.ts`: hacim beklentileri yeni sayılara çekildi + "öğretmen × ders ×
  gün" ve "sınıf başına 5 ders" yapı testleri eklendi.
- Doğrulama: backend 179/179, frontend 46/46, typecheck/lint/build ✅; canlıda
  `ogretmen1` (Cebir) 8 sınıfta listelendi ve ÖKLİD (4 — öğrenci 3 taşındı) +
  AZİZ SANCAR (5) raporları gerçekten doldurulup `completed` yapıldı.

---

## İyileştirmeler — 5 maddelik plan (Aşama 5 sonrası) ✅

### Süreç özeti

Beş bağımsız iyileştirme onaylandı ve uygulandı. **4 ve 5 tek şema
değişikliği** (migration #6), 1-3 mevcut tablolara dokunmadı ya da yalnızca
uygulama katmanında kaldı.

### Yapılanlar

**Migration #6 (`schools_grade_view`)**
- `schools` (id, name, name_normalized, deleted_at) + kısmi UNIQUE — `classes`/
  `courses` deseninin birebir kopyası. Arayüzde **"Okul"** (asla "sınıf" —
  `classes` ile karışmaz, spec §3.1 terim uyarısı).
- `students.school_id` (FK) + `students.grade_level` (CHECK: 1..12, Hazırlık,
  Mezun) — trend grafikleri için normalize edilmiş veri; grafikler kapsam dışı.
- `weekly_digests.first_viewed_at` + `last_viewed_at` (görüntüleme takibi;
  ayrı log tablosu yok).

**1. Veli paneli filtreleme (hafta + ders)**
- `GET /guardian/reports` satırlarına `relative_week_no` (görece hafta etiketi)
  + `courses` (ders bazlı filtre) eklendi. **"İlk aktif hafta" enrollment
  bazlı** (kullanıcı kararı): o sınıfın en erken `enrollments.start_date`'inin
  düştüğü haftanın `week_no`'su — rapor durumuna dayanmaz, rapor doldurulmamış
  hafta etiketi kaydırmaz. Mutlak `week_no` sıralaması ve due_date/prev_homework
  hesabı değişmedi. GuardianHomePage'e hafta + ders dropdown'ları (gösterim
  katmanı filtre).

**2. Admin eksik raporlar sayfalama**
- `GET /admin/dashboard/missing` — `utils/pagination.ts` deseni
  (`parsePagination` + `paged`); `is_overdue` JS'te önce hesaplanıp sıralanır
  (günü geçen üstte, sayfalama kararlı). Dashboard özeti/matris/sayaçlar ayrı
  kaldı.

**3. Veritabanı yedeği**
- `npm run db:backup` (scripts/backup.ts) — `VACUUM INTO` (tutarlı, WAL güvenli)
  + uploads → tek .zip (`backend/backups/`, gitignore'landı). `adm-zip` eklendi.
- `POST /admin/backup` (adminOnly) — CLI'ı `child_process` ile spawn eder
  (DatabaseSync senkron kuralı: yedek sunucu isteği içinde değil), `res.download`;
  BACKUPS_DIR path guard. Admin panelde "Yedek indir" butonu (blob indirme).

**4. Veli görüntüleme takibi**
- `markDigestViewed(digestId)` — `first_viewed_at = COALESCE(first_viewed_at,
  now)`, `last_viewed_at = now`. `/r/{token}` (public) ve `/guardian/reports/:id`
  (girişli) görünümlerinde çağrılır. **Bot önizleme atlaması** (ek not):
  `User-Agent`'ta WhatsApp/facebookexternalhit/telegrambot/slackbot/linkedinbot/
  twitterbot/discordbot/skypeuripreview vb. imzaları varsa yazma atlanır (sayfa
  yine 200). Admin digest listesinde "Görüntülendi: 3 Şub" / "Henüz
  görüntülenmedi".

**5. Okul + sınıf seviyesi**
- Okullar CRUD (`/admin/schools`: normalized arama, 409, öğrenci koruması) +
  admin "Okullar" sayfası/sekmesi. Öğrenci create/patch `school_id` (FK
  doğrulama) + `grade_level` (zod enum); listede "Okul" + "Sınıf seviyesi"
  sütunları; formda okul seçici + **hızlı okul ekleme**.

**Testler:** schools CRUD + öğrenci okul/seviye (backend +4), migration-backfill
#6 rewind (user_version 6), görüntüleme takibi (public bot/normal + guardian +
admin list), guardian relative-week/courses, missing sayfalama, `createBackup`
birim, GuardianHomePage filtreler, DigestSendPage görüntülenme sütunu.

### Doğrulamalar

**Statik** — root + backend typecheck ✅, lint ✅, build ✅.
**Testler** — backend **191/191** (17 dosya), frontend **48/48** (8 dosya).
**Canlı (db:reset + çalışan sunucu):**
1. `user_version = 6`; `schools` + students/weekly_digests yeni kolonlar ✅.
2. Okul oluştur → öğrenciye `school_id` + `grade_level='8'` → listede `school_name` ✅; aynı ad (normalized) → **409** ✅.
3. Rapor tamamla → digest gönder → `/r` normal UA → `last_viewed_at` SET;
   **WhatsApp UA → 200 ama yazma YOK** (NULL) ✅.
4. `GET /admin/dashboard/missing?pageSize=5` → 39 kayıt, sayfalar 5/5 ✅;
   admin digest listesinde first/last_viewed ✅.
5. `npm run db:backup` → `dershane-yedek-*.zip` (uploads + veritabani/app.db) ✅;
   `POST /admin/backup` → `200 application/zip` + attachment; öğretmen → 403 ✅.
6. Temizlik: `db:reset` → temiz seed; backend dev sunucu yeniden başlatıldı.

### Çözülen sorunlar

- **Test DB kalıntısı:** `schools` CLEAN_TABLES'da yoktu; önceki koşudan kalan
  satırlar sonraki koşuda 409/404 üretiyordu → test/helpers.ts + schema.test.ts
  temizlik listelerine `schools` eklendi (2 ardışık tam koşuyla doğrulandı).
- **Shell mojibake (canlı doğrulamada):** PowerShell'den Türkçe karakterli
  JSON (`Atatürk`) bozuldu → yanlış 201; uygulama hatası değil, shell
  kodlaması (testteki `Örnek Okul 7` 409'u gerçek mantığı kanıtlar).
- **ALTER DROP COLUMN (FK/CHECK):** migration-backfill rewind'inde
  `students.school_id` (FK) ve `grade_level` (CHECK) drop edilebildiği doğrulandı
  (SQLite davranışı), `user_version` 6.

### Commit'ler

- `4cba8e8` — spec + migration #6 + backfill rewind
- `b53d04f` — okullar CRUD + öğrenci school_id/grade_level
- `1ba72bd` — görüntüleme takibi + bot UA atlaması
- `84b0231` — veli görece hafta + ders listesi + CLEAN_TABLES düzeltmesi
- `2e661ca` — eksik rapor sayfalama + yedek (CLI + endpoint + buton)
- `7d6e2a8` — frontend (Okullar sayfası, öğrenci formu, veli filtreleri,
  görüntülenme sütunu)

---

## Atama takası + öğretmen atamalarını devretme ✅

### Süreç özeti

İki ilişkili özellik: (1) iki `class_courses` kaydının öğretmenlerini tek
işlemde takas etmek (sınıflar arası dahil), (2) ayrılan öğretmenin tüm
atamalarını tek hedef öğretmene devredip ardından silmesini mümkün kılmak
("önce devret, sonra sil"). İkisi de yalnızca `class_courses.teacher_id`
günceller → **şema değişikliği/migration yok** (teyit edildi).

**Bilinçli tasarım kararı (spec §2'ye işlendi):** geçmiş raporlar atamayı
(kişiyi değil) izler — takas/devir sonrası yeni öğretmen o atamanın geçmiş
raporlarını görür/düzenler, eski öğretmen kendi listesinden erişemez. "Yan
etki" değil, tasarımın parçasıdır.

### Yapılanlar

**Backend (`admin.ts`)**
- `POST /admin/class-courses/swap` `{ cc_id_a, cc_id_b }`: aynı atama → 400;
  var olmayan/silinmiş atama → 404; öğretmenler `role='teacher'` + silinmemiş
  değilse → 400; aynı öğretmene ait iki atama → 409. **Tek transaction**'da
  takaslı `UPDATE`; per-atama audit (`class_course.teacher_reassign`,
  `diff { from_teacher_id, to_teacher_id }`).
- `POST /admin/teachers/:id/transfer-assignments` `{ target_teacher_id }`:
  kaynak/hedef `role='teacher'` + silinmemiş; hedef=kaynak → 409; kaynağın 0
  ataması → 409. **Tek transaction**'da tüm `class_courses` devredilir;
  per-atama audit. Devir sonrası `DELETE /admin/teachers/:id` 409 → 204.

**Frontend**
- `ClassCoursesPage`: **sınıf filtresi kaldırıldı**, tüm atamalar tek listede
  (Sınıf sütunu eklendi), isim araması (sınıf/ders/öğretmen) — sayfalama
  YOK (40-50 satır; sayfa kapsamlı seçim çapraz sınıf takasını bozardı).
  Satır checkbox'ları; tam 2 satır seçilince "Yer değiştir" aktifleşir, aynı
  öğretmen engeli satır altında gösterilir. Forma "Sınıf" seçici eklendi
  (eskiden sayfa filtresinden geliyordu).
- `TeachersPage`: satırda "Atamaları devret" → modal (kaynağın atama sayısı +
  hedef öğretmen dropdown, kaynak hariç) → transfer → liste yenilenir.

**Spec**
- §2: bilinçli tasarım kararı (atama kişiden bağımsız).
- §6 Admin: Atamalar (filtresiz + arama + "Yer değiştir"), Öğretmenler'e
  "atamaları devret".
- §7.2: **soft-delete üç mekanizması** notu (`deleted_at` soft delete /
  `enrollments` tarihli geçerlilik / `weeks` korumalı + `weekly_digests.is_revoked`
  + immutable rapor/audit).

**Testler:** backend swap (çapraz sınıf takas + audit, aynı atama 400, aynı
öğretmen 409, 404), transfer (devir öncesi sil 409, reassigned, kaynak 0,
sil 204, 0 atama 409, hedef=kaynak 409, hedef yok 404); frontend
`admin-swap.test.tsx` (seçim + swap çağrısı + aynı öğretmen engeli + devir
modalı).

### Doğrulamalar

**Statik** — root + backend typecheck ✅, lint ✅, build ✅.
**Testler** — backend **195/195** (17 dosya), frontend **52/52** (9 dosya).
**Canlı (db:reset + çalışan sunucu):**
1. Çapraz sınıf takas: ÖKLİD Cebir (Örnek Kişi 5) ↔ PİSAGOR Geometri (Mehmet
   Demir) → öğretmenler değişti; rapor görünümünde yeni öğretmen ✅.
2. `cc_id_a === cc_id_b` → **400** ✅.
3. Audit: `class_course.teacher_reassign` 2 satır, `diff from/to` doğru ✅.
4. Devir: öğretmen 5 (Sayılar, 8 atama) → öğretmen 2; silme **önce 409,
   sonra 204**; kaynak 0, hedef +8; devir audit 8 ✅.
5. Temizlik: `db:reset` → temiz seed; backend dev sunucu yeniden başlatıldı.

### Commit'ler

- `c8b944b` — backend swap + transfer + spec (bilinçli karar, §6, §7.2 soft-delete notu) + testler
- `7fa9f93` — frontend (Atamalar filtresiz + arama + Yer değiştir; Öğretmenler devir modalı) + testler

---

## İç hatırlatma + riskli öğrenci listesi ✅

### Süreç özeti

İki Aşama 6 iyileştirmesi. (1) **İç hatırlatma:** öğretmen dashboard'undaki
mevcut "ders günü geçmiş taslak" bilgisi görünürleştirildi — üstte sayaç
banner'ı + gecikmiş kart vurgusu; WhatsApp/SMS yok, arka plan mekanizması yok.
(2) **Riskli öğrenci listesi:** admin panelinde yeni sekme; mevcut
`report_entries`/`submissions` verisi üzerinden (şema değişikliği gerekmedi).

**Kararlar (kullanıcı onayı):** son 3 hafta penceresi; üç kriter — herhangi
biri tetiklerse riskli (OR); eşikler kod içinde sabit, **`backend/src/
constants.ts` tek dosyada**. Eşik tanımları: ortalama(ödev+ilgi) ≤ 4; verilen
ödevlerden ≥ 2'si teslim edilmemiş (ardışık şart yok); ARDIŞIK ≥ 2 hafta
`absent` (`excused` hiç sayılmaz). `risk_flags` ayrı rozet olarak gösterilir
(tek "riskli" etiketi yeterli değil).

### Yapılanlar

**Backend**
- `constants.ts` (yeni): `RISK = { lookbackWeeks: 3, avgScoreThreshold: 4,
  missingSubmissionMin: 2, consecutiveAbsenceMin: 2 }` + `RISK_FLAGS` — eşikler
  tek yerden, ileride ayarlanabilir yapılacaksa yalnızca bu dosya değişir.
- `GET /teacher/dashboard` → `overdue_count` (mevcut `is_overdue`'dan; arka
  plan mekanizması yok).
- `GET /admin/dashboard/risk` (adminOnly): aktif yılın son 3 haftası; üç kriter
  OR. Yalnızca `completed`/`sent` raporlar (taslaklar sayılmaz), absent satırlar
  ortalamaya girmez; teslim hesabı öğrencinin o hafta sınıfındaki verilen
  ödevler üzerinden. Yanıt: `{ weeks, items: [{ student_id, student_name,
  class_name, school_name, grade_level, risk_flags, avg_score,
  missing_submission_count }] }`.

**Frontend**
- `TeacherDashboardPage`: `overdue_count > 0` iken üstte amber banner
  "Bu hafta N raporunuz gecikti"; gecikmiş kartlar `bg-att-late/5` ile belirgin.
- `AdminDashboardPage`: "Riskli öğrenciler" sekmesi (tembel yüklenir) — son
  3 hafta özeti, öğrenci/sınıf/okul/sınıf seviyesi + **ayrı** risk neden
  rozetleri (Düşük ortalama / Teslim etmeme / Devamsızlık), boş durum.

**Spec** — §6 Öğretmen (iç hatırlatma banner'ı) + Admin (riskli öğrenci listesi,
kriter tanımları, constants tek dosya notu).

**Testler:** backend risk (4 öğrenci fixture: düşük ortalama / teslim etmeme /
ardışık devamsızlık / temiz; OR + ayrı risk_flags, temiz öğrenci listede yok,
403); frontend banner (var/yok) + risk sekmesi (yükleme + rozetler + boş durum).

### Doğrulamalar

**Statik** — root + backend typecheck ✅, lint ✅, build ✅.
**Testler** — backend **197/197** (17 dosya), frontend **55/55** (10 dosya).
**Canlı (db:reset + çalışan sunucu):** öğretmen dashboard `overdue_count` > 0
(temiz seed'de gecikmiş taslaklar) ✅; `GET /admin/dashboard/risk` 200 → son 3
hafta (week 19/20/21) öğrencileri, risk_flags ayrı; `db:reset` ile temizlik.

### Commit'ler

- `0bbf239` — backend (constants + overdue_count + risk endpoint + testler)
- `03ba4d9` — frontend (banner + risk sekmesi + testler)

---

## Seed — son özellikleri gösteren demo verisi ✅

### Süreç özeti

`seed.ts`, son eklenen dört özelliği taze `db:reset`'te canlı gösterecek
verilerle zenginleştirildi — **kasıtlı senaryolar, rastgele değil.** Mevcut
yapı korundu (8 sınıf, 5 ders, 5 öğretmen, 40 öğrenci + kardeş + sınıf
değişikliği senaryoları). Rapor/entry/homework sayıları DEĞİŞMEDİ (45/235/45):
sınıf 1'in 5 dersi week 19 (3 ders) + week 20 (2 ders) arasında bölündü —
toplam 38 + 2 + 5 (week 8) = 45.

### Yapılanlar

**1. Okul + sınıf seviyesi (kademeli)**
- 4 okul (`seed-school-001..004`): Örnek Okul 1, Örnek Okul 5,
  Örnek Okul 4, Örnek Okul 6 — `classes`/`courses` deseniyle.
- Öğrenci 1..20'ye dönüşümlü okul + sınıf seviyesi (`6..10`) atandı;
  21..42 **null** kaldı. Fill-gaps deseni (`UPDATE ... AND school_id IS NULL`)
  → idempotent.

**2. Risk senaryoları (sınıf 1 = ÖKLİD, week 19 + 20)**
- `RISK_ENTRY_OVERRIDES` + `MISSING_SUBMISSION_STUDENTS` sabitleri; varsayılan
  satır puanları formülden güvenli 7/8'e çekildi (yanlış eşik tetiklenmesin).
- 001 → düşük ortalama (puan 2) · 002 → teslim etmeme (5/5 eksik) ·
  004 → ardışık absent (week 19 **ve** 20) · 005 → çift: düşük ortalama (3) +
  teslim etmeme. Geri kalan her öğrenci teslim eder → risk listesi **tam 4**.
- Teslimler: window (week 19+20) ödevlerine toplu `INSERT OR IGNORE`
  (yalnızca 002/005 atlanır) — ~200 deterministik satır.

**3. Gecikme banner'ı**
- week 20'de yalnızca sınıf 1'in 2 dersi dolu; kalan 38 week-20 ataması boş →
  `ogretmen1` `overdue_count = 8` (banner taze seed'de görünür).

**4. Digest görüntüleme durumu**
- 4 `sent` digest (week 19, gerçek `buildSnapshot`): 006/011
  `first_viewed_at` + `last_viewed_at` dolu, 007/012 null → admin "Görüntülendi"
  sütununda iki durum.

**Deterministik id + INSERT OR IGNORE korundu;** `schema.test.ts` idempotency
listesine `schools`/`submissions`/`weekly_digests` eklendi.

### Çözülen sorunlar

- **resetDb FK sırası:** `CLEAN_TABLES`'ta `schools` öğrencilerden önce
  siliniyordu; 20 öğrencide `school_id` FK referansı artınca `DELETE FROM
  schools` FK ihlali fırlattı (tam pakette 11 suite patladı). `schools`,
  `students`'tan SONRA silinecek şekilde sıra düzeltildi (`test/helpers.ts` +
  `schema.test.ts`).
- **Stale test.db:** schema.test'in dolu bıraktığı test.db üzerinde ardışık
  tam koşu hata verdi; taze test.db + sıralı paket ile doğrulandı.

### Doğrulamalar

**Statik** — root + backend typecheck ✅, lint ✅, build ✅.
**Testler** — backend **198/198** (17 dosya; schema.test'e +1: "Aşama 6 seed"),
frontend **55/55** (10 dosya). `schema.test.ts`: rapor 45 / entry 235 /
homeworks 45 **korundu**; week 19 completed 38 + week 20 2; okul atanan 20 /
null 22; teslimler > 0 ve 002/005 sıfır; digest viewed 2 + not_viewed 2.

**Canlı (db:reset + çalışan sunucu):**
1. Okul/seviye: 4 okul; admin öğrenci listesinde 20/42 okullu, öğrenci 21 null ✅.
2. Risk: pencere H19/H20/H21 → tam 4 öğrenci: 001 `[low_score]` avg 2 ·
   002 `[missing_submission]` 5/5 · 004 `[consecutive_absence]` ·
   005 `[low_score + missing_submission]` avg 3 · gerisi risk-free ✅.
3. Banner: `ogretmen1` `overdue_count = 8` ✅.
4. Digest: `GET /admin/digests?status=sent&week_id=seed-week-19` → 4 satır,
   2 görüntülenmiş + 2 değil; `/r/seed-token-006` → 200, PİSAGOR 5 ders ✅.
5. Temizlik: `db:reset` → temiz seed; backend dev sunucu yeniden başlatıldı.

### Commit

`847f33f` — seed: okullar + risk senaryoları + teslimler + digest görüntülenme
+ resetDb FK sırası + schema.test (schools/submissions/digests + week 19/20)

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