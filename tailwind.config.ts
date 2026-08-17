import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // True black, not near-black: the reference design runs pure #000 and the
        // surfaces sit only a few points above it, which is what gives the imagery
        // its contrast.
        bg: '#000000',
        panel: '#0B0B0B',
        'panel-2': '#060606',
        line: '#1F1F1F',
        ink: '#FFFFFF',
        'ink-dim': '#A3A3A3',
        // Acid lime, yellow-leaning rather than a pure green.
        accent: '#D0F53C',
        // The parent-brand attribution under the wordmark. A warm parchment, chosen to
        // sit apart from both the white ink and the lime accent without competing with
        // either — it reads as an imprint line rather than a third brand colour.
        imprint: '#D8CFC0',
        up: '#00E08A',
        down: '#FF4D5E',
        // Chart series. Kept green rather than re-hued to the lime accent: the accent
        // is far too light for a data mark, and this pair holds better colour-blind
        // margins than a lime step does (tritan ΔE 10.4 vs 5.8).
        'series-1': '#3FA82F',
        'series-2': '#8B6FE8',
      },
      fontFamily: {
        // Headings are a tightly-tracked grotesque, not a serif — the reference design
        // is sans throughout. `display` replaces the old `serif` token.
        display: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        // A system serif, deliberately: the only genuinely different letterform available
        // without adding a webfont request to every page for two words.
        serif: ['Georgia', "'Times New Roman'", 'serif'],
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
