# use-observable-mobx

A deeply reactive hook for MobX that efficiently tracks property access in React
components as an alternative to the
[`observer` HOC](https://mobx.js.org/react-integration.html).

## Installation

```bash
npm install use-observable-mobx
# or
yarn add use-observable-mobx
# or
pnpm add use-observable-mobx
```

## Features

- **Deeply Reactive**: Automatically tracks and reacts to all accessed
  properties, including nested objects and arrays
- **Efficient Rendering**: Components rerender only when accessed properties
  change

## Usage

```tsx
import { makeAutoObservable } from "mobx";
import { useState } from "react";
import { useObservable } from "use-observable-mobx";

interface Item {
  id: number;
  text: string;
}

class Store {
  counter = 0;
  items: Item[] = [{ id: 1, text: "Item 1" }];

  constructor() {
    makeAutoObservable(this);
  }

  increment() {
    this.counter++;
  }

  addItem(text: string) {
    this.items.push({
      id: this.items.length + 1,
      text,
    });
  }
}

const store = new Store();

const Counter = () => {
  const { counter, increment } = useObservable(store);

  return (
    <div>
      <p>Count: {counter}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
};

// Or compose hooks without needing to import the store again
const useStore = () => useObservable(store);

const ItemList = () => {
  const { items, addItem } = useStore();
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

## Advanced Usage

### Unwrapping Proxies

Sometimes you need to access the original MobX object without the reactive
proxy, such as when placing an object in React context or passing it to a
function that expects the original object.

```tsx
import { type PropsWithChildren, createContext } from "react";
import { useObservable } from "use-observable-mobx";

const ItemContext = createContext<Item | null>(null);

const useItemContext = () => {
  const item = useContext(ItemContext);

  if (!item) {
    throw new Error("useItemContext must be used within an ItemProvider");
  }

  return useObservable(item);
};

const ItemProvider = ({
  children,
  item,
}: PropsWithChildren<{ item: Item }>) => (
  // Unwrap when passing to context to keep the mobx object reference the same
  <StoreContext.Provider value={useObservable.unwrap(item)}>
    {children}
  </StoreContext.Provider>
);

const Item = () => {
  const item = useItemContext();

  return <li>{item.text}</li>;
};

const ItemList = () => {
  const { items, addItem } = useCounter();
  const [text, setText] = useState("");

  return (
    <div>
      <ul>
        {items.map((item) => (
          <ItemProvider key={item.id} item={item} />
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

### Checking for Reactive Proxies

```tsx
import { isReactiveProxy } from "use-observable-mobx";

const MyComponent = () => {
  const store = useObservable(myStore);

  console.log(isReactiveProxy(store)); // true
  console.log(isReactiveProxy({})); // false
};
```

## How It Works

The `useObservable` hook creates a deeply reactive proxy that:

1. Tracks all property access during render
2. Subscribes to MobX observables for those properties
3. Triggers re-renders when any accessed property changes

Unlike traditional MobX integration approaches, this hook doesn't require
wrapping components in observers or using special syntax. It simply works by
tracking what you actually use in your component.

## Inspiration

This library was inspired by:

- [Discussion on deprecating `useObserver`](https://github.com/mobxjs/mobx/discussions/2566)
- [Valtio's `useSnapshot` hook to track accessed properies](https://github.com/mobxjs/mobx/discussions/2566#discussioncomment-572094)

## Acknowledgments

- [**Valtio**](https://github.com/pmndrs/valtio): Thanks to Valtio for laying
  the groundwork for a deeply reactive approach that tracks property access in
  React components which this library borrows from.
- [**MobX**](https://github.com/mobxjs/mobx/tree/main/packages/mobx-react-lite):
  Thanks to the MobX team for their
  [`useObserver`](https://github.com/mobxjs/mobx/blob/8b54ab1a6ef23dd76f066a586f735943f95127aa/packages/mobx-react-lite/src/useObserver.ts)
  implementation, which this hook borrows from extensively.

## Sponsor

Thanks to [Gavel](https://www.gavel.io/) for sponsoring the initial development.

[![Gavel](https://assets.gavel.dev/brand/gavel.svg)](https://www.gavel.io/)

## License

MIT
