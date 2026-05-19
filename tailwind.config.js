/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand gold scale — replaces amber/yellow accents
        gold: {
          50:  '#fbf7ec',
          100: '#f6ecc9',
          200: '#ecd88f',
          300: '#e0c160',
          400: '#d4af37',
          500: '#c39a26',
          600: '#a8821d',
          700: '#85661a',
          800: '#5e4812',
          900: '#3d2f0c',
        },
      },
    },
  },
  plugins: [],
}
