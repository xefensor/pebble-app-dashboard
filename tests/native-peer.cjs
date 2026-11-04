'use strict';
// Test-only encoder peer. No Pebble plugin API, phone or real actions.
const readline=require('node:readline'),protocol=require('../src/pkjs/protocol');
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{try{const value=JSON.parse(line);process.stdout.write(JSON.stringify({bytes:protocol.encode(value)})+'\n');}
catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');}});
