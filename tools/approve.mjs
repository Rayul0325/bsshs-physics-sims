#!/usr/bin/env node
// Record a teacher approval: node tools/approve.mjs <id> [memo]
// Stores 확인 완료 with the sim's current physics hash; any later physics change shows 확인 중 again.
import { approve } from './lib/status-file.mjs';

const [ id, ...memo ] = process.argv.slice( 2 );
if ( !id ) { console.error( 'usage: node tools/approve.mjs <sim id> [memo]' ); process.exit( 2 ); }
try {
  const e = approve( id, { memo: memo.join( ' ' ) } );
  console.log( `${id}: ${e.status} (${e.date}) hash ${e.approvedHash.slice( 0, 12 )}…` );
}
catch ( err ) { console.error( String( err.message || err ) ); process.exit( 1 ); }
