/** Koşullu sınıf birleştirici — yalnızca doğru (truthy) parçaları boşlukla birleştirir. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
