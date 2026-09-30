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
        terminal: {
          bg: '#0B0E14',
          panel: '#121722',
          surface: '#181F2E',
          card: '#1B2234',
          border: '#232C3E',
          borderLight: '#323E56',
          text: '#F0F4FC',
          muted: '#8B9BB4',
          subtle: '#5C6C84'
        },
        trade: {
          buy: '#00D084',
          buyHover: '#00BA76',
          buyBg: 'rgba(0, 208, 132, 0.12)',
          sell: '#FF4D6D',
          sellHover: '#F03E5E',
          sellBg: 'rgba(255, 77, 109, 0.12)',
          accent: '#3B82F6',
          warning: '#F59E0B',
          neutral: '#64748B'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Roboto Mono', 'monospace'],
      },
      fontSize: {
        '2xs': '0.72rem', // ~11.5px (improved readability for metadata and badges)
        '3xs': '0.625rem', // 10px (for compact exchange pills)
        'xs': '0.8125rem', // 13px (crisp secondary text)
        'sm': '0.875rem',  // 14px
      }
    },
  },
  plugins: [],
}
