import { isReactiveProxy, useObservable } from "./use-observable";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { makeAutoObservable } from "mobx";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const voidFn = () => vi.fn(() => void 0);
const entries = voidFn();
const values = voidFn();
const abSum = voidFn();
const doubleA = voidFn();
const parentsById = voidFn();

interface Child {
  id: `child-${number}`;
  name: string;
}

let parentIds = 0;
const getParentId = () => `parent-${++parentIds}` as const;
let childIds = 0;
const getChildId = () => `child-${++childIds}` as const;

class Parent {
  id: `parent-${number}`;

  name = "";
  items: Child[] = [];

  constructor({ id }: { id?: `parent-${number}` } = {}) {
    makeAutoObservable(this);
    this.id = id ?? getParentId();
  }

  addChild(child: Child = { id: getChildId(), name: "child" }) {
    this.items.push(child);
  }

  setChildName(index: number, name: string) {
    if (this.items[index]) {
      this.items[index].name = name;
    }
  }

  setName(name: string) {
    this.name = name;
  }
}

class Store {
  parents: Parent[];

  a = 1;
  b = 2;
  mainParent = new Parent({ id: "parent-1000" });

  constructor({ parents }: { parents?: Parent[] } = {}) {
    makeAutoObservable(this);
    this.parents = parents ?? [new Parent({})];
  }

  get entries(): [string, unknown][] {
    entries();
    return Object.entries(this);
  }

  get values(): unknown[] {
    values();
    return Object.values(this);
  }

  get abSum() {
    abSum();
    return this.a + this.b;
  }

  get doubleA() {
    doubleA();
    return this.a * 2;
  }

  get quadrupleA() {
    return this.doubleA * 2;
  }

  get parentsById() {
    parentsById();
    return Object.fromEntries(this.parents.map((item) => [item.id, item]));
  }

  get childrenByParent() {
    return Object.fromEntries(
      this.parents.map((item) => [item.id, item.items]),
    );
  }

  parentExists(parent: Parent) {
    return !!this.childrenByParent[parent.id];
  }

  createNewParents() {
    return [new Parent({}), new Parent({})];
  }

  addParent() {
    this.parents.push(new Parent({}));
  }

  setParents(parents: Parent[]) {
    this.parents = parents;
  }

  setMainParent(parent: Parent) {
    this.mainParent = parent;
  }

  setA(value: number) {
    this.a = value;
  }
  setB(value: number) {
    this.b = value;
  }
}

describe("useObserver", () => {
  let store: Store;

  beforeEach(() => {
    parentIds = 0;
    childIds = 0;
    store = new Store({
      parents: [new Parent(), new Parent()],
    });
  });

  const useStore = () => useObservable(store);

  it("Rerenders components when computed properties change", async () => {
    const TestComponent = () => {
      const snap = useStore();

      return <div>{snap.abSum}</div>;
    };

    const { baseElement, rerender } = await act(() =>
      render(<TestComponent />),
    );
    // Render a few times to ensure we only compute once
    render(<TestComponent />);
    render(<TestComponent />);
    render(<TestComponent />);

    expect(abSum).toHaveBeenCalledOnce();
    expect(baseElement).toHaveTextContent("3");

    await act(async () => {
      store.setA(2);
    });
    expect(abSum).toHaveBeenCalledTimes(2);
    expect(baseElement).toHaveTextContent("4");
    expect(values).not.toHaveBeenCalled();
    expect(entries).not.toHaveBeenCalled();
    // Rerender a few times to make sure we don't recompute
    rerender(<TestComponent />);
    rerender(<TestComponent />);
    rerender(<TestComponent />);
    rerender(<TestComponent />);
    expect(abSum).toHaveBeenCalledTimes(2);
  });

  it("Rerenders when any accessed property changes", async () => {
    let renderCount = 0;
    const TestComponent = () => {
      const snap = useStore();
      renderCount++;

      return (
        <>
          {/* Access name first to ensure we don't drop that we are observing this when accessing
        other props later */}
          <div data-testid="name">{snap.mainParent.name}</div>
          <div data-testid="name2">{snap.mainParent.name}</div>
          <div data-testid="item-count">{snap.mainParent.items.length}</div>
          <div data-testid="id">{snap.mainParent.id}</div>
        </>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId("id")).toHaveTextContent("parent-1000");
    expect(getByTestId("name")).toHaveTextContent("");
    expect(getByTestId("item-count")).toHaveTextContent("0");
    expect(renderCount).toBe(1);
    await act(async () => {
      store.mainParent.setName("NEW_NAME");
    });

    expect(getByTestId("id")).toHaveTextContent("parent-1000");
    expect(getByTestId("name")).toHaveTextContent("NEW_NAME");
    expect(getByTestId("item-count")).toHaveTextContent("0");
    expect(renderCount).toBe(2);
  });

  it("Does not rerender components when different computed properties change", async () => {
    let renderCount = 0;

    expect(store.doubleA).toBe(2);

    const TestComponent = () => {
      const snap = useStore();
      renderCount++;

      return <div>{snap.b}</div>;
    };

    const { baseElement } = render(<TestComponent />);

    expect(doubleA).toHaveBeenCalledOnce();
    expect(baseElement).toHaveTextContent("2");
    expect(renderCount).toBe(1);
    await act(async () => {
      store.setA(2);
    });

    expect(doubleA).toHaveBeenCalledOnce();
    expect(baseElement).toHaveTextContent("2");
    expect(renderCount).toBe(1);
    await act(async () => {
      store.setB(3);
    });
    expect(doubleA).toHaveBeenCalledOnce();
    expect(baseElement).toHaveTextContent("3");
    expect(renderCount).toBe(2);
  });

  it("Rerenders when using an array in a component and an item is added to the array", async () => {
    let renderCount = 0;

    const TestComponent = () => {
      const {
        parentsById: { "parent-1": parent },
      } = useStore();

      renderCount++;

      return (
        <>
          <span data-testid="parent">Parent ID: {parent.id}</span>
          <div data-testid="children">
            {parent.items.map(({ id }) => (
              <div key={id}>Child ID: {id}</div>
            ))}
          </div>
        </>
      );
    };

    const { getByTestId } = render(<TestComponent />);
    expect(parentsById).toHaveBeenCalledOnce();
    expect(getByTestId("parent")).toHaveTextContent("Parent ID: parent-1");
    expect(renderCount).toBe(1);
    await act(async () => {
      store.parents[0].addChild();
    });

    expect(getByTestId("children")).toHaveTextContent("Child ID: child-1");
    expect(renderCount).toBe(2);
  });

  it("Rerenders components using `useObservable` once when computed and non-computed properties change", async () => {
    let renderCount = 0;

    const TestComponent = () => {
      const snap = useStore();
      renderCount++;

      return (
        <>
          <div data-testid="a">{snap.a}</div>
          <div data-testid="doubleA">{snap.doubleA}</div>
        </>
      );
    };

    const { getByTestId } = render(<TestComponent />);

    expect(doubleA).toHaveBeenCalledOnce();
    expect(getByTestId("a")).toHaveTextContent("1");
    expect(getByTestId("doubleA")).toHaveTextContent("2");
    expect(renderCount).toBe(1);

    await act(async () => {
      store.setA(3);
    });
    expect(doubleA).toHaveBeenCalledTimes(2);
    expect(getByTestId("a")).toHaveTextContent("3");
    expect(getByTestId("doubleA")).toHaveTextContent("6");
    expect(renderCount).toBe(2);
  });

  it("Rerenders components using `useObservable` once when nested computed properties change", async () => {
    let renderCount = 0;

    const TestComponent = () => {
      const snap = useStore();
      renderCount++;

      return (
        <>
          <div>{snap.a}</div>
          <div>{snap.doubleA}</div>
          <div>{snap.quadrupleA}</div>
        </>
      );
    };

    const { baseElement } = render(<TestComponent />);

    expect(baseElement).toHaveTextContent("124");
    expect(renderCount).toBe(1);

    await act(async () => {
      store.setA(3);
    });

    expect(baseElement).toHaveTextContent("3612");
    expect(renderCount).toBe(2);
  });

  it("Resets observed properties when they're conditionally accessed", async () => {
    let renderCount = 0;

    const TestComponent = () => {
      const snap = useStore();
      renderCount++;

      return (
        <>
          {snap.a === 1 && <div>{snap.a}</div>}
          {snap.a !== 1 && <div>{snap.b}</div>}
        </>
      );
    };

    const { baseElement } = render(<TestComponent />);

    expect(baseElement).toHaveTextContent("1");
    expect(renderCount).toBe(1);

    // Set this to a value that will cause `b` to be accessed
    await act(async () => {
      store.setA(3);
    });
    // Ensure we rendered `b` correctly
    expect(baseElement).toHaveTextContent("2");
    expect(renderCount).toBe(2);

    // Update `b` to a new value to ensure the component is rerendered
    await act(async () => {
      store.setB(3);
    });
    expect(baseElement).toHaveTextContent("3");
    expect(renderCount).toBe(3);
    // Set `a` to a value that will cause `b` NOT to be accessed
    await act(async () => {
      store.setA(1);
    });
    expect(baseElement).toHaveTextContent("1");
    expect(renderCount).toBe(4);
    // We modify `b` to ensure that the component is not rerendered
    // We want to do it here because rerender 2 accessed `a` and `b`
    // and rerender 3 accessed ONLY A so we wanna make sure `b` isn't being tracked anymore
    await act(async () => {
      store.setB(10);
    });
    // Expect the same values to be shown from before.
    expect(baseElement).toHaveTextContent("1");
    expect(renderCount).toBe(4);
  });

  it("Allows assignment from reactive proxies", async () => {
    const TestComponent = () => {
      const store = useStore();

      return (
        <div>
          <button
            data-testid="replace-parents"
            onClick={() => {
              store.setParents(store.createNewParents());
            }}
          >
            Replace Parents
          </button>
          {store.parents.map(({ id }) => (
            <div key={id}>{id}</div>
          ))}
        </div>
      );
    };

    const { baseElement, getByTestId } = render(<TestComponent />);

    expect(baseElement).toHaveTextContent("parent-1");
    expect(baseElement).toHaveTextContent("parent-2");
    await act(async () => {
      getByTestId("replace-parents").click();
    });

    expect(baseElement).toHaveTextContent("parent-3");
    expect(baseElement).toHaveTextContent("parent-4");
  });

  it("Allows for methods to access wrapped proxies as params during render", async () => {
    store.parents[0].addChild();
    store.parents[0].addChild();

    const TestComponent = () => {
      const { parentExists, parents } = useStore();

      return (
        parentExists(parents[0]) && (
          <div>
            {parents.map(({ id }) => (
              <div key={id} data-testid={id} role="listitem">
                {id}
              </div>
            ))}
          </div>
        )
      );
    };

    const { getByTestId, getAllByRole } = render(<TestComponent />);

    expect(getByTestId("parent-1")).toHaveTextContent("parent-1");
    expect(getByTestId("parent-2")).toHaveTextContent("parent-2");
    expect(getAllByRole("listitem")).toHaveLength(2);
    await act(async () => {
      store.addParent();
    });
    expect(getByTestId("parent-3")).toHaveTextContent("parent-3");
    expect(getAllByRole("listitem")).toHaveLength(3);
  });

  describe("isReactiveProxy", () => {
    it("Returns true for reactive proxies", () => {
      const TestComponent = () => {
        const store = useStore();

        return (
          <>
            <div data-testid="store">
              Is ReactiveProxy: {String(isReactiveProxy(store))}
            </div>
            <div data-testid="not-store">
              Is ReactiveProxy: {String(isReactiveProxy([]))}
            </div>
          </>
        );
      };

      const { getByTestId } = render(<TestComponent />);

      expect(getByTestId("store")).toHaveTextContent("Is ReactiveProxy: true");
      expect(getByTestId("not-store")).toHaveTextContent(
        "Is ReactiveProxy: false",
      );
    });

    it("Returns false for non-reactive objects", () => {
      const obj = { a: 1, b: 2 };
      expect(isReactiveProxy(obj)).toBe(false);
    });
  });
});
