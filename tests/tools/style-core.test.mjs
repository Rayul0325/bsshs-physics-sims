// Pure rules of V11 (check-style) and V12 (compare-bounds): palette matching, contrast, findings, exceptions,
// the done list, bounds diff. Guards pinned by their own tests: (5) an exception without approvedBy is a problem and
// excuses nothing, (6) more than the allowed number of exceptions is a problem, (7) bounds differing beyond the
// tolerance are reported, (8) an empty done list is 0 of 0 only when it is a well-formed empty list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTokens } from '../../theme/index.mjs';
import { exceptionProblems, exceptionCovers, validateSimStyle } from '../../theme/sim-style.mjs';
import { classifyColors } from '../../tools/lib/style-page.mjs';
import {
  contrastRatio, compositeOver, matchPalette, pixelPalette, outsideShare, findingsOfView, groupFindings, applyExceptions, loadStyleDone, diffBounds, subtractScene, textKey
} from '../../tools/lib/style-core.mjs';
import { simPalette } from '../../theme/index.mjs';
import { makeResult, parseOnly } from '../../tools/lib/verify-core.mjs';
import { freezeBaseline, parseBoundsArgs } from '../../tools/compare-bounds.mjs';
import { parseStyleArgs } from '../../tools/check-style.mjs';

const tokens = loadTokens();
const tol = tokens.sim.check.paletteTolerance;
const rgb = hex => [ 1, 3, 5 ].map( i => parseInt( hex.slice( i, i + 2 ), 16 ) );

test( 'contrast follows WCAG: black on white is 21, the sim text on the sim canvas passes 4.5', () => {
  assert.equal( Math.round( contrastRatio( [ 0, 0, 0 ], [ 255, 255, 255 ] ) * 100 ) / 100, 21 );
  assert.ok( contrastRatio( rgb( tokens.sim.text ), rgb( tokens.sim.canvas ) ) > tokens.sim.check.minContrast );
  assert.ok( contrastRatio( rgb( tokens.sim.textOnDark ), rgb( tokens.sim.canvasDark ) ) > tokens.sim.check.minContrast );
  assert.ok( contrastRatio( rgb( tokens.sim.line ), rgb( tokens.sim.canvas ) ) < tokens.sim.check.minContrast, 'a hairline is not text' );
  assert.deepEqual( compositeOver( [ 0, 0, 0, 0.5 ], [ 200, 100, 0 ] ), [ 100, 50, 0 ] );
} );

test( 'matchPalette: token colors match, a translucent token never excuses an opaque color, pure black is outside', () => {
  const pal = simPalette( tokens );
  assert.equal( matchPalette( rgb( tokens.sim.physics.copper ), pal, tol ), 'sim.physics.copper' );
  assert.ok( matchPalette( [ ...rgb( tokens.sim.physics.copper ).map( v => v + 2 ), 0.4 ], pal, tol ), 'within the tolerance, any alpha' );
  assert.equal( matchPalette( [ 0, 0, 0, 1 ], pal, tol ), null, 'opaque black is not in the palette even though color.border is translucent black' );
  assert.equal( matchPalette( [ 0, 0, 0, 0.08 ], pal, tol ), 'color.border' );
  assert.equal( matchPalette( [ 0, 0, 0, 0.5 ], pal, tol ), null );
  assert.equal( matchPalette( [ 120, 200, 40 ], pal, tol ), null );
} );

test( 'classifyColors: palette colors and straight blends of two of them are inside; anything else is outside', () => {
  const palette = [ [ 255, 255, 255 ], [ 20, 30, 40 ] ];
  const mid = [ 137, 142, 147 ];
  assert.deepEqual( classifyColors( { colors: [ [ 255, 255, 255 ], [ 257 - 2, 254, 253 ], mid, [ 255, 0, 0 ], [ 137, 100, 147 ] ], palette, tol: 4 } ), [ true, true, true, false, false ] );
} );

test( 'outsideShare counts pixels, blends of palette colors included', () => {
  const pal = pixelPalette( tokens );
  const white = rgb( tokens.sim.surface );
  const canvas = rgb( tokens.sim.canvas );
  const r = outsideShare( { total: 100, colors: [ [ ...white, 60 ], [ ...canvas, 30 ], [ 255, 0, 0, 7 ], [ 0, 0, 0, 3 ] ] }, pal, tol );
  assert.equal( r.outside, 10 );
  assert.equal( r.share, 0.1 );
  assert.equal( r.top[ 0 ].color, '255,0,0' );
} );

const baseScene = () => ( { paints: [], texts: [], images: [], canvases: [], count: 5 } );
const view = { screen: 0 };
const opts = { declaredCanvas: [], pixelPalette: pixelPalette( tokens ) };

test( 'findingsOfView: fill and stroke outside the palette, gradients, original art, undeclared canvas nodes', () => {
  const scene = baseScene();
  scene.paints = [
    { role: 'fill', node: 'scenery.Path', type: 'color', rgba: rgb( tokens.sim.physics.copper ).concat( 1 ), bounds: [ 0, 0, 5, 5 ] },
    { role: 'fill', node: 'scenery.Path', type: 'color', rgba: [ 10, 200, 30, 1 ], bounds: [ 0, 0, 5, 5 ] },
    { role: 'stroke', node: 'scenery.Rectangle', type: 'color', rgba: [ 0, 0, 0, 1 ], bounds: [ 0, 0, 5, 5 ] },
    { role: 'fill', node: 'scenery.Circle', type: 'gradient', rgba: null, bounds: [ 0, 0, 5, 5 ] }
  ];
  scene.images = [ { node: 'scenery.Image', bounds: [ 0, 0, 5, 5 ], w: 2, h: 2, bytesSha: 'aa', pixelSha: 'bb' }, { node: 'scenery.Image', bounds: [ 0, 0, 5, 5 ], w: 3, h: 3, bytesSha: 'cc', pixelSha: 'dd' } ];
  scene.canvases = [ { node: 'wave.WaveCanvasNode', bounds: [ 0, 0, 5, 5 ] }, { node: 'wave.OtherCanvasNode', bounds: [ 0, 0, 5, 5 ] } ];
  const { findings } = findingsOfView( view, { scene, shot: null, originals: new Map( [ [ 'p:bb', 'scenery-phet/images/eraser.png' ] ] ) }, tokens, { ...opts, declaredCanvas: [ 'WaveCanvasNode' ] } );
  assert.deepEqual( findings.map( f => `${f.kind}:${f.node}${f.color ? `:${f.color}` : ''}` ), [
    'fill:scenery.Path:10,200,30', 'stroke:scenery.Rectangle:0,0,0', 'gradient:scenery.Circle', 'canvas:wave.OtherCanvasNode', 'image:scenery-phet/images/eraser.png' ] );
} );

test( 'findingsOfView: the pixel share limit and the contrast limit come from the tokens', () => {
  const scene = baseScene();
  scene.texts = [ { text: 'low', node: 'scenery.Text', bounds: [ 1, 1, 20, 8 ], fill: [ 200, 200, 200, 1 ] }, { text: 'high', node: 'scenery.Text', bounds: [ 30, 1, 20, 8 ], fill: rgb( tokens.sim.text ).concat( 1 ) } ];
  const canvas = rgb( tokens.sim.canvas );
  const shot = { total: 1000, colors: [ [ ...canvas, 940 ], [ 255, 0, 0, 60 ] ], backgrounds: { [ textKey( scene.texts[ 0 ] ) ]: canvas, [ textKey( scene.texts[ 1 ] ) ]: canvas } };
  const { findings, stats } = findingsOfView( view, { scene, shot, originals: new Map() }, tokens, opts );
  assert.deepEqual( findings.map( f => f.kind ), [ 'pixels', 'contrast' ] );
  assert.equal( findings[ 1 ].node, 'low' );
  assert.equal( stats.outsideShare, 0.06 );
  assert.equal( stats.worstContrast.text, 'low' );
  shot.colors[ 1 ][ 3 ] = 10; shot.colors[ 0 ][ 3 ] = 990;
  assert.equal( findingsOfView( view, { scene, shot, originals: new Map() }, tokens, opts ).findings.filter( f => f.kind === 'pixels' ).length, 0, 'a screen within the limit passes' );
} );

test( 'groupFindings merges equal findings and counts them', () => {
  const f = { kind: 'fill', screen: 0, node: 'a', color: '1,2,3' };
  const g = groupFindings( [ f, f, { ...f, screen: 1 }, { ...f, dialog: 'keyboardHelp' } ] );
  assert.deepEqual( g.map( x => x.count ), [ 2, 1, 1 ] );
} );

test( 'subtractScene leaves only what a dialog adds on top of the screen', () => {
  const p = ( node, x ) => ( { role: 'fill', node, bounds: [ x, 0, 5, 5 ], rgba: [ 1, 2, 3, 1 ] } );
  const base = { ...baseScene(), paints: [ p( 'a', 0 ), p( 'b', 10 ) ] };
  const dialog = { ...baseScene(), paints: [ p( 'a', 0 ), p( 'b', 10 ), p( 'c', 20 ) ] };
  assert.deepEqual( subtractScene( dialog, base ).paints.map( x => x.node ), [ 'c' ] );
} );

test( 'exceptionCovers: kind and every field the exception names; node by full or class name', () => {
  const f = { kind: 'fill', screen: 1, node: 'wave.SpectrumNode', color: '1,2,3' };
  assert.ok( exceptionCovers( f, { kind: 'fill' } ) );
  assert.ok( exceptionCovers( f, { kind: 'fill', node: 'SpectrumNode', screen: 1 } ) );
  assert.ok( exceptionCovers( f, { kind: 'fill', node: 'wave.SpectrumNode', color: '1,2,3' } ) );
  assert.ok( !exceptionCovers( f, { kind: 'stroke' } ) );
  assert.ok( !exceptionCovers( f, { kind: 'fill', screen: 2 } ) );
  assert.ok( !exceptionCovers( f, { kind: 'fill', node: 'Other' } ) );
  assert.ok( !exceptionCovers( f, { kind: 'fill', dialog: 'preferences' } ) );
} );

test( 'guard (5a): an exception without approvedBy (or without a reason) is a problem', () => {
  const ok = { kind: 'fill', reason: 'wavelength colors are physics', approvedBy: 'review of 2026-11-05' };
  assert.deepEqual( exceptionProblems( { exceptions: [ ok ] }, 20 ), [] );
  assert.match( exceptionProblems( { exceptions: [ { kind: 'fill', reason: 'r' } ] }, 20 )[ 0 ], /no approvedBy/ );
  assert.match( exceptionProblems( { exceptions: [ { kind: 'fill', reason: 'r', approvedBy: '  ' } ] }, 20 )[ 0 ], /no approvedBy/ );
  assert.match( exceptionProblems( { exceptions: [ { kind: 'fill', approvedBy: 'x' } ] }, 20 )[ 0 ], /no reason/ );
  assert.deepEqual( exceptionProblems( null, 20 ), [] );
} );

test( 'guard (5b): findings under an unapproved exception stay open', () => {
  const findings = [ { kind: 'fill', screen: 0, node: 'a', color: '1,2,3', count: 1 } ];
  const approved = applyExceptions( findings, { exceptions: [ { kind: 'fill', reason: 'r', approvedBy: 'x' } ] }, tokens );
  assert.equal( approved.open.length, 0 );
  assert.equal( approved.excepted.length, 1 );
  const unapproved = applyExceptions( findings, { exceptions: [ { kind: 'fill', reason: 'r' } ] }, tokens );
  assert.equal( unapproved.open.length, 1, 'no approver, no excuse' );
  assert.equal( unapproved.excepted.length, 0 );
  assert.equal( applyExceptions( findings, { exceptions: [ { kind: 'stroke', reason: 'r', approvedBy: 'x' } ] }, tokens ).unusedExceptions.length, 1 );
} );

test( 'guard (6): more exceptions than sim.check.maxExceptions is a problem', () => {
  const mk = n => ( { exceptions: Array.from( { length: n }, () => ( { kind: 'fill', reason: 'r', approvedBy: 'x' } ) ) } );
  assert.equal( tokens.sim.check.maxExceptions, 20 );
  assert.deepEqual( exceptionProblems( mk( 20 ), tokens.sim.check.maxExceptions ), [] );
  assert.match( exceptionProblems( mk( 21 ), tokens.sim.check.maxExceptions )[ 0 ], /21 exceptions, more than 20/ );
} );

test( 'validateSimStyle: structure of colors, canvasNodes and exceptions', () => {
  const good = { colors: [ { repo: 'r', file: 'js/a.js', find: 'x', occurrence: 1, to: 'sim.surface' } ], canvasNodes: [ 'WaveCanvasNode' ], exceptions: [ { kind: 'fill', screen: -1, color: '1,2,3', reason: 'r', approvedBy: 'x' } ] };
  assert.deepEqual( validateSimStyle( good, tokens ), [] );
  const bad = validateSimStyle( { colors: [ { repo: 'r', file: 'js/model/a.js', find: '(', occurrence: 0, to: 'nope' } ], canvasNodes: 'x', exceptions: [ { kind: 'smell', color: 'red' } ], extra: 1 }, tokens, 'demo' );
  for ( const re of [ /model path/, /not a regex/, /positive integer/, /to:/, /canvasNodes/, /kind must be/, /color must look like/, /unknown key extra/ ] ) { assert.ok( bad.some( p => re.test( p ) ), String( re ) ); }
} );

test( 'guard (8): data/style-done.json is 0 of 0 only as a well-formed empty list', async () => {
  const dir = await mkdtemp( path.join( tmpdir(), 'style-done-' ) );
  try {
    const f = name => path.join( dir, name );
    await writeFile( f( 'empty.json' ), '[]\n' );
    await writeFile( f( 'two.json' ), '["a","b"]' );
    await writeFile( f( 'dup.json' ), '["a","a","zzz"]' );
    await writeFile( f( 'obj.json' ), '{}' );
    await writeFile( f( 'broken.json' ), '[' );
    const known = [ 'a', 'b' ];
    assert.deepEqual( loadStyleDone( f( 'empty.json' ), known ), { ids: [], empty: true, problems: [] } );
    assert.deepEqual( loadStyleDone( f( 'two.json' ), known ), { ids: [ 'a', 'b' ], empty: false, problems: [] } );
    assert.equal( loadStyleDone( f( 'dup.json' ), known ).problems.length, 2 );
    for ( const bad of [ 'obj.json', 'broken.json', 'missing.json' ] ) {
      const r = loadStyleDone( f( bad ), known );
      assert.equal( r.empty, false, bad );
      assert.ok( r.problems.length, bad );
    }
    // the V-item: an empty list passes only with allowEmpty; nothing else may pass with total 0
    assert.equal( makeResult( 'V11', { passed: 0, total: 0, allowEmpty: true } ).ok, true );
    assert.equal( makeResult( 'V11', { passed: 0, total: 0 } ).ok, false );
    assert.equal( makeResult( 'V12', { passed: 0, total: 0 } ).ok, false );
    assert.equal( makeResult( 'V11', { passed: 0, total: 0, allowEmpty: true, failures: [ { id: 'x' } ] } ).ok, false );
    assert.equal( makeResult( 'V11', { passed: 0, total: 0, allowEmpty: true, exitCode: 2 } ).ok, false );
    assert.equal( makeResult( 'V11', { passed: 1, total: 2, allowEmpty: true } ).ok, false );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

const node = ( p, b, extra = {} ) => ( { path: p, name: 'scenery.Path', visible: true, b, ...extra } );

test( 'guard (7): diffBounds reports a node moved or resized beyond the tolerance and none within it', () => {
  const tolPx = tokens.sim.check.boundsTolerance;
  assert.equal( tolPx, 0.5 );
  const base = [ node( 'r.0', [ 10, 10, 100, 50 ] ), node( 'r.1', [ 0, 0, 20, 20 ] ) ];
  assert.equal( diffBounds( base, [ node( 'r.0', [ 10.4, 9.6, 100.5, 49.6 ] ), node( 'r.1', [ 0, 0, 20, 20 ] ) ], tolPx ).changed.length, 0, 'within 0.5 px' );
  const moved = diffBounds( base, [ node( 'r.0', [ 10.6, 10, 100, 50 ] ), node( 'r.1', [ 0, 0, 20, 20 ] ) ], tolPx );
  assert.equal( moved.changed.length, 1 );
  assert.deepEqual( moved.changed[ 0 ].delta, [ 0.6, 0, 0, 0 ] );
  const resized = diffBounds( base, [ node( 'r.0', [ 10, 10, 100, 50.7 ] ), node( 'r.1', [ 0, 0, 20, 20 ] ) ], tolPx );
  assert.equal( resized.changed.length, 1 );
} );

test( 'diffBounds also reports nodes that vanished, appeared or changed visibility; invisible-in-both nodes are ignored', () => {
  const base = [ node( 'r.0', [ 0, 0, 5, 5 ] ), node( 'r.1', [ 0, 0, 5, 5 ] ), node( 'r.2', [ 0, 0, 5, 5 ], { visible: false } ), node( 'r.3', [ 0, 0, 5, 5 ] ) ];
  const cur = [ node( 'r.0', [ 0, 0, 5, 5 ] ), node( 'r.2', [ 99, 99, 5, 5 ], { visible: false } ), node( 'r.3', [ 0, 0, 5, 5 ], { visible: false } ), node( 'r.4', [ 1, 1, 5, 5 ] ) ];
  const d = diffBounds( base, cur, 0.5 );
  assert.deepEqual( d.missing.map( n => n.path ), [ 'r.1' ] );
  assert.deepEqual( d.added.map( n => n.path ), [ 'r.4' ] );
  assert.deepEqual( d.visibility.map( n => n.path ), [ 'r.3' ] );
  assert.equal( d.changed.length, 0 );
  assert.equal( d.compared, 1 );
  assert.equal( diffBounds( [ node( 'r.0', [ 0, 0, 1, 1 ] ) ], [ { ...node( 'r.0', [ 0, 0, 1, 1 ] ), name: 'scenery.Rectangle' } ], 0.5 ).missing.length, 1, 'a different class at the same path is a different node' );
} );

test( 'V11 and V12 are known checks; --only selects them', () => {
  assert.deepEqual( parseOnly( 'V11,V12' ), [ 'V11', 'V12' ] );
  assert.ok( parseOnly( null ).includes( 'V11' ) && parseOnly( null ).includes( 'V12' ) );
  assert.deepEqual( parseOnly( 'V10' ), [ 'V10a', 'V10b', 'V10c' ] );
} );

test( 'compare-bounds --freeze refuses to overwrite a baseline without --force, and never half-writes one', async () => {
  const dir = await mkdtemp( path.join( tmpdir(), 'baseline-' ) );
  try {
    const sims = path.join( dir, 'sims' );
    const base = path.join( dir, 'base' );
    const { mkdir } = await import( 'node:fs/promises' );
    for ( const id of [ 'aa', 'bb' ] ) { await mkdir( path.join( sims, id ), { recursive: true } ); await writeFile( path.join( sims, id, `${id}_ko.html` ), `<html>${id}</html>` ); }
    const r = await freezeBaseline( { simsDir: sims, baselineDir: base, force: false, ids: [ 'aa', 'bb' ] } );
    assert.equal( r.count, 2 );
    await assert.rejects( () => freezeBaseline( { simsDir: sims, baselineDir: base, force: false, ids: [ 'aa', 'bb' ] } ), /already exists.*--force/ );
    await writeFile( path.join( sims, 'aa', 'aa_ko.html' ), '<html>changed</html>' );
    await assert.rejects( () => freezeBaseline( { simsDir: sims, baselineDir: base, force: false, ids: [ 'aa', 'bb' ] } ), /already exists/ );
    const kept = JSON.parse( ( await import( 'node:fs' ) ).readFileSync( path.join( base, 'baseline.json' ), 'utf8' ) );
    assert.equal( kept.count, 2 );
    assert.equal( ( await import( 'node:fs' ) ).readFileSync( path.join( base, 'aa', 'aa_ko.html' ), 'utf8' ), '<html>aa</html>', 'the baseline is untouched' );
    await freezeBaseline( { simsDir: sims, baselineDir: base, force: true, ids: [ 'aa', 'bb' ] } );
    assert.equal( ( await import( 'node:fs' ) ).readFileSync( path.join( base, 'aa', 'aa_ko.html' ), 'utf8' ), '<html>changed</html>', '--force replaces it' );
    await rm( path.join( sims, 'bb' ), { recursive: true } );
    await assert.rejects( () => freezeBaseline( { simsDir: sims, baselineDir: base, force: true, ids: [ 'aa', 'bb' ] } ), /no build for 1 sim/ );
    assert.equal( ( await import( 'node:fs' ) ).readFileSync( path.join( base, 'aa', 'aa_ko.html' ), 'utf8' ), '<html>changed</html>', 'a failed freeze leaves the old baseline in place' );
  }
  finally { await rm( dir, { recursive: true, force: true } ); }
} );

test( 'argument parsing of the style tools', () => {
  assert.equal( parseBoundsArgs( [ '--freeze', '--force' ] ).force, true );
  assert.equal( parseBoundsArgs( [ 'wave-on-a-string', '--nondeterministic' ] ).deterministic, false );
  assert.equal( parseBoundsArgs( [ 'x' ] ).deterministic, true );
  assert.throws( () => parseBoundsArgs( [] ), /usage/ );
  assert.throws( () => parseBoundsArgs( [ '--bogus' ] ), /unknown option/ );
  assert.equal( parseStyleArgs( [ 'build/bsshs-theme/faradays-law/faradays-law_ko.html' ] ).id, 'faradays-law' );
  assert.equal( parseStyleArgs( [ 'x.html', '--id', 'other', '--no-dialogs' ] ).dialogs, false );
  assert.throws( () => parseStyleArgs( [] ), /usage/ );
} );
