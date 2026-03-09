import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--twc-border))',
        input: 'hsl(var(--twc-input))',
        ring: 'hsl(var(--twc-ring))',
        background: 'hsl(var(--twc-background))',
        foreground: 'hsl(var(--twc-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--twc-primary))',
          foreground: 'hsl(var(--twc-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--twc-secondary))',
          foreground: 'hsl(var(--twc-secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--twc-destructive))',
          foreground: 'hsl(var(--twc-destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--twc-muted))',
          foreground: 'hsl(var(--twc-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--twc-accent))',
          foreground: 'hsl(var(--twc-accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--twc-popover))',
          foreground: 'hsl(var(--twc-popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--twc-card))',
          foreground: 'hsl(var(--twc-card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      boxShadow: {
        glow: '0 18px 50px rgba(59, 45, 35, 0.08)',
      },
      backgroundImage: {
        parchment:
          'radial-gradient(circle at top, rgba(255,255,255,0.7), transparent 38%), linear-gradient(180deg, #f8f3eb 0%, #f3efe6 48%, #efe6d6 100%)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
