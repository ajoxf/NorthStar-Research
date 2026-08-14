import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#08090B',
        panel: '#0E1013',
        'panel-2': '#0B0C0F',
        line: '#1E2228',
        ink: '#F2F4F7',
        'ink-dim': '#8A93A0',
        accent: '#39FF14',
        up: '#00E08A',
        down: '#FF4D5E',
        // Chart series: darker steps of the same hues, snapped into the dark-mode
        // lightness band so they pass the CVD and contrast checks. The neon accent
        // itself is too light to carry data marks.
        'series-1': '#3FA82F',
        'series-2': '#8B6FE8',
      },
      fontFamily: {
        serif: ['var(--font-newsreader)', 'Newsreader', 'Georgia', 'serif'],
        mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}

export default config
