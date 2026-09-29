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

import { useNavigate } from "react-router-dom";
import PublicShell from "../components/layout/PublicShell";
import { Button } from "../components/ui";

function goBackOrLogin(navigate: ReturnType<typeof useNavigate>): void {
  // Doğrudan açıldıysa (bookmark/WhatsApp) geri gidilecek sayfa olmayabilir.
  if (window.history.length > 1) navigate(-1);
  else navigate("/login");
}

export default function PrivacyNoticePage() {
  const navigate = useNavigate();

  return (
    <PublicShell width="prose" showPrivacyLink={false}>
      <h1 className="text-xl font-semibold text-text">
        Gizlilik ve Aydınlatma Metni
      </h1>
      <p className="mt-3 text-base leading-7 text-muted">
        Bu metin, [Kurum adı] tarafından işletilen ödev takip sisteminde kişisel
        verilerinizin 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK")
        kapsamında nasıl işlendiğini açıklamaktadır.
      </p>

      <section className="mt-6 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text">İşlenen veriler</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-7 text-text">
          <li>Öğrenci ve veli ad-soyad bilgisi</li>
          <li>Telefon numarası (yalnızca veli — WhatsApp bildirimi için)</li>
          <li>
            Ödev ve haftalık rapor içeriği (puan, devamsızlık, öğretmen notu)
          </li>
          <li>Öğrencinin yüklediği ödev teslim dosyaları (fotoğraf/PDF)</li>
        </ul>
      </section>

      <section className="mt-6 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text">
          İşleme amaçları ve hukuki dayanak
        </h2>
        <p className="mt-2 text-base leading-7 text-text">
          Veriler; dershane içi haftalık ödev ve ders içi performans takibinin
          yürütülmesi ile velinin çocuğunun durumu hakkında bilgilendirilmesi
          amacıyla işlenir. Ödev, rapor ve devamsızlık verilerinin işlenmesi,
          velimiz/öğrencimizle kurulan eğitim hizmeti ilişkisinin ifası için
          gereklidir (KVKK m.5/2-c). Veli telefon numarasının WhatsApp yoluyla
          bilgilendirme amacıyla kullanılması ise, kayıt sırasında alınan açık
          rızanıza dayanmaktadır (KVKK m.5/1).
        </p>
      </section>

      <section className="mt-6 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text">Saklama süresi</h2>
        <p className="mt-2 text-base leading-7 text-text">
          Kişisel veriler ilgili eğitim yılı sonunda silinir. Bu işlem
          <strong className="font-medium"> otomatik değildir</strong>; veriler
          yetkili yönetici tarafından, eğitim yılının bitişini takip eden
          dönemde manuel olarak yürütülen bir bakım işlemiyle silinir.
        </p>
      </section>

      <section className="mt-6 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text">Haklarınız</h2>
        <p className="mt-2 text-base leading-7 text-text">
          KVKK'nın 11. maddesi uyarınca; kişisel verilerinizin işlenip
          işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme,
          işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,
          eksik veya yanlış işlenmişse düzeltilmesini isteme, işlenmesini
          gerektiren sebeplerin ortadan kalkması hâlinde silinmesini veya yok
          edilmesini isteme ve kanuna aykırı işleme sebebiyle zarara uğramanız
          hâlinde zararın giderilmesini talep etme haklarına sahipsiniz. Bu
          haklarınızı kullanmak için aşağıdaki iletişim bilgilerinden bize
          ulaşabilirsiniz.
        </p>
      </section>

      <section className="mt-6 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text">
          Sorumlu ve iletişim
        </h2>
        <p className="mt-2 text-base leading-7 text-text">
          Veri sorumlusu: [Kurum adı]
          <br />
          E-posta: [E-posta]
          <br />
          Telefon: [Telefon]
          <br />
          Adres: [Adres]
        </p>
      </section>

      <p className="mt-8 text-[13px] text-muted">
        Son güncelleme: [13.09.2026]
      </p>

      <Button
        size="lg"
        onClick={() => goBackOrLogin(navigate)}
        className="mt-6"
      >
        Geri
      </Button>
    </PublicShell>
  );
}
