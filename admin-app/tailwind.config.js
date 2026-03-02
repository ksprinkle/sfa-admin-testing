/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
  colors: {
    ocean: {
      DEFAULT: "#4F8FA8",
      light: "#6FAEC3",
      dark: "#3F7D93",
    },
    seafoam: "#6FBFB1",
    warmbg: "#F9F6F1",
    success: "#4CAF7A",
    warning: "#F2A65A",
    danger: "#E76F51",
  },
},
  },
  plugins: [],
}