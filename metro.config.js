// Metro, with Sentry's serializer: each bundle carries debug ids, so a crash report's
// stack can be matched to the source maps uploaded at build time (EAS, SENTRY_AUTH_TOKEN).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
