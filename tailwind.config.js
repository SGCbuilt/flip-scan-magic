export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        sgc: {
          navy:       '#1B3A8C',
          'navy-dark':'#122970',
          'navy-light':'#2A4FAD',
          'navy-pale': '#EEF2FB',
          'navy-mid':  '#C5D0EF',
          black:      '#0F1117',
          border:     '#E2E4E9',
          light:      '#F4F5F7',
          mid:        '#8B8F9A',
          white:      '#FFFFFF',
          success:    '#1A7A4A',
          'success-bg':'#EDFAF3',
          danger:     '#C0341D',
          'danger-bg':'#FEF0ED',
          warn:       '#8A5700',
          'warn-bg':  '#FEF7EA',
          orange:     '#C45E1A',
          'orange-bg':'#FEF3EA',
          house:      '#B8BBC0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      }
    }
  },
  plugins: [],
}
