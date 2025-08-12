# use-observable-mobx

A tiny, deeply reactive React hook for MobX that tracks exactly which properties your component reads and only re-renders when those properties change. A drop-in alternative to wrapping components with `observer`.

- No HOCs or decorators
- Works with nested objects/arrays
- Minimal boilerplate and great ergonomics

## Table of Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Why this approach?](#why-this-approach)
- [API Reference](#api-reference)
- [Advanced usage](#advanced-usage)
  - [Putting objects in React context](#putting-objects-in-react-context-unwrap-first)
  - [Checking if a value is a reactive proxy](#checking-if-a-value-is-a-reactive-proxy)
  - [Interop with `observer`/`useObserver`](#interop-with-observeruseobserver)
  - [Avoid subscribing unintentionally](#avoid-subscribing-unintentionally)
- [How it works](#how-it-works-high-level)
- [FAQ](#faq)
- [License](#license)


## Installation

```bash
npm install use-observable-mobx
# or
yarn add use-observable-mobx
# or
pnpm add use-observable-mobx
```

Requirements:
- React 18+ (uses `useSyncExternalStore`)
- MobX 6+


---

## Quick start

1) Create a MobX store (standard MobX patterns work)

```tsx
import { makeAutoObservable } from "mobx";

class Store {
  counter = 0;
  items = [{ id: 1, text: "Item 1" }];

  constructor() {
    makeAutoObservable(this);
  }

  increment() {
    this.counter++;
  }

  addItem(text: string) {
    this.items.push({ id: this.items.length + 1, text });
  }
}

export const store = new Store();
```

2) Use `useObservable` in your components and just read what you need

```tsx
import { useState } from "react";
import { useObservable } from "use-observable-mobx";
import { store } from "./store";

export const Counter = () => {
  const { counter, increment } = useObservable(store); // reads only these two

  return (
    <div>
      <p>Count: {counter}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
};

export const ItemList = () => {
  const { items, addItem } = useObservable(store);
  const [text, setText] = useState("");

  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>

      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button
        onClick={() => {
          addItem(text);
          setText("");
        }}
      >
        Add Item
      </button>
    </div>
  );
};
```

That’s it. The component re-renders only when the properties it read during render change.

Tip: You can compose a convenience hook if you prefer.

```tsx
// Avoid re-importing the store everywhere
export const useStore = () => useObservable(store);
```

---

## Why this approach?

- Deeply reactive: If you read `todos[0].title`, only changes to that path trigger a re-render.
- Zero ceremony: No HOC, no decorators, no special observers. Just a hook.
- Scales well: Components naturally subscribe to what they actually use.

---

## API Reference

- `useObservable<T extends object>(store: T): T`
  - Returns a reactive proxy to your MobX store.
  - During render, it tracks which properties you access and subscribes only to those.
  - Only those accessed properties will cause re-renders when they change.

- `useObservable.unwrap<T>(value: T): T`
  - Unwraps a reactive proxy produced by `useObservable` back to the original MobX object.
  - Safe to call with non-proxies (returns the value unchanged).
  - Alias of `getOriginal`.

- `getOriginal<T>(value: T): T`
  - Same as `useObservable.unwrap`. Provided as a named export for convenience.

- `isReactiveProxy<T>(value: T): boolean`
  - Returns `true` if `value` is a reactive proxy created by `useObservable`.

Notes:
- Tracking happens only during render. Reading properties inside event handlers or effects will not subscribe to changes of those properties.
- You should not store the reactive proxy in MobX state or React context. Use `unwrap` (or `getOriginal`) when passing values to places that should keep the original reference identity.

---

## Advanced usage

### Putting objects in React context (unwrap first)

When passing MobX objects through React Context, keep the original object identity stable by unwrapping before providing. Then wrap again where you consume.

```tsx
import { createContext, useContext, PropsWithChildren } from "react";
import { useObservable } from "use-observable-mobx";

type Item = { id: number; text: string };

const ItemContext = createContext<Item | null>(null);

export const ItemProvider = ({
  item,
  children,
}: PropsWithChildren<{ item: Item }>) => (
  <ItemContext.Provider value={useObservable.unwrap(item)}>
    {children}
  </ItemContext.Provider>
);

export const useItem = () => {
  const item = useContext(ItemContext);
  if (!item) throw new Error("useItem must be used within <ItemProvider>");
  return useObservable(item);
};

const ItemView = () => {
  const item = useItem(); // reactive proxy
  return <li>{item.text}</li>;
};
```

### Checking if a value is a reactive proxy

```tsx
import { useObservable, isReactiveProxy } from "use-observable-mobx";

const Example = ({ myStore }: { myStore: object }) => {
  const store = useObservable(myStore);
  console.log(isReactiveProxy(store)); // true
  console.log(isReactiveProxy({}));    // false
  return null;
};
```

### Interop with `observer`/`useObserver`

You generally don’t need `observer` around components that use `useObservable`. If you already have a codebase with `observer`, you can:
- Gradually migrate to `useObservable`, or
- Use both, although it’s redundant. Prefer one approach per component.

### Avoid subscribing unintentionally

Because tracking only happens during render:
- It’s safe to read any values inside event handlers without subscribing.
- To subscribe to derived/computed values, read them during render (e.g., `{store.fullName}`).

---

## How it works (high level)

1) On render, the proxy tracks every property you read (deep paths included).
2) It subscribes to the relevant MobX observables for those paths.
3) When any of those observed properties change, `useSyncExternalStore` triggers a re-render.

This mirrors the mental model: “re-render me when the things I actually used change.”

---

## FAQ

- Do I still need to wrap components with `observer`?
  - No. `useObservable` handles the reactivity for you. Use it directly inside components.

- Will reading inside callbacks subscribe my component?
  - No. Only property reads during render are tracked.

- Can I put the reactive proxy into context or store it in MobX state?
  - Prefer passing/storing the original object. Use `useObservable.unwrap` (or `getOriginal`) when putting values into context or other long-lived containers.

- Is it TypeScript friendly?
  - Yes. The return type matches your input type; getters and methods are fully typed.

- How do I minimize re-renders?
  - Only read what you need during render. If you read fewer properties, you’ll subscribe to fewer things.

---

## Inspiration

- Discussion on deprecating `useObserver` in MobX
- Valtio’s pattern of tracking accessed properties

This library borrows ideas from both, adapting them for a simple, hook-only MobX experience.

---

## Acknowledgments

- [Valtio](https://github.com/pmndrs/valtio): for the deeply reactive, access-tracking approach which this library borrows from.
- [MobX](https://mobx.js.org/react-integration.html): for the [`useObserver`](https://github.com/mobxjs/mobx/blob/8b54ab1a6ef23dd76f066a586f735943f95127aa/packages/mobx-react-lite/src/useObserver.ts) which this hook borrows from extensively.

---

## Sponsor

Thanks to Gavel for sponsoring the initial development.

[![Gavel](https://assets.gavel.dev/brand/gavel.svg)](https://www.gavel.io/)

---

## License

MIT
