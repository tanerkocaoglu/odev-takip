/**
 * Riskli öğrenci eşikleri — tek doğru kaynak (kullanıcı kararı).
 * İlk sürüm kod içinde sabittir; ileride admin ayarlanabilir yapılmak istenirse
 * yalnızca bu dosya değişir, kod içine dağıtılmaz.
 *
 * Tanımlar (kullanıcı onayı):
 * - Pencere: son `lookbackWeeks` **bitmiş** hafta (aktif yılın `end_date < bugün`
 *   olan en yeni kayıtları). Gelecekteki/ongoing haftalar pencereye girmez;
 *   bitmiş hafta sayısı azsa mevcut bitmiş haftalarla çalışılır.
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

/** Sınıf seviyesi sabit kümesi (spec §3.1) — tek doğru kaynak. */
export const GRADE_LEVELS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Hazırlık', 'Mezun',
] as const;

/** Toplu öğrenci içe aktarma (CSV) için üst boyut: 2 MB. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
