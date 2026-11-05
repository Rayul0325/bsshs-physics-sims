// The generated token module of the original sims (theme/sim-tokens-module.mjs) and the staging hook that writes it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTokens } from '../../theme/index.mjs';
import { simTokensModuleSource, generatedSimFiles, SIM_TOKENS_FILE } from '../../theme/sim-tokens-module.mjs';
import { stageSim, unstageSim } from '../../tools/lib/new-sims.mjs';

const tokens = loadTokens();

test( 'the module carries the sim and color groups as readonly constants, without the numeric checks', () => {
  const text = simTokensModuleSource( tokens );
  assert.match( text, /^\/\/ Copyright 2026, bsshs-physics-sims contributors\n\/\/ SPDX-License-Identifier: GPL-3\.0-only\n/ );
  assert.ok( text.includes( `canvas: '${tokens.sim.canvas}'` ) );
  assert.ok( text.includes( `electron: '${tokens.sim.physics.electron}'` ) );
  assert.ok( text.includes( `borderStrong: '${tokens.color.borderStrong}'` ) );
  assert.ok( !/check:|paletteTolerance/.test( text ) );
  assert.ok( text.includes( '} as const;' ) && text.includes( 'export default SimTokens;' ) );
  assert.equal( simTokensModuleSource( tokens ), text, 'same tokens, same text' );
  const t = JSON.parse( JSON.stringify( tokens ) );
  t.sim.physics.electron = '#123456';
  assert.ok( simTokensModuleSource( t ).includes( "electron: '#123456'" ) );
} );

test( 'stageSim writes the generated files into the staged copy only, and refuses to shadow a source file', async () => {
  const dir = await mkdtemp( path.join( tmpdir(), 'bsshs-gen-' ) );
  try {
    const src = path.join( dir, 'src' );
    await mkdir( path.join( src, 'js', 'view' ), { recursive: true } );
    await writeFile( path.join( src, 'package.json' ), '{"name":"x"}\n' );
    await writeFile( path.join( src, 'js', 'view', 'A.ts' ), 'export {};\n' );
    const dest = path.join( dir, 'slot', 'x' );
    const keep = path.join( dir, 'keep' );
    const generated = generatedSimFiles( tokens );
    const a = await stageSim( src, dest, { keepDir: keep, generated } );
    assert.ok( a.files.includes( SIM_TOKENS_FILE ) );
    assert.equal( await readFile( path.join( dest, SIM_TOKENS_FILE ), 'utf8' ), generated[ SIM_TOKENS_FILE ] );
    assert.ok( !existsSync( path.join( src, SIM_TOKENS_FILE ) ), 'nothing is written under sims/' );
    const b = await stageSim( src, dest, { keepDir: keep, generated } );
    assert.equal( b.sha, a.sha, 'same source and tokens give the same staged commit' );
    const c = await stageSim( src, dest, { keepDir: keep, generated: generatedSimFiles( { ...tokens, sim: { ...tokens.sim, canvas: '#123456' } } ) } );
    assert.notEqual( c.sha, a.sha, 'a token change changes the staged commit' );
    await assert.rejects( stageSim( src, dest, { keepDir: keep, generated: { 'js/view/A.ts': 'x' } } ), /would overwrite a source file/ );
    await unstageSim( dest, { keepDir: keep } );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );
