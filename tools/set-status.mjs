#!/usr/bin/env node
// Change a status without approving: node tools/set-status.mjs <id> <확인 중|수정 중> [memo]
import { setStatus } from './lib/status-file.mjs';

const [ id, state, ...memo ] = process.argv.slice( 2 );
if ( !id || !state ) { console.error( 'usage: node tools/set-status.mjs <sim id> <확인 중|수정 중> [memo]' ); process.exit( 2 ); }
try {
  const e = setStatus( id, state, { memo: memo.join( ' ' ) } );
  console.log( `${id}: ${e.status} (${e.date})` );
}
catch ( err ) { console.error( String( err.message || err ) ); process.exit( 1 ); }
