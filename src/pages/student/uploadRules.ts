/**
 * Teslim yükleme kuralları — DEĞİŞMEZ (spec §5.3, CLAUDE.md Aşama 4):
 * jpg/jpeg/png/heic(heif)/pdf, dosya başına 10 MB, teslim başına toplam 30 dosya.
 * Sunucu aynı kuralları uygular; burada yalnızca seçim anında kullanıcıya erken ve
 * anlaşılır geri bildirim verilir. Kural ihlali mesajları sabittir (testler bağlı).
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 30;
export const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);

export const MSG = {
  count: 'En fazla 30 dosya seçebilirsiniz.',
  size: 'Her dosya en fazla 10 MB olabilir.',
  type: 'Yalnızca JPEG, PNG, HEIC veya PDF dosyası yükleyebilirsiniz.',
  mixed: 'Bazı dosyalar eklenemedi.',
} as const;

/** Kullanıcıya gösterilen seçim uyarısı: sabit kural cümlesi + dosya bazlı ayrıntılar. */
export interface PickNotice {
  message: string;
  details: string[];
}

export interface PickResult {
  accepted: File[];
  notice: PickNotice | null;
}

export function fileExt(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function isPdfFile(file: { name: string }): boolean {
  return fileExt(file.name) === 'pdf';
}

/** `12,4 MB` / `230 KB` — tabular gösterim için. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Seçimi doğrular. Boyut/tür ihlali olan dosyalar tek tek reddedilir (geçerli
 * olanlar eklenir; ihlaller ad + nedenle listelenir). Geçerli dosyalar toplam
 * limiti aşarsa seçimin TAMAMI reddedilir ve kalan kontenjan söylenir.
 * `currentCount`: sunucudaki dosyalar + kuyruktaki dosyalar.
 */
export function validatePick(incoming: File[], currentCount: number): PickResult {
  const valid: File[] = [];
  const tooBig: File[] = [];
  const wrongType: File[] = [];
  for (const f of incoming) {
    if (!ALLOWED_EXT.has(fileExt(f.name))) wrongType.push(f);
    else if (f.size > MAX_FILE_SIZE) tooBig.push(f);
    else valid.push(f);
  }

  if (currentCount + valid.length > MAX_FILES) {
    const left = Math.max(0, MAX_FILES - currentCount);
    return {
      accepted: [],
      notice: {
        message: MSG.count,
        details: [`Şu an en fazla ${left} dosya daha ekleyebilirsiniz.`],
      },
    };
  }

  if (tooBig.length === 0 && wrongType.length === 0) return { accepted: valid, notice: null };

  const details = [
    ...tooBig.map((f) => `${f.name} — ${formatSize(f.size)}`),
    ...wrongType.map((f) => `${f.name} — desteklenmeyen dosya türü`),
  ];
  const message = wrongType.length === 0 ? MSG.size : tooBig.length === 0 ? MSG.type : MSG.mixed;
  return { accepted: valid, notice: { message, details } };
}
