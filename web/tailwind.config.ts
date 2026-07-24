import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: {
          DEFAULT: 'hsl(var(--twc-border))',
          hover: 'hsl(var(--twc-border-hover))',
          muted: 'hsl(var(--twc-border-muted))',
        },
        background: 'hsl(var(--twc-background))',
        foreground: 'hsl(var(--twc-foreground))',
        secondary: 'hsl(var(--twc-secondary))',
        faint: 'hsl(var(--twc-faint))',
        card: {
          DEFAULT: 'hsl(var(--twc-card))',
        },
        accent: {
          DEFAULT: 'hsl(var(--twc-accent))',
        },
        pass: 'hsl(var(--twc-pass))',
        fail: 'hsl(var(--twc-fail))',
        surface: {
          subtle: 'hsl(var(--twc-surface-subtle))',
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
      },

    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
