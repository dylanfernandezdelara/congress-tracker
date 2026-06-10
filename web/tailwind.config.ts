import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '680px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--twc-border))',
        background: '#f5eedd',
        foreground: 'hsl(var(--twc-foreground))',
        heading: 'hsl(var(--twc-heading))',
        card: {
          DEFAULT: 'hsl(var(--twc-card))',
          foreground: 'hsl(var(--twc-card-foreground))',
        },
        muted: {
          foreground: 'hsl(var(--twc-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--twc-accent))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--twc-secondary))',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
