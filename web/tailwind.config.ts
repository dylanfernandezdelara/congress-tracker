import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: {
          DEFAULT: 'hsl(var(--twc-border) / <alpha-value>)',
          hover: 'hsl(var(--twc-border-hover) / <alpha-value>)',
          muted: 'hsl(var(--twc-border-muted) / <alpha-value>)',
        },
        background: 'hsl(var(--twc-background) / <alpha-value>)',
        foreground: 'hsl(var(--twc-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--twc-foreground) / <alpha-value>)',
          foreground: 'hsl(var(--twc-background) / <alpha-value>)',
        },
        // --twc-secondary is mid-gray text; shadcn secondary variants are not usable until a dedicated surface token exists.
        secondary: {
          DEFAULT: 'hsl(var(--twc-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--twc-background) / <alpha-value>)',
        },
        muted: {
          // --twc-surface-subtle already embeds alpha (`0 0% 0% / 0.04`).
          DEFAULT: 'hsl(var(--twc-surface-subtle))',
          foreground: 'hsl(var(--twc-secondary) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--twc-card) / <alpha-value>)',
          foreground: 'hsl(var(--twc-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--twc-fail) / <alpha-value>)',
          foreground: 'hsl(var(--twc-background) / <alpha-value>)',
        },
        faint: 'hsl(var(--twc-faint) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--twc-card) / <alpha-value>)',
          foreground: 'hsl(var(--twc-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--twc-accent) / <alpha-value>)',
          foreground: 'hsl(var(--twc-background) / <alpha-value>)',
        },
        input: 'hsl(var(--twc-border) / <alpha-value>)',
        ring: 'hsl(var(--twc-foreground) / <alpha-value>)',
        pass: 'hsl(var(--twc-pass) / <alpha-value>)',
        fail: 'hsl(var(--twc-fail) / <alpha-value>)',
        surface: {
          subtle: 'hsl(var(--twc-surface-subtle))',
        },
        party: {
          d: 'hsl(var(--twc-party-d) / <alpha-value>)',
          r: 'hsl(var(--twc-party-r) / <alpha-value>)',
          i: 'hsl(var(--twc-party-i) / <alpha-value>)',
          other: 'hsl(var(--twc-party-other) / <alpha-value>)',
        },
      },
      fontFamily: {
        // One family only — serif/mono aliases map to the system SF Pro stack.
        sans: ['var(--font-family)'],
        serif: ['var(--font-family)'],
        mono: ['var(--font-family)'],
      },
      borderRadius: {
        nav: '8px',
        card: '16px',
        pill: '9999px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
