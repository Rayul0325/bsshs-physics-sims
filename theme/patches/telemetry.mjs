// Outbound-traffic-off patches: PhET statistics (yotta pings, Google Analytics / Tag Manager) and
// update checks. The adapted-from-phet brand already skips most of these at runtime; these patches
// remove the code paths themselves so a student device never contacts any other origin.

/** Content written in place of PhET's analytics preload (it is a plain script, not a module). */
const ANALYTICS_STUB = '// bsshs outbound-traffic-off: PhET\'s statistics preload was removed at build time.\n';

/** @type {import('./engine.mjs').PatchRule[]} */
export const TELEMETRY_RULES = [
  {
    id: 'telemetry-google-analytics',
    kind: 'telemetry',
    repo: 'phetcommon',
    files: [ 'js/analytics/google-analytics.js' ],
    required: false,
    why: 'Replace the analytics preload (yotta immediate/sanity pings, gtag/gtm loaders) with an empty stub.',
    content: () => ANALYTICS_STUB
  },
  {
    id: 'telemetry-update-check',
    kind: 'telemetry',
    repo: 'joist',
    files: [ 'js/updateCheck.ts', 'js/updateCheck.js', 'js/UpdateCheck.js' ],
    required: true,
    why: 'areUpdatesChecked = false: never ask phet.colorado.edu for a newer version.',
    edits: [ {
      find: /(areUpdatesChecked\s*[:=]\s*)([^,;\n]*(?:Brand\.id|phet\.chipper\.brand)[^,;\n]*)/,
      replace: ( env, m, head ) => `${head}false`
    } ]
  },
  {
    id: 'telemetry-yotta-default',
    kind: 'telemetry',
    repo: 'chipper',
    files: [ 'js/browser/initialize-globals.ts', 'js/browser/initialize-globals.js', 'js/initialize-globals.js' ],
    required: false,
    why: 'Default of the ?yotta query parameter (statistics on/off) -> false.',
    edits: [ {
      find: /(\byotta: \{[^{}]*?defaultValue: )true\b/,
      replace: ( env, m, head ) => `${head}false`
    } ]
  }
];
