import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--twc-border))',
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
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
