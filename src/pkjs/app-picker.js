'use strict';

// This factory is also embedded verbatim in the bundled and legacy settings pages.
function createAppPickerModel() {
  var SEARCH_HOST = 'https://gm3s9tryo4-dsn.algolia.net';
  var SEARCH_APP = 'GM3S9TRYO4';
  // Public client-search credential shipped by the official Pebble phone app.
  var SEARCH_KEY = '0b83b4f8e4e8e9793d2f1f93c21894aa';
  var UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function uuid(value) {
    return typeof value === 'string' && UUID.test(value) &&
      value !== '00000000-0000-0000-0000-000000000000' ? value.toLowerCase() : '';
  }
  function text(value, maxBytes, maxCharacters) {
    if (typeof value !== 'string') return '';
    value = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    var out = '', used = 0, characters = 0;
    for (var i = 0; i < value.length; i++) {
      var first = value.charCodeAt(i), part = value.charAt(i), size;
      if (first >= 0xd800 && first <= 0xdbff) {
        var second = value.charCodeAt(i + 1);
        if (!(second >= 0xdc00 && second <= 0xdfff)) continue;
        part += value.charAt(++i); size = 4;
      } else if (first >= 0xdc00 && first <= 0xdfff) continue;
      else size = first < 0x80 ? 1 : first < 0x800 ? 2 : 3;
      if (used + size > maxBytes || characters >= maxCharacters) break;
      out += part; used += size; characters++;
    }
    return out.trim();
  }
  function label(value) { return text(value, 32, 32); }
  function common() {
    return [
      {uuid:'61b22bc8-1e29-460d-a236-3fe409a439ff', name:'Weather', author:'Pebble', icon:'weather', origin:'system'},
      {uuid:'1f03293d-47af-4f28-b960-f2b02a6dd757', name:'Music', author:'Pebble', icon:'media', origin:'system'},
      {uuid:'b2cae818-10f8-46df-ad2b-98ad2254a3c1', name:'Notifications', author:'Pebble', icon:'notification', origin:'system'},
      {uuid:'67a32d95-ef69-46d4-a0b9-854cc62f97f9', name:'Alarms', author:'Pebble', icon:'timer', origin:'system'},
      {uuid:'fef82c82-7176-4e22-88de-35a3fc18d43f', name:'Workout', author:'Pebble', icon:'workout', origin:'system'},
      {uuid:'36d8c6ed-4c83-4fa1-a9e2-8f12dc941f8c', name:'Health', author:'Pebble', icon:'workout', origin:'system'},
      {uuid:'426ccd53-b380-4d83-8d06-9893de3477ce', name:'Timeline', author:'Pebble', icon:'calendar', origin:'system'},
      {uuid:'07e0d9cb-8957-4bf7-9d42-35bf47caadfe', name:'Settings', author:'Pebble', icon:'generic', origin:'system'},
      {uuid:'18e443ce-38fd-47c8-84d5-6d0c775fbe55', name:'Watchfaces', author:'Pebble', icon:'generic', origin:'system'},
      {uuid:'50e9ef12-a5ab-4369-a3b5-3447bfba5151', name:'Timer', author:'Xef', icon:'timer', origin:'common'}
    ];
  }
  function searchUrl(query) {
    query = text(query, 320, 80);
    if (!query) throw new Error('Enter an app name to search the store.');
    return SEARCH_HOST + '/1/indexes/apps?query=' + encodeURIComponent(query) +
      '&hitsPerPage=15&page=0&tagFilters=' + encodeURIComponent('[["watchapp","companion-app"]]') +
      '&attributesToRetrieve=' + encodeURIComponent('["id","uuid","title","author","type","compatibility"]') +
      '&attributesToHighlight=' + encodeURIComponent('[]') + '&attributesToSnippet=' + encodeURIComponent('[]') +
      '&x-algolia-application-id=' + SEARCH_APP + '&x-algolia-api-key=' + SEARCH_KEY;
  }
  function parseResults(body) {
    if (!object(body) || !Array.isArray(body.hits)) return [];
    var out = [], seen = Object.create(null);
    // Requests return at most 15 hits; also bound work for malformed input.
    var hits = body.hits.slice(0, 100);
    for (var i = 0; i < hits.length && out.length < 15; i++) {
      var hit = hits[i];
      if (!object(hit) || (hit.type !== 'watchapp' && hit.type !== 'companion-app')) continue;
      var id = uuid(hit.uuid), name = text(hit.title, 128, 128);
      if (!id || !name || seen[id] || !object(hit.compatibility) ||
          !object(hit.compatibility.emery) || hit.compatibility.emery.supported !== true) continue;
      // has_binary:false can mean a compatible scaled Basalt binary, not a plugin.
      seen[id] = true;
      out.push({uuid:id, name:name, author:text(hit.author, 96, 96), origin:'store', icon:'generic'});
    }
    return out;
  }
  return {common:common, label:label, searchUrl:searchUrl, parseResults:parseResults};
}

module.exports = createAppPickerModel();
module.exports.browserFactory = createAppPickerModel;
