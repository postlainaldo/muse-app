/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}", // Quét rộng hơn toàn bộ thư mục src
  ],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        darkBg: "#0A0A0C",
        appleBorder: "rgba(255, 255, 255, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-playfair)", "serif"],
      },
    },
  },
  plugins: [],
}
