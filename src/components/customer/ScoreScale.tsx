/**
 * Puan göstergesi — **her zaman ham 1–10**.
 *
 * Büyük sayı değeri birebir gösterir; altındaki 10 segment değeri 1:1 temsil
 * eder (dolu segment = puan). **Yüzde, ortalama veya normalizasyon üretilmez**
 * (kırmızı çizgi). `value === null` ise (devamsız/izinli satır) puan uydurulmaz;
 * "Puan girilmedi" gösterilir.
 */
export default function ScoreScale({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-md border border-border bg-subtle/50 p-3">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      {value === null ? (
        <p className="mt-1.5 text-sm text-muted">Puan girilmedi</p>
      ) : (
        <>
          <p className="tabular mt-1 text-2xl font-semibold leading-none text-text">
            {value}
            <span className="ml-1 text-sm font-normal text-muted">/ 10</span>
          </p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={
                  'h-2 flex-1 rounded-full ' + (i < value ? 'bg-text' : 'bg-border')
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
