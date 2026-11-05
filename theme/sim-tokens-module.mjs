// The token module of the original sims (sims/<id>): TypeScript source text generated from theme/tokens.json at
// staging time (tools/build-new-sim.mjs writes it into the staged copy as js/view/SimTokens.ts). It is NEVER
// committed under sims/, because tests/new-sims/sources.test.mjs forbids color values in sim sources: the sim
// code imports `SimTokens` and reads roles (`SimTokens.physics.electron`) instead of writing colors.
import { TOKENS_JSON } from './index.mjs';

/** Where the module lands inside a staged sim, relative to the sim folder. */
export const SIM_TOKENS_FILE = 'js/view/SimTokens.ts';

/**
 * Source text of `SimTokens.ts`: the `color` group, the `sim` group (without `check`) as readonly string constants.
 * Same tokens -> same text (the new-sim build hash already covers the whole `sim` group and every non-sim token).
 * @param {any} tokens
 * @returns {string}
 */
export function simTokensModuleSource( tokens ) {
  const { check, ...sim } = tokens.sim; // `check` holds numbers for the V11/V12 tools, not colors
  const body = JSON.stringify( { ...sim, color: tokens.color }, null, 2 ).replace( /"([A-Za-z0-9_]+)":/g, '$1:' ).replace( /"/g, '\'' );
  return [
    '// Copyright 2026, bsshs-physics-sims contributors',
    '// SPDX-License-Identifier: GPL-3.0-only',
    '',
    `// GENERATED at staging time from ${TOKENS_JSON.split( '/' ).slice( -2 ).join( '/' )} by theme/sim-tokens-module.mjs. Not committed; do not edit.`,
    `const SimTokens = ${body} as const;`,
    '',
    'export default SimTokens;',
    ''
  ].join( '\n' );
}

/**
 * The files stageSim adds to a staged sim.
 * @param {any} tokens
 * @returns {Record<string, string>}
 */
export function generatedSimFiles( tokens ) {
  return { [ SIM_TOKENS_FILE ]: simTokensModuleSource( tokens ) };
}
