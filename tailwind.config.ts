import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        faso: {
          forest: '#155B46',
          forestDark: '#0E4435',
          ivory: '#F8F5EC',
          terracotta: '#C9503B',
          saffron: '#E0AE3C',
          ink: '#202721',
          muted: '#65716A',
          line: '#E8E4D9',
          pale: '#F1EEE5',
        },
      },
      fontFamily: {
        display: ['Manrope', 'system-ui', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 34px rgba(32, 39, 33, 0.07)',
        soft: '0 4px 18px rgba(32, 39, 33, 0.05)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
} satisfies Config;
