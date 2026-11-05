const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// ── Config ──────────────────────────────────────────────────────────────────────

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// NativeWind compiles `src/global.css` + tailwind.config.js. `inlineRem: 16` makes the
// spacing scale match the web (`p-4` = 16px) instead of NativeWind's 14px default.
module.exports = withNativeWind(config, {
  input: "./src/global.css",
  inlineRem: 16,
});
