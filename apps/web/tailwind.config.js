/** Brand colors are CSS variables (see src/index.css) so the whole theme changes in one place. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', dark: 'rgb(var(--brand-dark) / <alpha-value>)', soft: 'rgb(var(--brand-soft) / <alpha-value>)' },
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
