/**
 * Riskli öğrenci eşikleri — tek doğru kaynak (kullanıcı kararı).
 * İlk sürüm kod içinde sabittir; ileride admin ayarlanabilir yapılmak istenirse
 * yalnızca bu dosya değişir, kod içine dağıtılmaz.
 *
 * Tanımlar (kullanıcı onayı):
 * - Pencere: son `lookbackWeeks` hafta (aktif yılın en yeni hafta kayıtları).
 * - Düşük ortalama: son N haftada ödev+ders içi performans ortalaması ≤ `avgScoreThreshold`
 *   (devamsız satırlar ortalamaya girmez; taslak raporlar sayılmaz).
 * - Teslim etmeme: son N haftada öğrenciye verilen (completed/sent) ödevlerden
 *   ≥ `missingSubmissionMin` tanesi teslim edilmemiş (ardışık şart yok).
 * - Devamsızlık: son N haftada ARDIŞIK ≥ `consecutiveAbsenceMin` hafta
 *   `absent` (tek seferlik saymaz; `excused` hiç sayılmaz).
 */
export const RISK = {
  lookbackWeeks: 3,
  avgScoreThreshold: 4,
  missingSubmissionMin: 2,
  consecutiveAbsenceMin: 2,
} as const;

/** `risk_flags` değerleri — frontend bunları ayrı rozet olarak gösterir. */
export const RISK_FLAGS = {
  LOW_SCORE: 'low_score',
  MISSING_SUBMISSION: 'missing_submission',
  CONSECUTIVE_ABSENCE: 'consecutive_absence',
} as const;
