// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // The board reader's page is generated (scripts/build-board-reader.mjs) and mostly pdf.js.
    ignores: ["dist/*", ".expo/*", "node_modules/*", "android/*", "ios/*", "**/*.generated.ts"],
  },
  {
    // Ported from HueVistaFrontEnd/src/lib as they are, so the two can be diffed and kept
    // in step — the website writes ReadonlyArray<T>.
    files: [
      "src/lib/color.ts",
      "src/lib/color-science.ts",
      "src/lib/colour-*.ts",
      "src/lib/shade-*.ts",
      "src/lib/__tests__/colo*.test.ts",
      "src/lib/__tests__/shade-*.test.ts",
      "src/lib/__fixtures__/*.ts",
    ],
    rules: { "@typescript-eslint/array-type": "off" },
  },
]);
