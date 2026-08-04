/**
 * SMS gönderimi — tek giriş noktası (CLAUDE.md).
 * Sağlayıcı seçimi (Netgsm, İleti Merkezi, Twilio vb.) yalnızca bu
 * fonksiyonun içini değiştirir; çağıran kod sağlayıcıyı bilmez.
 *
 * `SMS_PROVIDER_KEY` boşsa (geliştirme) kod konsola yazılır.
 * Sağlayıcı entegrasyonu Aşama 6'da bu fonksiyonun içine eklenir.
 */

export async function sendSms(phone: string, message: string): Promise<void> {
  const key = process.env.SMS_PROVIDER_KEY?.trim();
  if (!key) {
    console.log(`[SMS] -> ${phone}: ${message}`);
    return;
  }
  // Aşama 6: sağlayıcı HTTP çağrısı.
  console.log(`[SMS] -> ${phone}: ${message}`);
}
