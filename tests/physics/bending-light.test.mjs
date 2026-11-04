// V3 physics check for bending-light: injects the class drawer (adapters/bending-light/) into the themed build and
// runs tools/run-cases.mjs on adapters/bending-light/cases.json. Expected values in cases.json are computed
// from the textbook formulas, not copied from the sim. Skips when the themed build is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, themedBuild, injectTo } from '../drawer/helpers.mjs';

const ID = 'bending-light';
const run = promisify( execFile );
const src = themedBuild( ID );
const skip = src ? false : `no themed build: build ${ID} first (node tools/build-sim.mjs ${ID} --brand bsshs --theme) or set BSSHS_BUILD_DIR`;

test( `${ID}: every V3 case in adapters/${ID}/cases.json passes on the injected themed build`, { skip, timeout: 600000 }, async () => {
  const html = injectTo( src, `physics-${ID}.html`, { id: ID, repoRoot: ROOT } );
  let code = 0;
  let out = '';
  try { ( { stdout: out } = await run( process.execPath, [ 'tools/run-cases.mjs', html, ID ], { cwd: ROOT, timeout: 590000, maxBuffer: 1 << 24 } ) ); }
  catch ( e ) { if ( typeof e.code !== 'number' ) { throw e; } code = e.code; out = e.stdout || ''; }
  const lines = out.trim().split( '\n' ).filter( Boolean ).map( l => JSON.parse( l ) );
  const failed = lines.filter( l => l.type === 'case' && !l.ok );
  assert.equal( code, 0, `run-cases exit ${code}; failing cases:\n${JSON.stringify( failed, null, 1 )}` );
  const summary = lines.at( -1 );
  assert.equal( summary.type, 'summary' );
  assert.ok( summary.ok && summary.passed >= 4 && summary.failed === 0, JSON.stringify( summary ) );
} );
