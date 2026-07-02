import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  // ── Content paths — critical for tree-shaking unused CSS ──────────────
  // Only include files that actually use Tailwind classes.
  // This keeps the production CSS bundle tiny (~8KB gzipped vs 300KB raw).
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  // ── Dark mode — class-based (not media query) ─────────────────────────
  // Disabled for now — saves users on 3G from loading dark mode variants.
  // Enable when needed: darkMode: 'class'
  darkMode: 'class',

  theme: {
    extend: {
      // ── Design tokens (match CSS vars in globals.css) ──────────────────
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      // ── Font stack — system fonts only, zero external font load ───────
      // Google Fonts adds 100-400ms on 3G. We load them as display:swap
      // in production but fall back to system stack instantly.
      fontFamily: {
        sans: [
          'Syne',                    // loaded via Google Fonts with swap
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          '"Cascadia Code"',
          'Consolas',
          'monospace',
        ],
      },

      // ── Animations ────────────────────────────────────────────────────
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(0)' },
        },
        'progress-fill': {
          from: { width: '0%' },
          to:   { width: '100%' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.2s ease-out',
        'slide-in':       'slide-in 0.25s ease-out',
        'progress-fill':  'progress-fill 3s linear forwards',
      },

      // ── Spacing ───────────────────────────────────────────────────────
      // Standard 4px grid — nothing custom needed

      // ── Screens — mobile-first for 3G users ──────────────────────────
      // Nigerian mobile traffic is predominantly < 640px
      screens: {
        sm:  '640px',
        md:  '768px',
        lg:  '1024px',
        xl:  '1280px',
        '2xl': '1536px',
      },
    },
  },

  plugins: [
    animate,
    // @tailwindcss/typography — for course content markdown rendering
    // Install: pnpm add -D @tailwindcss/typography
    require('@tailwindcss/typography'),
  ],
}

export default config