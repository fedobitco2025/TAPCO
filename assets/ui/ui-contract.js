// TAPCO Internal UI Contract
// Phase 1 contract layer to decouple UI modules from game implementation details.

(function initTapcoUIContract() {
  if (typeof window === 'undefined') return;

  var actions = Object.create(null);
  var listeners = Object.create(null);
  var stateGetter = null;

  function safeCall(fn, arg) {
    try {
      return fn(arg);
    } catch (error) {
      console.error('[TAPCOContract] handler failure:', error);
      return undefined;
    }
  }

  var contract = {
    version: '1.0.0',

    registerAction: function registerAction(name, handler) {
      if (!name || typeof handler !== 'function') return false;
      actions[name] = handler;
      return true;
    },

    unregisterAction: function unregisterAction(name) {
      if (!name || !actions[name]) return false;
      delete actions[name];
      return true;
    },

    callAction: function callAction(name, payload) {
      var fn = actions[name];
      if (typeof fn !== 'function') {
        console.warn('[TAPCOContract] unknown action:', name);
        return false;
      }
      safeCall(fn, payload);
      return true;
    },

    hasAction: function hasAction(name) {
      return typeof actions[name] === 'function';
    },

    listActions: function listActions() {
      return Object.keys(actions);
    },

    registerStateGetter: function registerStateGetter(getter) {
      if (typeof getter !== 'function') return false;
      stateGetter = getter;
      return true;
    },

    getState: function getState() {
      if (typeof stateGetter !== 'function') return {};
      var state = safeCall(stateGetter);
      return state && typeof state === 'object' ? state : {};
    },

    on: function on(eventName, handler) {
      if (!eventName || typeof handler !== 'function') return function noop() {};
      listeners[eventName] = listeners[eventName] || [];
      listeners[eventName].push(handler);
      return function unsubscribe() {
        var arr = listeners[eventName] || [];
        var idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
      };
    },

    emit: function emit(eventName, payload) {
      var arr = listeners[eventName] || [];
      arr.slice().forEach(function each(handler) {
        safeCall(handler, payload);
      });
    }
  };

  window.TAPCOContract = contract;
})();
