/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/client/index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: '#0a0c10',
          panel: '#13171f',
          edge: '#222a38',
          accent: '#ff6b1a',
          good: '#22c55e',
          warn: '#f59e0b',
          bad: '#ef4444',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
