/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // `gym` brand background palette — driven by CSS variables so it
        // flips between dark backgrounds (dark mode) and light backgrounds
        // (light mode) without re-touching every component.
        gym: {
          950: 'var(--gym-950)',
          900: 'var(--gym-900)',
          850: 'var(--gym-850)',
          800: 'var(--gym-800)',
          700: 'var(--gym-700)',
          600: 'var(--gym-600)',
        },
        lime: {
          accent: '#84cc16',
          glow: '#a3e635',
        },
        amber: {
          accent: '#f59e0b',
        },
        crimson: {
          accent: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'glow-lime': '0 0 25px -5px rgba(132, 204, 22, 0.35)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.35)',
        'glow-crimson': '0 0 25px -5px rgba(239, 68, 68, 0.35)',
      }
    },
  },
  plugins: [],
}
