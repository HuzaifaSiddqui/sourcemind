/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B1020', 2: '#131A2E', 3: '#1C2440', line: '#232C4A', text: '#A9B1C7' },
        signal: { DEFAULT: '#5B7CFF', ink: '#3D5BEB', soft: '#EEF2FF', mark: '#D6DFFF' },
        canvas: '#F4F6FA',
        paper: '#FFFFFF',
        line: { DEFAULT: '#E3E7EF', strong: '#CDD3DF' },
        fg: { DEFAULT: '#161B2B', 2: '#3A4256', muted: '#667085', faint: '#98A1B3' },
        ok: { DEFAULT: '#12A150', soft: '#E7F6EE' },
        warn: { DEFAULT: '#C77A07', soft: '#FDF3E2' },
        bad: { DEFAULT: '#E5484D', soft: '#FDECEC' },
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4 Variable"', 'Georgia', 'serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '17px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        md: ['15px', '24px'],
        lg: ['17px', '26px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '36px'],
      },
      borderRadius: { sm: '6px', DEFAULT: '8px', md: '10px', lg: '14px' },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
        flash: { '0%': { backgroundColor: '#AFC0FF' }, '100%': { backgroundColor: '#D6DFFF' } },
      },
      animation: { rise: 'rise .18s ease-out', pulseDot: 'pulseDot 1.2s ease-in-out infinite', flash: 'flash 1.2s ease-out' },
    },
  },
  plugins: [],
};
