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
          bg:         '#F5F6F7',
          surface:    '#FFFFFF',
          surface2:   '#F1F2F4',
          border:     '#D7DBE0',
          muted:      '#EEF0F2',
          fg:         '#202124',
          'fg-muted': '#667085',
          accent:     '#DC2F33',
          'accent-dim':'#B91F24',
          danger:     '#DC2F33',
          warn:       '#B7791F',
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
