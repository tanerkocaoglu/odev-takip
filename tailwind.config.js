/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        // Devamsızlık
        present: 'rgb(var(--attendance-present) / <alpha-value>)',
        'att-late': 'rgb(var(--attendance-late) / <alpha-value>)',
        'att-absent': 'rgb(var(--attendance-absent) / <alpha-value>)',
        excused: 'rgb(var(--attendance-excused) / <alpha-value>)',
        // Rapor durumu
        'status-draft': 'rgb(var(--status-draft) / <alpha-value>)',
        'status-completed': 'rgb(var(--status-completed) / <alpha-value>)',
        'status-sent': 'rgb(var(--status-sent) / <alpha-value>)',
        // Teslim durumu
        'sub-uploaded': 'rgb(var(--submission-uploaded) / <alpha-value>)',
        'sub-missing': 'rgb(var(--submission-missing) / <alpha-value>)',
        'sub-late': 'rgb(var(--submission-late) / <alpha-value>)',
        // Yıkıcı eylemler (sil, iptal et)
        danger: 'rgb(var(--danger) / <alpha-value>)',
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