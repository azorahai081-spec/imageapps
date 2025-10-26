/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
     // Add safelist for dynamically generated grid column classes
     { raw: 'grid-cols-2 grid-cols-3 grid-cols-4 grid-cols-5 grid-cols-6 grid-cols-7 grid-cols-8 grid-cols-9 grid-cols-10', extension: 'html' }
  ],
  safelist: [ // Alternative way to safelist, might be more robust
    'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6',
    'grid-cols-7', 'grid-cols-8', 'grid-cols-9', 'grid-cols-10',
   ],
  theme: {
    extend: {},
  },
  plugins: [
     require('@tailwindcss/forms'), // Ensure forms plugin is included for better input styling
  ],
}
