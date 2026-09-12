import '@testing-library/jest-dom/vitest';

// jsdom `URL.createObjectURL` uygulamaz; teslim grid'i ve bekleyen dosya
// önizlemeleri bunu kullanır. Deterministik sahte bir karşılık verilir
// (gerçek gerektiren testler kendi stub'ını kurar).
if (typeof URL.createObjectURL !== 'function') {
  let counter = 0;
  URL.createObjectURL = () => `blob:test-${++counter}`;
  URL.revokeObjectURL = () => {};
}
