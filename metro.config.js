const { getPostHogExpoConfig } = require('posthog-react-native/metro');

const config = getPostHogExpoConfig(__dirname);

// posthog-react-native's optional surveys/error-tracking submodules are only reachable
// via @posthog/core's package.json "exports" map (no top-level file), and Metro doesn't
// honor "exports" maps unless this is turned on.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
