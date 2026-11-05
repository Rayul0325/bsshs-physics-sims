// Per-sim color rules (theme/patches/sim-color.mjs): the grammar, the four guards and the rule shape.
// Guards pinned here, each by its own test: (a) model path refusal, (b) non-color match refusal,
// (c) only-the-literal diff, (d) Color.X -> new Color(...) with a value import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens } from '../../theme/index.mjs';
import {
  classifyColorLiteral, applyColorEdits, assertOnlyLiteralChanged, colorRulesFor, hasColorValueImport, replacementFor, MODEL_PATH_RE, COLOR_SCAN_SOURCE
} from '../../theme/patches/sim-color.mjs';
import { transformFile } from '../../theme/patches/engine.mjs';
import { readManifest } from '../../tools/lib/manifest.mjs';
import { readBlob } from '../../tools/lib/pinned.mjs';

const tokens = loadTokens();
const COPPER = tokens.sim.physics.copper;
const IMPORT = "import { Color, Rectangle } from '../../../../scenery/js/imports.js';\n";

test( 'the grammar accepts exactly the color literals and nothing dynamic', () => {
  for ( const ok of [ 'Color.BLACK', "'#abc'", '"#aabbcc"', "'#aabbccdd'", "'rgb( 1, 2, 3 )'", "'rgba(1,2,3,0.5)'", "'white'", '"red"',
                      'new Color( 1, 2, 3 )', 'new Color( 1, 2, 3, 0.5 )', "new Color( '#abcdef' )", "new Color( 'rgb(1,2,3)' )", 'new Color( 0xB2FCB7 )' ] ) {
    assert.ok( classifyColorLiteral( ok ), ok );
  }
  for ( const bad of [ 'Color.TRANSPARENT', "'transparent'", 'foo', 'Color', 'Color.black', "'not-a-color'", '`#${x}`', "'#abcde'", 'new Color( r, g, b )',
                       'new Color( someColor )', "colorProperty", "'string'", 'color.BLACK' ] ) {
    assert.equal( classifyColorLiteral( bad ), null, bad );
  }
  assert.equal( classifyColorLiteral( "'rgba(1,2,3,0.25)'" ).alpha, 0.25 );
  assert.equal( classifyColorLiteral( 'new Color( 1, 2, 3, 0.5 )' ).alpha, 0.5 );
} );

test( 'the generic scan finds every literal shape, with Color.X.withAlpha counted once', () => {
  const text = "a('red'); b(Color.BLACK.withAlpha( 0.5 )); c('#fff'); d(new Color( 1, 2, 3 )); e('rgba(1,2,3,.5)'); f('string')";
  assert.deepEqual( [ ...text.matchAll( new RegExp( COLOR_SCAN_SOURCE, 'g' ) ) ].map( m => m[ 0 ] ), [ "'red'", 'Color.BLACK', "'#fff'", 'new Color( 1, 2, 3 )', "'rgba(1,2,3,.5)'" ] );
} );

test( 'a quoted color becomes the token color in the same quotes; Color.X becomes new Color( token ) so .withAlpha still works', () => {
  const text = `${IMPORT}const a = { fill: 'white', stroke: Color.BLACK.withAlpha( 0.5 ), b: new Color( 1, 2, 3 ) };\n`;
  const out = applyColorEdits( text, [
    { find: "fill: ('white')", occurrence: 1, to: 'sim.physics.copper' },
    { find: 'stroke: (Color\\.BLACK)', occurrence: 1, to: 'sim.line' },
    { find: 'b: (new Color\\([^()]*\\))', occurrence: 1, to: 'sim.text' }
  ], { file: 'js/view/Foo.js', tokens } );
  assert.equal( out, `${IMPORT}const a = { fill: '${COPPER}', stroke: new Color( "${tokens.sim.line}" ).withAlpha( 0.5 ), b: new Color( "${tokens.sim.text}" ) };\n` );
} );

test( 'translucency is kept: an rgba literal mapped to an opaque token keeps its alpha', () => {
  assert.equal( replacementFor( classifyColorLiteral( "'rgba(0,0,0,0.25)'" ), '#336699' ), "'rgba(51, 102, 153, 0.25)'" );
  assert.equal( replacementFor( classifyColorLiteral( "'rgb(0,0,0)'" ), '#336699' ), "'#336699'" );
} );

test( 'guard (a1): the rule builder refuses a model path (real paths of the pinned sources)', () => {
  const style = { colors: [ { repo: 'faradays-law', file: 'js/common/model/FaradaysLawModel.js', find: "('white')", occurrence: 1, to: 'sim.surface' } ] };
  assert.throws( () => colorRulesFor( 'faradays-law', style, tokens ), /model path/ );
  for ( const f of [ 'js/common/model/X.js', 'js/faradays-law/model/Y.ts', 'js/model/Z.js' ] ) {
    assert.ok( MODEL_PATH_RE.test( f ), f );
    assert.throws( () => colorRulesFor( 'x', { colors: [ { repo: 'r', file: f, find: 'a', occurrence: 1, to: 'sim.surface' } ] }, tokens ), /model path/ );
  }
  assert.equal( MODEL_PATH_RE.test( 'js/view/ModelNode.js' ), false, 'only a directory called model counts' );
  assert.doesNotThrow( () => colorRulesFor( 'x', { colors: [ { repo: 'r', file: 'js/view/ModelNode.js', find: 'a', occurrence: 1, to: 'sim.surface' } ] }, tokens ) );
} );

test( 'guard (a2): the edit function itself refuses a model path, even when called directly', () => {
  assert.throws( () => applyColorEdits( "x('white')", [ { find: "x\\(('white')\\)", occurrence: 1, to: 'sim.surface' } ], { file: 'js/common/model/A.js', tokens } ), /model path/ );
  assert.doesNotThrow( () => applyColorEdits( "x('white')", [ { find: "x\\(('white')\\)", occurrence: 1, to: 'sim.surface' } ], { file: 'js/common/view/A.js', tokens } ) );
} );

test( 'guard (b): a match that is not a color literal is refused', () => {
  assert.throws( () => applyColorEdits( 'const x = foo.bar;', [ { find: 'foo\\.bar', occurrence: 1, to: 'sim.surface' } ], { file: 'js/view/A.js', tokens } ), /not a color literal/ );
  assert.throws( () => applyColorEdits( "const s = 'hello';", [ { find: "('hello')", occurrence: 1, to: 'sim.surface' } ], { file: 'js/view/A.js', tokens } ), /not a color literal/ );
  assert.throws( () => applyColorEdits( 'x = Color.TRANSPARENT;', [ { find: 'Color\\.TRANSPARENT', occurrence: 1, to: 'sim.surface' } ], { file: 'js/view/A.js', tokens } ), /not a color literal/ );
  assert.throws( () => applyColorEdits( "x = 'white' + y;", [ { find: "'white' \\+", occurrence: 1, to: 'sim.surface' } ], { file: 'js/view/A.js', tokens } ), /not a color literal/, 'the whole match must be the literal' );
} );

test( 'guard (c): the diff may change only the literal', () => {
  const before = "const a = 'white';\nconst b = 2;\n";
  const start = before.indexOf( "'white'" );
  const edit = { start, end: start + 7, replacement: "'#112233'" };
  assert.doesNotThrow( () => assertOnlyLiteralChanged( before, before.slice( 0, start ) + edit.replacement + before.slice( edit.end ), edit ) );
  assert.throws( () => assertOnlyLiteralChanged( before, before.slice( 0, start ) + edit.replacement + before.slice( edit.end ).replace( 'b = 2', 'b = 3' ), edit ), /outside the literal|length/ );
  assert.throws( () => assertOnlyLiteralChanged( before, before.replace( 'const a', 'let a' ).replace( "'white'", edit.replacement ), edit ), /outside the literal|length/ );
  assert.throws( () => assertOnlyLiteralChanged( before, before, edit ), /length/ );
} );

test( 'guard (d): Color.X needs a value import of Color; type-only imports do not count', () => {
  const edit = [ { find: 'Color\\.RED', occurrence: 1, to: 'sim.physics.positive' } ];
  assert.throws( () => applyColorEdits( 'const c = Color.RED;', edit, { file: 'js/view/A.js', tokens } ), /no value import of Color/ );
  assert.throws( () => applyColorEdits( "import type { Color } from 'x';\nconst c = Color.RED;", edit, { file: 'js/view/A.js', tokens } ), /no value import of Color/ );
  assert.throws( () => applyColorEdits( "import { type Color } from 'x';\nconst c = Color.RED;", edit, { file: 'js/view/A.js', tokens } ), /no value import of Color/ );
  assert.doesNotThrow( () => applyColorEdits( `${IMPORT}const c = Color.RED;`, edit, { file: 'js/view/A.js', tokens } ) );
  assert.ok( hasColorValueImport( "import Color from '../../../../scenery/js/util/Color.js';" ) );
  assert.ok( hasColorValueImport( "var Color = require( 'SCENERY/util/Color' );" ) );
  assert.ok( hasColorValueImport( "import Foo, { Color } from 'x';" ) );
} );

test( 'edit errors name the entry: missing occurrence, unknown token, overlapping edits', () => {
  assert.throws( () => applyColorEdits( "x('white')", [ { find: "('white')", occurrence: 2, to: 'sim.surface' } ], { file: 'js/a.js', tokens } ), /occurrence 2 not found \(1 match\)/ );
  assert.throws( () => applyColorEdits( "x('white')", [ { find: "('white')", occurrence: 1, to: 'sim.nope' } ], { file: 'js/a.js', tokens } ), /unknown color token/ );
  assert.throws( () => applyColorEdits( "x('white')", [ { find: "('white')", occurrence: 1, to: 'sim.surface' }, { find: "('white')", occurrence: 1, to: 'sim.line' } ], { file: 'js/a.js', tokens } ), /overlaps/ );
  assert.throws( () => applyColorEdits( 'x', [ { find: '(', occurrence: 1, to: 'sim.surface' } ], { file: 'js/a.js', tokens } ), /bad regex/ );
} );

test( 'occurrence counts the matches of the entry\'s own regex, in the pristine file', () => {
  const text = "a('white'); b('white'); c('white');";
  const out = applyColorEdits( text, [ { find: "\\w\\(('white')\\)", occurrence: 2, to: 'sim.physics.copper' } ], { file: 'js/a.js', tokens } );
  assert.equal( out, `a('white'); b('${COPPER}'); c('white');` );
} );

test( 'colorRulesFor builds one composable rule per file; the engine applies it like any other rule', () => {
  const style = { colors: [
    { repo: 'r', file: 'js/view/A.js', find: "fill: ('white')", occurrence: 1, to: 'sim.surface' },
    { repo: 'r', file: 'js/view/A.js', find: "stroke: ('black')", occurrence: 1, to: 'sim.line' },
    { repo: 'r', file: 'js/view/B.js', find: "fill: ('red')", occurrence: 1, to: 'sim.physics.positive' }
  ] };
  const rules = colorRulesFor( 'demo-sim', style, tokens );
  assert.equal( rules.length, 2 );
  assert.deepEqual( rules.map( r => r.kind ), [ 'sim-color', 'sim-color' ] );
  assert.ok( rules.every( r => /^[a-z0-9-]+$/.test( r.id ) && r.required && r.files.length === 1 && typeof r.content === 'function' ) );
  const r = transformFile( rules[ 0 ], Buffer.from( "x = { fill: 'white', stroke: 'black' };" ), {}, 'js/view/A.js' );
  assert.equal( r.content.toString(), `x = { fill: '${tokens.sim.surface}', stroke: '${tokens.sim.line}' };` );
  assert.equal( r.changed, true );
  assert.throws( () => colorRulesFor( 'x', { colors: [ { repo: 'r', file: '../x.js', find: 'a', occurrence: 1, to: 'sim.surface' } ] }, tokens ), /repo-relative/ );
  assert.throws( () => colorRulesFor( 'x', { colors: [ { repo: 'r', file: 'js/a.js', find: 'a', occurrence: 1, to: 'color.nope' } ] }, tokens ), /unknown color token/ );
} );

test( 'a real pinned source: the magnet colors of faradays-law map to the magnet tokens and nothing else changes', async t => {
  const m = await readManifest( 'faradays-law' );
  if ( !m ) { t.skip( 'source cache absent' ); return; }
  const file = 'js/faradays-law/view/MagnetNode.js';
  const text = ( await readBlob( 'faradays-law', m.deps[ 'faradays-law' ], file ) ).toString( 'utf8' );
  const [ rule ] = colorRulesFor( 'faradays-law', { colors: [
    { repo: 'faradays-law', file, find: "new Color\\( ('[^']*') \\)", occurrence: 1, to: 'sim.physics.magnetN' },
    { repo: 'faradays-law', file, find: "new Color\\( ('[^']*') \\)", occurrence: 2, to: 'sim.physics.magnetS' }
  ] }, tokens );
  const out = transformFile( rule, Buffer.from( text ), {}, file ).content.toString( 'utf8' );
  assert.ok( out.includes( `new Color( '${tokens.sim.physics.magnetN}' )` ) && out.includes( `new Color( '${tokens.sim.physics.magnetS}' )` ) );
  const a = text.split( '\n' );
  const b = out.split( '\n' );
  assert.equal( a.length, b.length );
  assert.equal( a.filter( ( l, i ) => l !== b[ i ] ).length, 2, 'exactly the two lines of the two literals differ' );
} );
