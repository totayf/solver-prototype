// Tokens come from the same file the app imports (`APP`, `APP_RADIUS`, `APP_FONT`), so a
// color or radius changes in one place for both `className` and JS-side props.
// Tailwind loads this file through jiti, which also transpiles the TypeScript import.
const { APP, APP_FONT, APP_RADIUS } = require("./src/shared/lib/app-tokens.ts");

const kebab = (s) => s.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
const fromEntries = (obj, skip = []) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !skip.includes(k))
      .map(([k, v]) => [kebab(k), v]),
  );

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // `bg-card`, `text-foreground-muted`, `border-primary-60`, …
      colors: fromEntries(APP),
      // `rounded-card`, `rounded-pill`, …
      borderRadius: Object.fromEntries(
        Object.entries(APP_RADIUS).map(([k, v]) => [kebab(k), `${v}px`]),
      ),
      // Custom fonts carry their weight in the family name, so these replace `font-medium`
      // & co. for text: `font-inter-semibold`, …
      fontFamily: {
        inter: [APP_FONT.regular],
        "inter-medium": [APP_FONT.medium],
        "inter-semibold": [APP_FONT.semibold],
        "inter-bold": [APP_FONT.bold],
      },
    },
  },
  plugins: [],
};
