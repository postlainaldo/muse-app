/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        darkAccent: "#121212",
        appleBorder: "rgba(255, 255, 255, 0.08)",
      },
    },
  },
  plugins: [],
}
