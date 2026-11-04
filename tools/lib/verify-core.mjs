// Pure helpers for tools/verify.mjs (spec 5): report aggregation, the --only filter, the exclusion rule
// (spec 3.6), the patch allow-list check (V10b, invariant 9), the private-name scan with redaction (V10c)
// and the test-group split of the npm test run (V4, V5, V6, V10a). Nothing here starts a browser or a
// child process, so every rule is unit-tested in tests/verify/.
import { createHash } from 'node:crypto';

/** Every V-item the verifier knows, in report order. `TEST` is the whole npm test run. */
export const CHECK_IDS = Object.freeze( [ 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V9', 'V10a', 'V10b', 'V10c', 'TEST' ] );

/** Short Korean names for the summary lines. */
export const CHECK_NAMES = Object.freeze( {
  V1: '빌드', V2: 'check-sim', V3: '물리 검사', V4: '서랍 기록', V5: '확인 상태·해시', V6: '목록 사이트',
  V9: '닫힌 서랍 화면 비교', V10a: '디자인 값 위치', V10b: '패치 허용 목록', V10c: '실명 검색', TEST: 'npm test 전체'
} );

/**
 * Parses `--only V2,V9` (case-insensitive, `V10` = V10a+V10b+V10c, `TEST`/`npm` = the whole test run).
 * @param {string|null|undefined} spec
 * @returns {string[]} selected ids in report order
 */
export function parseOnly( spec ) {
  if ( spec === null || spec === undefined || spec === '' ) { return [ ...CHECK_IDS ]; }
  const want = new Set();
  for ( const raw of String( spec ).split( ',' ).map( s => s.trim() ).filter( Boolean ) ) {
    const s = raw.toUpperCase();
    if ( s === 'V10' ) { [ 'V10a', 'V10b', 'V10c' ].forEach( x => want.add( x ) ); continue; }
    if ( s === 'NPM' || s === 'TEST' ) { want.add( 'TEST' ); continue; }
    const id = CHECK_IDS.find( c => c.toUpperCase() === s );
    if ( !id ) { throw new Error( `unknown check ${raw} (known: ${CHECK_IDS.join( ', ' )}, V10)` ); }
    want.add( id );
  }
  return CHECK_IDS.filter( c => want.has( c ) );
}

/**
 * One check result. `passed`/`total` count the units (sims, runs, tests); `exitCode` is the check's own
 * status (0 = pass). A check passes only when exitCode is 0, nothing failed and total > 0.
 * @param {string} id
 * @param {{ passed: number, total: number, failures?: object[], notes?: string[], exitCode?: number, ms?: number, details?: any }} r
 */
export function makeResult( id, r ) {
  const failures = r.failures || [];
  const ok = ( r.exitCode ?? 0 ) === 0 && failures.length === 0 && r.total > 0 && r.passed === r.total;
  return { id, name: CHECK_NAMES[ id ], ok, exitCode: ok ? 0 : ( r.exitCode || 1 ), passed: r.passed, total: r.total,
           failures, notes: r.notes || [], ms: r.ms ?? null, details: r.details ?? null };
}

/**
 * Aggregates results into the report written to build/verify/report.json.
 * @param {ReturnType<typeof makeResult>[]} results
 * @param {{ selected: string[], startedAt: string, ms: number, exclusions?: object[] }} meta
 */
export function aggregate( results, meta ) {
  const byId = Object.fromEntries( results.map( r => [ r.id, r ] ) );
  const missing = meta.selected.filter( id => !byId[ id ] );
  const failed = results.filter( r => !r.ok ).map( r => r.id ).concat( missing );
  return {
    tool: 'verify', schemaVersion: 1, startedAt: meta.startedAt, ms: meta.ms,
    selected: meta.selected, ok: failed.length === 0, failed,
    exclusions: meta.exclusions || [],
    checks: meta.selected.map( id => byId[ id ] || makeResult( id, { passed: 0, total: 0, exitCode: 2, failures: [ { error: 'check did not run' } ] } ) )
  };
}

/**
 * The one-line Korean summary of a check, e.g. `V2 check-sim 136/136 통과`.
 * @param {ReturnType<typeof makeResult>} r
 * @returns {string}
 */
export function summaryLine( r ) {
  const head = `${r.ok ? '통과' : '실패'}  ${r.id.padEnd( 4 )} ${r.name} ${r.passed}/${r.total}`;
  const fail = r.ok ? '' : ` — 실패 ${Math.max( r.total - r.passed, r.failures.length )}건${r.failures.length ? `: ${r.failures.slice( 0, 3 ).map( describeFailure ).join( '; ' )}${r.failures.length > 3 ? ' …' : ''}` : ''}`;
  return head + fail;
}

/** @param {any} f */
function describeFailure( f ) {
  return [ f.id, f.width ? `${f.width}px` : null, f.error || f.reason || f.what ].filter( Boolean ).join( ' ' ).slice( 0, 160 );
}

/**
 * Spec 3.6: a NEW (original) sim that fails V3 is excluded from the public site, whole.
 * PhET adaptations that fail V3 are not excluded here: they fail V3 and are reported.
 * @param {{ id: string, ok: boolean }[]} v3 - per-sim V3 outcome
 * @param {string[]} newIds - the original sims (sims/<id>)
 * @returns {{ id: string, reason: string }[]}
 */
export function exclusionsFromV3( v3, newIds ) {
  const isNew = new Set( newIds );
  return v3.filter( r => isNew.has( r.id ) && !r.ok ).map( r => ( { id: r.id, reason: 'V3 물리 검사 실패 (사양 3.6: 새 시뮬레이션 통째로 공개 제외)' } ) );
}

/**
 * V1 count rule: the build count is the number of sims that are built AND published. An excluded sim
 * lowers it below the expected total, so V1 fails instead of passing silently.
 * @param {{ expected: string[], built: Set<string>|string[], published: Set<string>|string[], excluded: { id: string, reason: string }[] }} input
 */
export function buildCount( { expected, built, published, excluded } ) {
  const b = new Set( built );
  const p = new Set( published );
  const ex = new Map( excluded.map( e => [ e.id, e.reason ] ) );
  const failures = [];
  let passed = 0;
  for ( const id of expected ) {
    if ( ex.has( id ) ) { failures.push( { id, reason: `공개 제외: ${ex.get( id )}` } ); continue; }
    if ( !b.has( id ) ) { failures.push( { id, reason: '빌드 결과 없음 또는 빌드 실패' } ); continue; }
    if ( !p.has( id ) ) { failures.push( { id, reason: '사이트(dist/sims)에 없음' } ); continue; }
    passed++;
  }
  const extra = [ ...p ].filter( id => !expected.includes( id ) );
  for ( const id of extra ) { failures.push( { id, reason: '목록에 없는 시뮬레이션이 사이트에 있음' } ); }
  return { passed, total: expected.length, failures };
}

// ---------------------------------------------------------------------------------------------------
// V10b: patch allow-list (invariant 9)
// ---------------------------------------------------------------------------------------------------

/**
 * What a patch of each kind may touch in the throwaway slot checkout: `repo` + a pattern for the
 * repo-relative file. Written independently of the rule lists (theme/patches, brand/bsshs/patches.mjs,
 * theme/patches/terms.mjs) so a rule that strays (a sim repo, model code, another library file) fails.
 * theme = common UI defaults; brand = the brand folder PhET reserves for third-party builds plus the
 * menu-button name strings; telemetry = the outbound-traffic switch; terms = Korean string files only.
 */
export const PATCH_ALLOWLIST = Object.freeze( {
  telemetry: [
    { repo: 'phetcommon', file: /^js\/analytics\/google-analytics\.js$/ },
    { repo: 'joist', file: /^js\/[uU]pdateCheck\.(js|ts)$/ },
    { repo: 'chipper', file: /^js\/(browser\/)?initialize-globals\.(js|ts)$/ }
  ],
  brand: [
    { repo: 'brand', file: /^adapted-from-phet\/(js\/Brand\.(js|ts)|images\/[A-Za-z0-9_.-]+)$/ },
    { repo: 'joist', file: /^(joist-strings_en\.json|js\/JoistA11yStrings\.js|js\/PhetButton\.js)$/ },
    { repo: 'babel', file: /^joist\/joist-strings_ko\.json$/ }
  ],
  theme: [
    { repo: 'scenery-phet', file: /^js\/PhetFont\.(js|ts)$/ },
    { repo: 'joist', file: /^js\/(LookAndFeel|HomeScreen)\.(js|ts)$/ },
    { repo: 'sun', file: /^js\/(ColorConstants|Panel|Checkbox|CheckBox|SliderThumb|Slider|HSlider)\.(js|ts)$/ }
  ],
  terms: [
    { repo: 'babel', file: /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*-strings_ko\.json$/ }
  ]
} );

/** Build-config overlays recorded in `overlays` (docs/build.md), not patches; anything else is a violation. */
export const OVERLAY_ALLOWLIST = Object.freeze( [
  /^package\.json phet\.supportedBrands \+= adapted-from-phet \(throwaway checkout, reverted after build\)$/,
  /^chipper-skip-tsc: js\/grunt\/Gruntfile\.(js|cjs|ts) sim `tsc --build` type-check call removed /
] );

/**
 * @param {string} kind
 * @param {string} repo
 * @param {string} file
 * @param {typeof PATCH_ALLOWLIST} [allow]
 * @returns {boolean}
 */
export function isAllowed( kind, repo, file, allow = PATCH_ALLOWLIST ) {
  return ( allow[ kind ] || [] ).some( a => a.repo === repo && a.file.test( file ) );
}

/**
 * Parses one recorded patch line of a matrix row (engine.mjs describeResult):
 * `<rule id>: applied (<file>: replaced; <file>: edits 1/1; <file>: no change)`.
 * @param {string} line
 * @returns {{ id: string, status: string, written: string[] }}
 */
export function parsePatchLine( line ) {
  const m = /^([a-z0-9-]+): (applied|skipped)(?: \((.*)\))?$/s.exec( line );
  if ( !m ) { return { id: null, status: 'unparsed', written: [] }; }
  const written = [];
  for ( const note of ( m[ 3 ] || '' ).split( '; ' ) ) {
    const n = /^(.+?): (replaced|edits [0-9/]+)$/.exec( note );
    if ( n ) { written.push( n[ 1 ] ); }
  }
  return { id: m[ 1 ], status: m[ 2 ], written };
}

/**
 * V10b check over (1) every rule's declared candidate files and (2) what each build record says it
 * actually wrote, plus the build-config overlays and the post-build git status.
 * @param {{ rules: { id: string, kind: string, repo: string, files: string[] }[],
 *           records: { id: string, patches?: string[], overlays?: string[], trackedChangesAfterBuild?: string[], success?: boolean }[],
 *           allow?: typeof PATCH_ALLOWLIST, overlayAllow?: RegExp[] }} input
 * @returns {{ passed: number, total: number, failures: object[], rulesChecked: number, filesChecked: number }}
 */
export function checkPatchAllowlist( { rules, records, allow = PATCH_ALLOWLIST, overlayAllow = OVERLAY_ALLOWLIST } ) {
  const failures = [];
  const ruleById = new Map();
  let filesChecked = 0;
  for ( const r of rules ) {
    if ( ruleById.has( r.id ) && ruleById.get( r.id ).repo !== r.repo ) { failures.push( { id: r.id, what: 'rule', reason: 'same rule id with another repo' } ); }
    ruleById.set( r.id, r );
    if ( !Object.hasOwn( allow, r.kind ) ) { failures.push( { id: r.id, what: 'rule', reason: `kind ${r.kind} is not theme/brand/telemetry/terms` } ); continue; }
    for ( const f of r.files ) {
      filesChecked++;
      if ( !isAllowed( r.kind, r.repo, f, allow ) ) { failures.push( { id: r.id, what: 'rule', reason: `${r.kind} rule may touch ${r.repo}/${f}, not allow-listed` } ); }
    }
  }
  let passed = 0;
  for ( const rec of records ) {
    const before = failures.length;
    if ( rec.success === false ) { failures.push( { id: rec.id, what: 'record', reason: 'build failed (no patch record to check)' } ); }
    for ( const line of rec.patches || [] ) {
      const p = parsePatchLine( line );
      if ( !p.id ) { failures.push( { id: rec.id, what: 'record', reason: `unparsed patch line ${line.slice( 0, 80 )}` } ); continue; }
      const rule = ruleById.get( p.id );
      if ( !rule ) { failures.push( { id: rec.id, what: 'record', reason: `unknown patch rule ${p.id}` } ); continue; }
      for ( const f of p.written ) {
        filesChecked++;
        if ( !isAllowed( rule.kind, rule.repo, f, allow ) ) { failures.push( { id: rec.id, what: 'record', reason: `${p.id} wrote ${rule.repo}/${f}, not allow-listed` } ); }
      }
    }
    for ( const o of rec.overlays || [] ) {
      if ( !overlayAllow.some( re => re.test( o ) ) ) { failures.push( { id: rec.id, what: 'overlay', reason: `build-config overlay not allow-listed: ${o.slice( 0, 80 )}` } ); }
    }
    if ( ( rec.trackedChangesAfterBuild || [] ).length ) { failures.push( { id: rec.id, what: 'revert', reason: `checkout not clean after build: ${rec.trackedChangesAfterBuild.slice( 0, 3 ).join( ', ' )}` } ); }
    if ( failures.length === before ) { passed++; }
  }
  return { passed, total: records.length, failures, rulesChecked: rules.length, filesChecked };
}

// ---------------------------------------------------------------------------------------------------
// V10c: private-name scan (counts and file names only)
// ---------------------------------------------------------------------------------------------------

/**
 * Names from the private file: one per line, trimmed; lines shorter than 2 characters and `#` comments
 * are ignored (same rule as tests/site/site-browser.test.mjs).
 * @param {string} text
 * @returns {string[]}
 */
export function parseNames( text ) {
  return text.split( '\n' ).map( s => s.trim() ).filter( s => s.length >= 2 && !s.startsWith( '#' ) );
}

/**
 * The byte sequences one name can take inside a built file: UTF-8 in NFC and NFD, JavaScript `\uXXXX`
 * escapes (both hex cases) and HTML numeric entities (decimal and hex), since chipper and the site
 * emit non-ASCII text in each of these forms.
 * @param {string} name
 * @returns {Buffer[]}
 */
export function nameNeedles( name ) {
  const forms = new Set( [ name.normalize( 'NFC' ), name.normalize( 'NFD' ) ] );
  const out = new Set();
  for ( const f of forms ) {
    out.add( f );
    if ( /[^\x00-\x7f]/.test( f ) ) {
      const units = [ ...f ].flatMap( ch => {
        const cp = ch.codePointAt( 0 );
        return cp < 0x80 ? [ ch ] : [ ...ch ].map( u => u.charCodeAt( 0 ) );
      } );
      const esc = upper => units.map( u => ( typeof u === 'string' ? u : `\\u${u.toString( 16 ).padStart( 4, '0' )[ upper ? 'toUpperCase' : 'toLowerCase' ]()}` ) ).join( '' );
      out.add( esc( false ) );
      out.add( esc( true ) );
      out.add( [ ...f ].map( ch => ( ch.codePointAt( 0 ) < 0x80 ? ch : `&#${ch.codePointAt( 0 )};` ) ).join( '' ) );
      out.add( [ ...f ].map( ch => ( ch.codePointAt( 0 ) < 0x80 ? ch : `&#x${ch.codePointAt( 0 ).toString( 16 )};` ) ).join( '' ) );
    }
  }
  return [ ...out ].map( s => Buffer.from( s, 'utf8' ) );
}

/**
 * Counts name hits in one file's bytes. Returns only a number, never which name matched.
 * @param {Buffer} buf
 * @param {Buffer[][]} needlesPerName
 * @returns {number}
 */
export function countHits( buf, needlesPerName ) {
  let hits = 0;
  for ( const needles of needlesPerName ) {
    for ( const n of needles ) {
      let at = buf.indexOf( n );
      while ( at !== -1 ) { hits++; at = buf.indexOf( n, at + n.length ); }
    }
  }
  return hits;
}

/**
 * Scans files for the names. The result carries counts and file labels only; `namesDigest` lets two
 * runs be compared without showing the names.
 * @param {{ label: string, read: () => Buffer }[]} files
 * @param {string[]} names
 * @returns {{ scanned: number, names: number, namesDigest: string, hitFiles: { file: string, hits: number }[], totalHits: number }}
 */
export function scanForNames( files, names ) {
  const needles = names.map( nameNeedles );
  const hitFiles = [];
  let totalHits = 0;
  for ( const f of files ) {
    const n = countHits( f.read(), needles );
    if ( n ) { hitFiles.push( { file: f.label, hits: n } ); totalHits += n; }
  }
  return { scanned: files.length, names: names.length,
           namesDigest: createHash( 'sha256' ).update( names.join( '\n' ) ).digest( 'hex' ).slice( 0, 12 ),
           hitFiles, totalHits };
}

// ---------------------------------------------------------------------------------------------------
// npm test run → V4, V5, V6, V10a
// ---------------------------------------------------------------------------------------------------

/**
 * Which tests of the npm test run count for which V-item. A test belongs to a group when its file is
 * listed or its name matches. Group members must pass and must not be skipped.
 */
export const TEST_GROUPS = Object.freeze( {
  V4: { files: [ 'tests/drawer/core.test.mjs' ], names: [ /^V4\b/, /^real build: / ] },
  V5: { files: [ 'tests/drawer/hash.test.mjs', 'tests/drawer/status.test.mjs', 'tests/status/status-tools.test.mjs' ], names: [ /^V5\b/ ] },
  V6: { files: [ 'tests/site/site.test.mjs', 'tests/site/site-browser.test.mjs' ], names: [] },
  V10a: { files: [ 'tests/theme/no-literals.test.mjs', 'tests/drawer/literals.test.mjs', 'tests/theme/tokens.test.mjs' ], names: [] }
} );

/**
 * @param {{ event: string, name: string, file: string|null, skip: any, todo: any, error?: string|null }[]} events
 * @param {string} repoRoot - to make `file` repo-relative
 * @returns {Record<string, { passed: number, total: number, failures: object[] }>} V4, V5, V6, V10a and TEST
 */
export function groupTestEvents( events, repoRoot ) {
  const rel = f => ( f ? f.replace( repoRoot.replace( /\/$/, '' ) + '/', '' ) : '' );
  const out = {};
  const tally = ( key, e, strictSkip ) => {
    const g = out[ key ] || ( out[ key ] = { passed: 0, total: 0, failures: [], skipped: 0 } );
    g.total++;
    if ( e.event === 'fail' ) { g.failures.push( { id: `${rel( e.file )}`, error: `${e.name}: ${e.error || 'failed'}` } ); return; }
    if ( e.skip || e.todo ) {
      g.skipped++;
      if ( strictSkip ) { g.failures.push( { id: `${rel( e.file )}`, error: `${e.name}: 건너뜀 (${typeof e.skip === 'string' ? e.skip : 'skip'})` } ); return; }
    }
    g.passed++;
  };
  for ( const e of events ) {
    tally( 'TEST', e, false );
    for ( const [ key, g ] of Object.entries( TEST_GROUPS ) ) {
      if ( g.files.includes( rel( e.file ) ) || g.names.some( re => re.test( e.name ) ) ) { tally( key, e, true ); }
    }
  }
  for ( const key of [ ...Object.keys( TEST_GROUPS ), 'TEST' ] ) { out[ key ] = out[ key ] || { passed: 0, total: 0, failures: [], skipped: 0 }; }
  return out;
}

/**
 * Runs async jobs with at most `size` in flight; results keep input order.
 * @template T, R
 * @param {T[]} items
 * @param {number} size
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function pool( items, size, fn ) {
  const out = new Array( items.length );
  let next = 0;
  const worker = async () => {
    while ( next < items.length ) {
      const i = next++;
      out[ i ] = await fn( items[ i ], i );
    }
  };
  await Promise.all( Array.from( { length: Math.max( 1, Math.min( size, items.length ) ) }, worker ) );
  return out;
}
