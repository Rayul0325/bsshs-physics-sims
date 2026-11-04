// node --test reporter used by tools/verify.mjs: one JSON line per finished top-level test
// ({ "event": "pass"|"fail", "name", "file", "skip", "todo", "ms", "error" }) so the verifier can
// count results per test file and per V-item. Nested subtests are not reported separately.
// Usage: node --test --test-reporter=./tools/lib/test-events-reporter.mjs "tests/**/*.test.mjs"

/**
 * @param {AsyncIterable<{ type: string, data: any }>} source
 * @returns {AsyncGenerator<string>}
 */
export default async function* testEventsReporter( source ) {
  for await ( const { type, data } of source ) {
    if ( ( type !== 'test:pass' && type !== 'test:fail' ) || data.nesting !== 0 ) { continue; }
    // A file-level failure (e.g. a syntax error) arrives as a test named after the file itself.
    if ( data.details && data.details.type === 'suite' ) { continue; }
    const err = data.details && data.details.error;
    yield JSON.stringify( {
      event: type === 'test:pass' ? 'pass' : 'fail',
      name: data.name,
      file: data.file || null,
      skip: data.skip === undefined ? false : ( data.skip || true ),
      todo: data.todo === undefined ? false : ( data.todo || true ),
      ms: data.details ? Math.round( data.details.duration_ms ) : null,
      error: err ? String( ( err.cause && err.cause.message ) || err.message || err ).split( '\n' ).slice( 0, 4 ).join( ' | ' ).slice( 0, 400 ) : null
    } ) + '\n';
  }
}
