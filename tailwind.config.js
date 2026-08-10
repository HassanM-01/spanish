/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12161C",
        surface: "#1A2029",
        line: "#2A323E",
        body: "#E6E9EE",
        muted: "#8A94A3",
        amber: "#E8A33D",
        teal: "#4FA8A0",
        red: "#C4574B",
      },
      fontFamily: {
        head: ["Archivo", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
