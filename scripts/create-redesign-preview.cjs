'use strict';
// Actual settings template plus an isolated read-only fixture. No Pebble host,
// real storage, source discovery or network request is available in this file.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const settings=require('../src/pkjs/settings').defaults();
const fixture=`<script>
window.XMLHttpRequest=function(){throw Error('Layout preview has no network');};
window.fetch=function(){return Promise.reject(Error('Layout preview has no network'));};
window.Pebble={targets:function(){return Promise.resolve([{id:'plugin'}]);},addEventListener:function(type,fn){if(type==='ready')window.addEventListener('DOMContentLoaded',function(){fn({target:'plugin'});});},sendMessage:function(target,message){if(message.type==='load_settings')return Promise.resolve({ok:true,settings:${JSON.stringify(settings)}});if(message.type==='catalogue')return Promise.resolve({ok:true,cached:true,catalogue:{plugins:[],instances:[],activities:[]},message:'Layout preview: fictional defaults; no plugin discovery.'});return Promise.reject(Error('Layout preview cannot save or inspect live data'));}};
document.addEventListener('click',function(event){if(event.target.closest('#save')){event.preventDefault();event.stopImmediatePropagation();document.getElementById('status').textContent='Layout preview — saving is disabled.';}},true);
</script>`;
const output=path.join(process.env.PEBBLE_QA_OUTPUT_ROOT||path.join(root,'build/qa'),'phone-preview.html');
fs.mkdirSync(path.dirname(output),{recursive:true});
const html=require('../src/pkjs/settings-page').config().replace('<body>','<body>'+fixture).replace('<main>','<main><p class="hint" role="note">Layout preview · fictional defaults · saving and network disabled.</p>');
fs.writeFileSync(output,html);console.log(output);
