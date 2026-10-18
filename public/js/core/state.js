/**
 * Store — one plain object, one change callback.
 *
 * Deliberately not reactive in the fine-grained sense: the whole app is a few
 * dozen controls, so `subscribe` + explicit render calls is both faster to
 * reason about and smaller than a signal graph.
 */

export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  let notifying = false;

  const api = {
    get: () => state,

    /** Shallow merge. Pass `{silent:true}` to skip the notify round. */
    set(patch, { silent = false } = {}) {
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        if (!Object.is(state[k], v)) {
          changed = true;
          break;
        }
      }
      if (!changed) return state;

      state = { ...state, ...patch };
      if (!silent && !notifying) {
        notifying = true;
        try {
          for (const fn of listeners) fn(state);
        } finally {
          notifying = false;
        }
      }
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  return api;
}

/** A Set-valued field helper, so callers cannot mutate state in place. */
export const setOps = (store, key) => ({
  has: (v) => store.get()[key].has(v),
  size: () => store.get()[key].size,
  values: () => [...store.get()[key]],
  toggle(v) {
    const next = new Set(store.get()[key]);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    store.set({ [key]: next });
    return next.has(v);
  },
  add(v) {
    if (store.get()[key].has(v)) return;
    const next = new Set(store.get()[key]);
    next.add(v);
    store.set({ [key]: next });
  },
  remove(v) {
    if (!store.get()[key].has(v)) return;
    const next = new Set(store.get()[key]);
    next.delete(v);
    store.set({ [key]: next });
  },
  clear() {
    if (!store.get()[key].size) return;
    store.set({ [key]: new Set() });
  },
});
