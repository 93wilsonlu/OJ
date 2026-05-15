/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        oj: {
          bg:         '#0F172A',
          surface:    '#1E293B',
          surface2:   '#334155',
          border:     '#475569',
          muted:      '#272F42',
          fg:         '#F8FAFC',
          'fg-muted': '#94A3B8',
          accent:     '#22C55E',
          'accent-dim':'#16A34A',
          danger:     '#EF4444',
          warn:       '#F59E0B',
        },
      },
      animation: {
        'spin-slow': 'spin 1.5s linear infinite',
        'fade-in':   'fadeIn 150ms ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1 } },
      },
    },
  },
  plugins: [],
}
