# Parent / owner model

Source articles:

- Jules Blom, [Parents & Owners in React: Data Flow](https://julesblom.com/writing/parents-owners-data-flow) (Aug 28, 2023; updated Apr 24, 2025)
- Jules Blom, [Parents & Owners in React: Rendering Performance](https://julesblom.com/writing/parents-owners-performance) (Sep 21, 2023; updated Apr 24, 2025)

Related primary sources the articles rely on: Dan Abramov, [Before You memo()](https://overreacted.io/before-you-memo/); React docs, [Render and Commit](https://react.dev/learn/render-and-commit); React DevTools, [Exploring Owners](https://react-devtools-tutorial.vercel.app/exploring-owners).

## Definitions

- **Owner**: the component that rendered a particular element. Props come from the owner.
- **Parent**: the component or element in which that element is nested. Often an element (`div`, `article`) rather than a component.
- The parent tree is what rendering created. The owner tree is how it was created.
- Different owner trees can produce the same parent tree, the same DOM, and the same UI.
- Data flow follows the owner tree. So do updates.

A component is a unit of update, not just a piece of UI. The unit is the component plus the element tree it owns. Re-renders happen far more often than mounts. Splitting components is how you divide the work of keeping the UI current.

## Two reasons to render

After the initial render, React calls the component whose state update scheduled the render. That is a **self-update**. By default React then calls every component that one renders, recursively. That is an **owner-update**. It walks the owner tree, not the parent tree.

So "my parent re-rendered" is the wrong sentence if the parent only received the element as `children`. The owner re-rendered, or the component itself set state.

## Slotted components

A slotted component leaves a hole for another component to fill. `children` is the default slot. Named JSX props are extra slots. There is no special slot runtime. The element was created at the call site, so the call site is the owner. The component that returns `{children}` is only the parent.

That is why a slot can skip a level in the owner tree without changing the parent tree.

Multiple `children` arrive as an array. A named JSX prop with several elements needs a fragment. Structurally these are the same tree.

## Data-flow example

Poorly aimed ownership: `App` holds `currentUser` and renders `Dashboard`, which does not read `user` but passes it to `DashboardContent`, which also only forwards it to `WelcomeMessage`.

```jsx
function App() {
  const [currentUser, setCurrentUser] = useState({ name: "Jules" })
  return (
    <div>
      <Header />
      {currentUser ? (
        <Dashboard user={currentUser} />
      ) : (
        <LoginScreen onLogin={() => setCurrentUser({ name: "Michael" })} />
      )}
      <Footer />
    </div>
  )
}

function Dashboard({ user }) {
  return (
    <main>
      <h2>The Dashboard</h2>
      <DashboardNav />
      <DashboardContent user={user} />
    </main>
  )
}
```

`user` is a false dependency of `Dashboard` and `DashboardContent`. Source-to-surface is 3. Moving `WelcomeMessage` in the UI means editing every intermediate signature. Adding `personalMessage` means threading another unused prop.

Slotted version, same parent tree:

```jsx
function App() {
  const [currentUser, setCurrentUser] = useState({ name: "Jules" })
  return (
    <div>
      <Header />
      {currentUser ? (
        <Dashboard>
          <DashboardNav />
          <DashboardContent>
            <WelcomeMessage user={currentUser} />
          </DashboardContent>
        </Dashboard>
      ) : (
        <LoginScreen onLogin={() => setCurrentUser({ name: "Michael" })} />
      )}
      <Footer />
    </div>
  )
}

function Dashboard({ children }) {
  return (
    <main>
      <h2>The Dashboard</h2>
      {children}
    </main>
  )
}
```

`App` still parents and owns `Dashboard`. `Dashboard` parents `DashboardContent` but does not own it. `App` owns `WelcomeMessage`, so `currentUser` goes straight there. Source-to-surface is 1. No Context required.

Count source-to-surface from where the value is defined (state, or a static prop passed at a boundary) to where it is visible in render or consumed in a handler or effect. Lower is generally better. One or two boring levels is not a problem.

## Render example

`App` owns `color` and also owns `ExpensiveTree`, which does not read `color`. Every keystroke re-renders the expensive tree because it is in the same unit of update.

```jsx
function App() {
  const [color, setColor] = useState("red")
  return (
    <div style={{ color }}>
      <input value={color} onChange={(e) => setColor(e.target.value)} />
      <p>Hello, world!</p>
      <ExpensiveTree />
    </div>
  )
}
```

Move the state into a slotted holder. The unchanged UI is created by `App`, which has no state, so it is not recreated when `color` changes. React bails out of that element because it is the same reference as last time.

```jsx
function ColorPicker({ children }) {
  const [color, setColor] = useState("red")
  return (
    <div style={{ color }}>
      <input value={color} onChange={(e) => setColor(e.target.value)} />
      {children}
    </div>
  )
}

function App() {
  return (
    <ColorPicker>
      <p>Hello, world!</p>
      <ExpensiveTree />
    </ColorPicker>
  )
}
```

Parent tree stays `ColorPicker > p + ExpensiveTree`. Owner tree changes: `App` owns both the picker and the expensive tree; `ColorPicker` owns only the input. Clicking color self-updates `ColorPicker` only.

The same skip exists if the owner wraps the element in `useMemo`. That is the unnatural version. Use it when you cannot move the create site.

If no existing component should own the state, make one whose only job is to hold it, and put it above the common parent. This is the same move as "identify where your state should live", aimed at updates rather than at form data.

## Why the slot skip works

A passed-down element is created by the owner, not by the parent who returns it. On a parent self-update the owner did not render, so `children` is referentially equal. React skips rendering that child. No `memo` is involved.

The converse is the pitfall: `memo` on a component that takes `children` compares `children` like any other prop. If its owner re-rendered, `children` is a new element, `memo` fails, and you paid for the comparison. Memoizing that element at the owner repairs the bailout:

```jsx
function User({ name, data, here }) {
  const content = useMemo(() => <p>Hello, {name}.</p>, [name])
  return (
    <SlottedMemo more={data} passed={here}>
      {content}
    </SlottedMemo>
  )
}
```

That double memo is a patch, not a pattern to spread.

## Context and lifting, with the tradeoff

Composition removes false dependencies without a provider. Context is appropriate when the readers are far apart and you do not want the owner to know their layout.

Lifting content gives the owner control and shortens props. It also pushes layout knowledge upward and forces the lower component to be a generic hole. If the lower component should decide its own content, leave it as the owner. Passing props down a couple of levels is not automatically prop-drilling damage.

## What not to conclude

- Do not optimize a render you have not seen. Structure for a followable data flow first; the smaller update falls out when an update is actually hot.
- `memo` does not replace moving state down or slotting. It is the tool for a chokepoint you measured, where props are stable or can be made stable without a long chain.
- One unstable prop defeats `memo`. If you cannot keep the props stable, the memo is extra work.
- "Parent re-render" in a bug report usually means "owner re-render". Check before moving state.
