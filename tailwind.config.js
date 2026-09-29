/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--accent-hover) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        // Semantik durum renkleri (yeni kodda bunlar kullanılır)
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        // Geçiş: eski takma adlar (aynı renkleri verir)
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-deco': 'rgb(var(--brand-deco) / <alpha-value>)',
        present: 'rgb(var(--attendance-present) / <alpha-value>)',
        'att-late': 'rgb(var(--attendance-late) / <alpha-value>)',
        'att-absent': 'rgb(var(--attendance-absent) / <alpha-value>)',
        excused: 'rgb(var(--attendance-excused) / <alpha-value>)',
        'status-draft': 'rgb(var(--status-draft) / <alpha-value>)',
        'status-completed': 'rgb(var(--status-completed) / <alpha-value>)',
        'status-sent': 'rgb(var(--status-sent) / <alpha-value>)',
        'sub-uploaded': 'rgb(var(--submission-uploaded) / <alpha-value>)',
        'sub-missing': 'rgb(var(--submission-missing) / <alpha-value>)',
        'sub-late': 'rgb(var(--submission-late) / <alpha-value>)',
        amber: '#A54A08',
        red: '#B42318',
        blue: '#175CD3',
        green: '#067647',
      },
      // İki yarıçap: 8px (kontrol/kart) ve 12px (modal, çekmece, büyük yüzey).
      // xl/2xl/3xl eski kullanımları 12px'e toplar; `full` rozet/çip içindir.
      borderRadius: {
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-lg)',
        '2xl': 'var(--radius-lg)',
        '3xl': 'var(--radius-lg)',
      },
      boxShadow: {
        hover: 'var(--shadow-hover)',
        float: 'var(--shadow-float)',
        modal: 'var(--shadow-modal)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
