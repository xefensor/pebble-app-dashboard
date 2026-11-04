'use strict';

// All snapshots and command replies share one FIFO. Only unsent display frames
// are replaceable; acknowledgements/results are never coalesced or retried.
module.exports = function createQueue(send, options) {
  options = options || {};
  var pending = [], active = null, epoch = 0, limit = options.limit || 12;
  function flush() {
    if (active || !pending.length) return;
    var item = pending.shift(), generation = epoch, settled = false;
    active = item;
    function done(ok) {
      if (settled) return;
      settled = true;
      active = null;
      var callback = generation === epoch ? ok ? item.success : item.failure : null;
      if (callback) callback();
      flush();
    }
    try { send(item.message, function () { done(true); }, function () { done(false); }); }
    catch (error) { done(false); }
  }
  return {
    send: function (message, success, failure, replaceKey) {
      if (replaceKey) {
        pending = pending.filter(function (item) {
          if (item.replaceKey !== replaceKey) return true;
          if (item.failure) item.failure('SUPERSEDED');
          return false;
        });
      }
      if (pending.length >= limit) { if (failure) failure('QUEUE_FULL'); return false; }
      pending.push({message: message, success: success, failure: failure, replaceKey: replaceKey});
      flush(); return true;
    },
    // AppMessage still owns an in-flight send. Wait for that one callback before
    // sending the new session, while suppressing all obsolete continuations.
    clear: function () { epoch++; pending = []; },
    length: function () { return pending.length + (active ? 1 : 0); }
  };
};
