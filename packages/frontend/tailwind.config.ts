import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      // ── BonusTrack Farbsystem ──────────────────────────────────────────
      colors: {
        // Grün — Bonus / Guthaben / Positiv
        bonus: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
        },
        // Rot — Malus / Warnung / Negativ
        malus: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        // Amber — Grenzbereich / Achtung
        grenz: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Blau — Neutral / Info / Primär
        info: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
        },
      },

      // ── Animationen ────────────────────────────────────────────────────
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulse_soft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
      },
      animation: {
        shimmer:    'shimmer 1.8s infinite linear',
        fadeIn:     'fadeIn 0.3s ease-out',
        slideIn:    'slideIn 0.25s ease-out',
        scaleIn:    'scaleIn 0.2s ease-out',
        pulse_soft: 'pulse_soft 2s ease-in-out infinite',
      },

      // ── Übergänge ──────────────────────────────────────────────────────
      transitionDuration: {
        '250': '250ms',
      },

      // ── Box-Shadows (flat — kein heavy shadow) ────────────────────────
      boxShadow: {
        card:  '0 1px 3px 0 rgb(0 0 0 / 0.08)',
        lift:  '0 4px 12px 0 rgb(0 0 0 / 0.10)',
        inner: 'inset 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
