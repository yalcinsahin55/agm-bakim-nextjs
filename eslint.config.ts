import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/coverage/**"],
  },
  {
    // React Hooks 7 flags existing async data-loading effects as a new error.
    // Keep this migration behavior-neutral; these effects are intentionally retained.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
