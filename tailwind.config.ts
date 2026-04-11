import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Terminal dark palette
        surface: {
          0: "#0a0b0d",
          1: "#0f1012",
          2: "#14161a",
          3: "#1c1f24",
          4: "#252930",
        },
        border: {
          DEFAULT: "#2a2d35",
          subtle: "#1e2128",
          accent: "#3d4250",
        },
        text: {
          primary: "#e8eaed",
          secondary: "#9aa0b0",
          muted: "#5c6370",
        },
        // Strategy colors
        strat: {
          a: "#00d4aa",   // teal — Strategy A
          b: "#7c6af7",   // purple — Strategy B
          "a-dim": "#00d4aa33",
          "b-dim": "#7c6af733",
        },
        // Financial semantic colors
        bull: "#26a69a",
        bear: "#ef5350",
        neutral: "#ffa726",
        "bull-dim": "#26a69a22",
        "bear-dim": "#ef535022",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
