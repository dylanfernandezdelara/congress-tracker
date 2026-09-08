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
        primary: {
          DEFAULT: 'hsl(var(--twc-foreground))',
          foreground: 'hsl(var(--twc-background))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--twc-secondary))',
          foreground: 'hsl(var(--twc-background))',
        },
        muted: {
          DEFAULT: 'hsl(var(--twc-surface-subtle))',
          foreground: 'hsl(var(--twc-secondary))',
        },
        popover: {
          DEFAULT: 'hsl(var(--twc-card))',
          foreground: 'hsl(var(--twc-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--twc-fail))',
          foreground: 'hsl(var(--twc-background))',
        },
        faint: 'hsl(var(--twc-faint))',
        card: {
          DEFAULT: 'hsl(var(--twc-card))',
          foreground: 'hsl(var(--twc-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--twc-accent))',
          foreground: 'hsl(var(--twc-background))',
        },
        input: 'hsl(var(--twc-border))',
        ring: 'hsl(var(--twc-foreground))',
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
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
