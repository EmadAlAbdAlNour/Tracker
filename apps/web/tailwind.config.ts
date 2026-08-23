import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 8px 30px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9f0ff',
          500: '#1d9bf0',
          600: '#0f7bd8',
          700: '#0b5aa3',
        },
      },
    },
  },
  plugins: [],
};

export default config;
