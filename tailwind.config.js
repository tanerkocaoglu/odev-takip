/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        // Devamsızlık
        present: 'var(--attendance-present)',
        'att-late': 'var(--attendance-late)',
        'att-absent': 'var(--attendance-absent)',
        excused: 'var(--attendance-excused)',
        // Rapor durumu
        'status-draft': 'var(--status-draft)',
        'status-completed': 'var(--status-completed)',
        'status-sent': 'var(--status-sent)',
        // Teslim durumu
        'sub-uploaded': 'var(--submission-uploaded)',
        'sub-missing': 'var(--submission-missing)',
        'sub-late': 'var(--submission-late)',
        // Renk aileleri (durum rozetleri)
        amber: '#B45309',
        red: '#B42318',
        blue: '#175CD3',
        green: '#067647',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};