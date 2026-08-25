import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f1319",
        panel: "#171d25",
        panel2: "#1f2730",
        border: "#2a323c",
        borderlt: "#374252",
        text: "#eef1f5",
        muted: "#8b96a3",
        faint: "#5b6572",
        amber: "#e8952f",
        teal: "#3fb5c4",
        red: "#ef4a52",
        orange: "#f2994a",
        yellow: "#f0c93d",
        green: "#33c98a",
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
