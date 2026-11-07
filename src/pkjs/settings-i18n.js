'use strict';
// The factory is embedded in both pages; its explicit catalogue keeps them offline.
function languageFactory(language, catalogue) {
  catalogue=catalogue||languageFactory.catalogue;
  var code=String(language||'en').toLowerCase().split(/[_.@-]/)[0];
  if(code==='nb'||code==='nn')code='no';
  if(catalogue.languages.indexOf(code)<0)code='en';
  var words=catalogue.words[code];
  function text(value) { return Object.prototype.hasOwnProperty.call(words,value)?words[value]:value; }
  function staticPage(root) {
    document.documentElement.lang=code;document.title=text(document.title);
    var walker=document.createTreeWalker(root,4),item;
    while((item=walker.nextNode())) {
      if(/^(SCRIPT|STYLE|TEXTAREA)$/.test(item.parentNode.tagName))continue;
      var raw=item.nodeValue,trimmed=raw.trim();
      if(Object.prototype.hasOwnProperty.call(words,trimmed))item.nodeValue=raw.slice(0,raw.indexOf(trimmed))+words[trimmed]+raw.slice(raw.indexOf(trimmed)+trimmed.length);
    }
  }
  return {language:code,text:text,staticPage:staticPage};
}
languageFactory.catalogue=require('../common/translations.json');
module.exports=languageFactory;
