/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: { colors: { forest: '#145c45', mint: '#e7f4ed', ink: '#17352b' }, boxShadow: { soft: '0 12px 35px rgba(19, 64, 48, .08)' } } },
  plugins: []
};
