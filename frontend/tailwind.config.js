/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // ── Semantic UI tokens (CSS var-backed) ─────────────────────────
        ui: {
          bg:          'rgb(var(--ui-bg) / <alpha-value>)',
          surface:     'rgb(var(--ui-surface) / <alpha-value>)',
          'surface-2': 'rgb(var(--ui-surface-2) / <alpha-value>)',
          border:      'rgb(var(--ui-border) / <alpha-value>)',
          'border-sub':'rgb(var(--ui-border-sub) / <alpha-value>)',
          text:        'rgb(var(--ui-text) / <alpha-value>)',
          muted:       'rgb(var(--ui-muted) / <alpha-value>)',
          accent:      'rgb(var(--ui-accent) / <alpha-value>)',
          'accent-2':  'rgb(var(--ui-accent-2) / <alpha-value>)',
          sidebar:     'rgb(var(--ui-sidebar) / <alpha-value>)',
        },
        // Legacy compat
        surface: {
          bg:     'rgb(var(--ui-bg) / <alpha-value>)',
          card:   'rgb(var(--ui-surface) / <alpha-value>)',
          muted:  'rgb(var(--ui-surface-2) / <alpha-value>)',
          border: 'rgb(var(--ui-border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--ui-accent) / <alpha-value>)',
          hover:   '#4338CA',
          light:   '#EEF2FF',
          muted:   '#A5B4FC',
        },
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        // Chart palette tokens
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
        },
      },
      boxShadow: {
        // Light Aurora shadows
        'card':           '0 1px 3px rgba(0,0,0,0.05), 0 4px 24px rgba(0,0,0,0.04)',
        'card-hover':     '0 4px 20px rgba(0,0,0,0.09), 0 12px 48px rgba(0,0,0,0.06)',
        // Dark Obsidian glows
        'glow-accent':    '0 0 0 1px rgba(129,140,248,0.18), 0 4px 24px rgba(129,140,248,0.09)',
        'glow-cyan':      '0 0 0 1px rgba(34,211,238,0.18), 0 4px 24px rgba(34,211,238,0.09)',
        'glow-emerald':   '0 0 0 1px rgba(52,211,153,0.18), 0 4px 24px rgba(52,211,153,0.09)',
        // Generic
        'card-glow':      '0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(99,102,241,0.07)',
        topbar:           '0 1px 0 rgba(0,0,0,0.06)',
        sidebar:          '1px 0 0 rgba(0,0,0,0.04)',
        'btn-primary':    '0 2px 8px rgba(79,70,229,0.30)',
        'btn-primary-hover': '0 4px 16px rgba(79,70,229,0.40)',
        'input-focus':    '0 0 0 3px rgba(79,70,229,0.12)',
        sm:               '0 1px 3px rgba(0,0,0,0.08)',
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'aurora-header':     'linear-gradient(135deg, #4338CA 0%, #6D28D9 50%, #4F46E5 100%)',
        'aurora-emerald':    'linear-gradient(135deg, #059669 0%, #0891B2 100%)',
        'aurora-amber':      'linear-gradient(135deg, #D97706 0%, #DC2626 100%)',
        'aurora-rose':       'linear-gradient(135deg, #E11D48 0%, #9333EA 100%)',
        'obsidian-glow':     'radial-gradient(ellipse at top, rgba(129,140,248,0.08) 0%, transparent 60%)',
      },
      animation: {
        'page-in':      'page-in 0.22s ease-out both',
        'fade-in':      'fade-in 0.18s ease-out both',
        'slide-up':     'slide-up 0.28s ease-out both',
        'scale-in':     'scale-in 0.2s ease-out both',
        'shimmer-fast': 'shimmer 1.2s infinite',
        'float':        'float 3s ease-in-out infinite',
        'count-in':     'count-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
        'bar-grow':     'bar-grow 0.8s ease-out both',
      },
      keyframes: {
        'page-in':   { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in':   { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up':  { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':  { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'shimmer':   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'float':     { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-5px)' } },
        'count-in':  { from: { opacity: '0', transform: 'translateY(20px) scale(0.9)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'bar-grow':  { from: { transform: 'scaleY(0)', transformOrigin: 'bottom' }, to: { transform: 'scaleY(1)', transformOrigin: 'bottom' } },
      },
    },
  },
  plugins: [],
}
