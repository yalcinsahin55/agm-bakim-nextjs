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
        "panel-deep": "var(--color-panel-deep)",
        border: "var(--color-border)",
        borderlt: "var(--color-borderlt)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        faint: "var(--color-faint)",
        amber: "var(--color-amber)",
        "amber-bright": "var(--color-amber-bright)",
        "on-amber": "var(--color-on-amber)",
        teal: "var(--color-teal)",
        "on-teal": "var(--color-on-teal)",
        red: "var(--color-red)",
        "on-red": "var(--color-on-red)",
        orange: "var(--color-orange)",
        yellow: "var(--color-yellow)",
        green: "var(--color-green)",
        "on-green": "var(--color-on-green)",
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        card: "14px",
        control: "12px",
      },
      spacing: {
        page: "var(--space-page)",
      },
    },
  },
  plugins: [],
};

export default config;
