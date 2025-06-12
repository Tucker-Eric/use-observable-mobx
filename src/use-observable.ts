import { Reaction, _getGlobalState, getDebugName, isObservable } from "mobx";
import { _observerFinalizationRegistry } from "mobx-react-lite";
import {
  isValidElement,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

const ORIGINAL_SYMBOL = Symbol.for("ReactiveProxy.Original");

/**
 * Unwraps the `useObservable` proxy to get the original mobx object.
 * This is useful when you need to access the original object without the reactive proxy.
 * For placing an object in context or passing it to a function that expects the original object.
 */
export const getOriginal = <T>(obj: T): T =>
  isReactiveProxy(obj) ? obj[ORIGINAL_SYMBOL] : obj;

export const isReactiveProxy = <T>(
  obj: T,
): obj is T & { [ORIGINAL_SYMBOL]: T } =>
  typeof obj === "object" && obj !== null && ORIGINAL_SYMBOL in obj;

class ReactionExtended extends Reaction {
  /**
   * mobx's `track` will reset all dependencies and replace them with the new ones accessed
   * in `track()`. This is not what we want, since we want to keep the old dependencies
   * and add the new ones to the list of dependencies to capture all changes in a render.
   * This is a workaround to avoid removing them from being tracked.
   */
  appendTracked(fn: () => void): void {
    if (_getGlobalState().trackingContext === this) {
      fn();
      return;
    }
    // `.track()` will reset all dependencies and replace them with the new ones accessed
    // in `track()`
    const prevObserving = this.observing_;

    // Change these to `1` to avoid removing them from being tracked
    // https://github.com/mobxjs/mobx/blob/09703d6a3dc7a6214bf2e97cf7e53c690f53d56a/packages/mobx/src/core/derivation.ts#L259-L266
    this.observing_.forEach((dep) => {
      dep.diffValue = 1;
    });

    this.track(fn);

    // Append the previous observing to the current observing
    this.observing_ =
      // this will be `0` when there aren't any observables in the `appendTracked` call
      // which can happen when we're accessing a function before calling it
      this.observing_.length > 0
        ? this.observing_.concat(prevObserving)
        : prevObserving;
  }
}

// Taken and modified from:
// https://github.com/mobxjs/mobx/blob/09703d6a3dc7a6214bf2e97cf7e53c690f53d56a/packages/mobx-react-lite/src/useObserver.ts
// Do not store `admRef` (even as part of a closure!) on this object,
// otherwise it will prevent GC and therefore reaction disposal via FinalizationRegistry.
interface ObserverAdministration {
  reaction: ReactionExtended | null; // also serves as disposed flag
  onStoreChange: (() => void) | null; // also serves as mounted flag
  // stateVersion that 'ticks' for every time the reaction fires
  // tearing is still present,
  // because there is no cross component synchronization,
  // but we can use `useSyncExternalStore` API.
  stateVersion: symbol;
  name: string;
  /**
   * If we're in a render, we append the tracked observables to the reaction
   * to avoid removing them from being tracked.
   */
  inRender: boolean;
  cache: WeakMap<object, object>;
  // These don't depend on state/props, therefore we can keep them here instead of `useCallback`
  subscribe: Parameters<typeof useSyncExternalStore>[0];
  getSnapshot: Parameters<typeof useSyncExternalStore>[1];
  /**
   * Deep reactive proxy for MobX observable tracking during access of observables.
   */
  makeReactiveProxy: <T>(obj: T) => T;
}

// Hook implementation using useSyncExternalStore
export const useObservable = <T extends object>(store: T): T => {
  const admRef = useRef<ObserverAdministration | null>(null);

  // Set `inRender` to false to notify the reaction we can clear tracked observables
  // at the beginning of the next render to re-track new dependencies.
  useLayoutEffect(() => {
    if (admRef.current) {
      admRef.current.inRender = false;
    }
  });

  // First render
  admRef.current ??= createObserverAdministration(store);

  const adm = admRef.current;
  adm.inRender = true;

  if (!adm.reaction) {
    // First render or reaction was disposed by registry before subscribe
    adm.reaction = createReaction(adm);
    // StrictMode/ConcurrentMode/Suspense may mean that our component is
    // rendered and abandoned multiple times, so we need to track leaked
    // Reactions.
    _observerFinalizationRegistry.register(admRef, adm, adm);
  } else {
    // Reset disposed flag to clear all tracked observables
    // and re-track them in the next render.
    adm.reaction.dispose();
    adm.reaction.isDisposed = false;
  }

  useSyncExternalStore(adm.subscribe, adm.getSnapshot, adm.getSnapshot);

  return adm.makeReactiveProxy(store);
};

/**
 * Unwraps the `useObservable` proxy to get the original mobx object.
 * This is useful when you need to access the original object without the reactive proxy.
 * For placing an object in react context or passing it to a function that expects the original object.
 */
useObservable.unwrap = getOriginal;

const createReaction = (adm: ObserverAdministration) =>
  new ReactionExtended(`useObservable(${adm.name})`, () => {
    adm.stateVersion = Symbol();
    // onStoreChange won't be available until the component "mounts".
    // If state changes in between initial render and mount,
    // `useSyncExternalStore` should handle that by checking the state version and issuing update.
    adm.onStoreChange?.();
  });

const createObserverAdministration = (name: object): ObserverAdministration => {
  const adm: ObserverAdministration = {
    reaction: null,
    cache: new WeakMap<object, object>(),
    onStoreChange: null,
    stateVersion: Symbol(),
    inRender: false,
    name: getDebugName(name),
    subscribe(onStoreChange: () => void) {
      // Do NOT access admRef here!
      _observerFinalizationRegistry.unregister(adm);
      adm.onStoreChange = onStoreChange;
      if (!adm.reaction) {
        // We've lost our reaction and therefore all subscriptions, occurs when:
        // 1. Timer based finalization registry disposed reaction before component mounted.
        // 2. React "re-mounts" same component without calling render in between (typically <StrictMode>).
        // We have to recreate reaction and schedule re-render to recreate subscriptions,
        // even if state did not change.
        adm.reaction = createReaction(adm);
        // `onStoreChange` won't force update if subsequent `getSnapshot` returns same value.
        // So we make sure that is not the case
        adm.stateVersion = Symbol();
      }

      return () => {
        // Do NOT access admRef here!
        adm.onStoreChange = null;
        adm.reaction?.dispose();
        adm.reaction = null;
      };
    },
    getSnapshot() {
      // Do NOT access admRef here!
      return adm.stateVersion;
    },
    makeReactiveProxy: <T>(obj: T): T => {
      if (
        // If we are not in a render, we need to return the original value
        // because we're most likely in an event handler and mobx is looking for the original value to set
        !adm.inRender ||
        typeof obj !== "object" ||
        obj === null ||
        isValidElement(obj)
      ) {
        return obj;
      }

      // Not destructuring `adm` here to be able to have `reaction` and `cache`
      // always available by reference instead initializing the tracking proxy
      // with the first reaction (since this could change when component unmounts/remounts).
      if (adm.cache.has(obj)) {
        const value = adm.cache.get(obj);
        // If we're tracking this and not in a render, we need to return the original value
        // because we're most likely in an event handler and mobx is looking for the original value
        return value as T;
      }

      const trackAccess = <T>(cb: () => T): T => {
        let value: T | null = null;

        const getValue = () => {
          value = cb();
        };

        // If we're in a render, we append the tracked observables to the reaction
        if (adm.inRender) {
          // if not, this would be the first so `track` would be called
          // which would remove all previous observables from being tracked and start a new reaction.
          if (adm.reaction?.observing_.length) {
            adm.reaction.appendTracked(getValue);
          } else {
            adm.reaction?.track(getValue);
          }
        } else {
          // If we're not in a render, we just call the callback
          // This is typically used in event handlers where we don't want to track observables
          getValue();
        }

        return value as T;
      };

      // Unwrap here to avoid nested proxies.
      // Useful for when a tracked object is passed to context and wrapped in
      // `useObservable` again.
      const proxy = new Proxy(getOriginal(obj), {
        get(target, prop) {
          // Allow unwrapping the proxy to get the original object
          if (prop === ORIGINAL_SYMBOL) {
            return target;
          }

          if (!isObservable(target)) {
            const val = Reflect.get(target, prop);

            // If this is a function we need to bind it to the parent object
            if (typeof val === "function") {
              return val.bind(target);
            }

            const { writable, configurable } =
              Reflect.getOwnPropertyDescriptor(target, prop) ?? {};
            // If the property is not writable or configurable, we return the value
            // and can't track anymore in this nested path because the getter needs to return the actual value
            // and not a proxy.
            return !writable && !configurable
              ? val
              : adm.makeReactiveProxy(val);
          }

          const value = trackAccess(() => Reflect.get(target, prop));

          // If we're accessing a function we need to track everything in that function
          if (typeof value === "function") {
            // Bind the function to the parent obj
            const func: (...args: unknown[]) => unknown = value.bind(target);
            // Create a wrapper around the method to track all values
            // accessed in the method and return a tracked proxy if needed.
            return (...args: unknown[]) =>
              adm.makeReactiveProxy(
                trackAccess(() =>
                  // If we aren't in a render, unwrap all the args to pass the original values
                  func(...(adm.inRender ? args : args.map(getOriginal))),
                ),
              );
          }

          return adm.makeReactiveProxy(value);
        },
        has(target, prop) {
          // Allow unwrapping the proxy to get the original object
          return prop === ORIGINAL_SYMBOL
            ? true
            : trackAccess(() => Reflect.has(target, prop));
        },
      });

      adm.cache.set(obj, proxy);

      return proxy;
    },
  };

  return adm;
};
