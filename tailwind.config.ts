import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Lear brand
        lear: {
          red:       "#D82A28",
          "red-dark":"#A81E1D",
          black:     "#1A1A1A",
          "gray-900":"#333333",
          "gray-600":"#6B6B6B",
          "gray-400":"#9A9A9A",
          "gray-200":"#E3E3E3",
          "gray-100":"#F2F2F2",
          "gray-050":"#FAFAFA",
        },
        // Semantic
        success: "#2E9E5B",
        warning: "#C97A1E",
        info:    "#2B5FA8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};
export default config;
