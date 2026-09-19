import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        panel: "var(--color-panel)",
        panel2: "var(--color-panel2)",
        border: "var(--color-border)",
        borderlt: "var(--color-borderlt)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        faint: "var(--color-faint)",
        amber: "var(--color-amber)",
        teal: "var(--color-teal)",
        red: "var(--color-red)",
        orange: "var(--color-orange)",
        yellow: "var(--color-yellow)",
        green: "var(--color-green)",
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
