import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      /*
       * Every brand colour resolves through a CSS variable rather than a literal, so a
       * subtree can be re-skinned by redefining the variables on it — which is how a
       * Nexus-branded signup wears blue and white while the rest of the site stays black
       * and lime. The values themselves live in globals.css.
       *
       * The variables hold SPACE-SEPARATED RGB CHANNELS, not hex, because Tailwind's
       * opacity modifiers have to be able to write the alpha in: `text-ink-dim/70`
       * compiles to `rgb(var(--ink-dim) / 0.7)`, which only works on channels. A hex
       * value here would silently break every `/nn` class on the site.
       *
       * The channels are exactly the hexes these were before, so this change is invisible
       * everywhere: #000000 is 0 0 0, #D0F53C is 208 245 60, and so on.
       */
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--bg-panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--bg-panel-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-dim': 'rgb(var(--ink-dim) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--accent-hover) / <alpha-value>)',
        imprint: 'rgb(var(--imprint) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        'series-1': 'rgb(var(--series-1) / <alpha-value>)',
        'series-2': 'rgb(var(--series-2) / <alpha-value>)',
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
