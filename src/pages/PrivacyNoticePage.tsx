/**
 * Gizlilik ve Aydınlatma Metni — public sayfa (`/gizlilik`).
 *
 * spec.md §9: metin giriş ekranında ve `/r/{token}` sayfasının altında
 * bağlantılıdır; her ikisi de bu tek sayfaya gelir (içerik tek kaynaktan).
 *
 * Kapsam: **yalnızca bilgilendirme/şeffaflık katmanıdır.** Çerez, izleme veya
 * ayrı bir onay/rıza akışı KURMAZ; veli kaydındaki `consent_at` mekanizması
 * ayrıdır ve değişmez. Şema/DB/API dokunulmaz.
 *
 * Metin bu dosyada tutulur (tek kaynak); iletişim alanlarındaki `[KÖŞELİ
 * PARANTEZ]` değerler kurum tarafından doldurulacaktır.
 */

import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';

function goBackOrLogin(navigate: ReturnType<typeof useNavigate>): void {
  // Doğrudan açıldıysa (bookmark/WhatsApp) geri gidilecek sayfa olmayabilir.
  if (window.history.length > 1) navigate(-1);
  else navigate('/login');
}

export default function PrivacyNoticePage() {
  const navigate = useNavigate();

  return (
    <div className="customer-face brand-canvas min-h-screen">
      {/* Public marka başlığı — /r/{token} sayfasıyla aynı görsel dil. */}
      <header className="brand-panel relative overflow-hidden">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/15"
        />
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 text-center lg:max-w-4xl">
          <span className="rounded-2xl bg-surface p-3 shadow-[var(--elevation-3)]">
            <BrandLogo className="h-14 w-auto object-contain" />
          </span>
          <p className="text-lg font-semibold tracking-wide text-accent-fg">
            ÖDEV TAKİP
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 lg:max-w-3xl">
        <h1 className="text-xl font-semibold text-text">
          Gizlilik ve Aydınlatma Metni
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Bu metin, Ödev Takip tarafından işletilen ödev takip
          sisteminde kişisel verilerinizin 6698 sayılı Kişisel Verilerin
          Korunması Kanunu ("KVKK") kapsamında nasıl işlendiğini
          açıklamaktadır.
        </p>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-text">İşlenen veriler</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text">
            <li>Öğrenci ve veli ad-soyad bilgisi</li>
            <li>Telefon numarası (yalnızca veli — WhatsApp bildirimi için)</li>
            <li>Ödev ve haftalık rapor içeriği (puan, devamsızlık, öğretmen notu)</li>
            <li>Öğrencinin yüklediği ödev teslim dosyaları (fotoğraf/PDF)</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-text">İşleme amaçları ve hukuki dayanak</h2>
          <p className="mt-2 text-sm leading-relaxed text-text">
            Veriler; dershane içi haftalık ödev ve ders içi performans takibinin
            yürütülmesi ile velinin çocuğunun durumu hakkında bilgilendirilmesi
            amacıyla işlenir. Ödev, rapor ve devamsızlık verilerinin işlenmesi,
            velimiz/öğrencimizle kurulan eğitim hizmeti ilişkisinin ifası için
            gereklidir (KVKK m.5/2-c). Veli telefon numarasının WhatsApp
            yoluyla bilgilendirme amacıyla kullanılması ise, kayıt sırasında
            alınan açık rızanıza dayanmaktadır (KVKK m.5/1).
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-text">Saklama süresi</h2>
          <p className="mt-2 text-sm leading-relaxed text-text">
            Kişisel veriler ilgili eğitim yılı sonunda silinir. Bu işlem
            <strong className="font-medium"> otomatik değildir</strong>; veriler
            yetkili yönetici tarafından, eğitim yılının bitişini takip eden
            dönemde manuel olarak yürütülen bir bakım işlemiyle silinir.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-text">Haklarınız</h2>
          <p className="mt-2 text-sm leading-relaxed text-text">
            KVKK'nın 11. maddesi uyarınca; kişisel verilerinizin işlenip
            işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme,
            işlenme amacını ve amacına uygun kullanılıp kullanılmadığını
            öğrenme, eksik veya yanlış işlenmişse düzeltilmesini isteme,
            işlenmesini gerektiren sebeplerin ortadan kalkması hâlinde
            silinmesini veya yok edilmesini isteme ve kanuna aykırı işleme
            sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep
            etme haklarına sahipsiniz. Bu haklarınızı kullanmak için aşağıdaki
            iletişim bilgilerinden bize ulaşabilirsiniz.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-base font-semibold text-text">Sorumlu ve iletişim</h2>
          <p className="mt-2 text-sm leading-relaxed text-text">
            Veri sorumlusu: Ödev Takip [tüzel kişilik unvanı
            farklıysa buraya yazılmalı]
            <br />
            E-posta: [E-posta adresi]
            <br />
            Telefon: [Telefon numarası]
            <br />
            Adres: [Açık adres]
          </p>
        </section>

        <p className="mt-8 text-xs text-muted">
          Son güncelleme: [13.09.2026]
        </p>

        <button
          type="button"
          onClick={() => goBackOrLogin(navigate)}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:border-accent"
        >
          Geri
        </button>
      </main>
    </div>
  );
}