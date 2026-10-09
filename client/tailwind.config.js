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
        // RGB-channel variables (see index.css) so opacity modifiers such as bg-gym-900/80 work.
        gym: {
          950: 'rgb(var(--gym-950-rgb) / <alpha-value>)',
          900: 'rgb(var(--gym-900-rgb) / <alpha-value>)',
          850: 'rgb(var(--gym-850-rgb) / <alpha-value>)',
          800: 'rgb(var(--gym-800-rgb) / <alpha-value>)',
          700: 'rgb(var(--gym-700-rgb) / <alpha-value>)',
          600: 'rgb(var(--gym-600-rgb) / <alpha-value>)',
        },
        neu: {
          surface: 'rgb(var(--gym-900-rgb) / <alpha-value>)',
          inset: 'var(--neu-inset-bg)',
          light: 'var(--neu-shadow-light)',
          dark: 'var(--neu-shadow-dark)',
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
        'glow-lime': '0 0 25px -5px rgba(132, 204, 22, 0.45)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.45)',
        'glow-crimson': '0 0 25px -5px rgba(239, 68, 68, 0.45)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.45)',
        'glow-pink': '0 0 25px -5px rgba(236, 72, 153, 0.45)',
        'neu-flat': '8px 8px 18px var(--neu-shadow-dark), -8px -8px 18px var(--neu-shadow-light)',
        'neu-flat-sm': '4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light)',
        'neu-flat-lg': '12px 12px 28px var(--neu-shadow-dark), -12px -12px 28px var(--neu-shadow-light)',
        'neu-pressed': 'inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light)',
        'neu-pressed-sm': 'inset 2px 2px 5px var(--neu-shadow-dark), inset -2px -2px 5px var(--neu-shadow-light)',
        'neu-btn': '5px 5px 12px var(--neu-shadow-dark), -5px -5px 12px var(--neu-shadow-light)',
        'neu-btn-hover': '7px 7px 16px var(--neu-shadow-dark), -7px -7px 16px var(--neu-shadow-light)',
      }
    },
  },
  plugins: [],
}
