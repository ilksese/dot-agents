---
name: react-performance-guide
description: "Diagnose and fix React rendering performance and component composition using the parent vs owner distinction, slotted components, and update alignment before reaching for memo. Use this skill whenever the user mentions React re-renders, unnecessary renders, memo, useMemo, useCallback, prop drilling, children as slots, composition, lifting content, state placed too high, a slow or laggy React UI, React DevTools highlight updates, or asks why a child re-renders when its parent state changes. Also use it when restructuring React components so data flow is easier to follow, even if the user never says performance."
---

# React performance guide

This skill encodes Jules Blom's parent/owner model:

- [Parents & Owners in React: Data Flow](https://julesblom.com/writing/parents-owners-data-flow)
- [Parents & Owners in React: Rendering Performance](https://julesblom.com/writing/parents-owners-performance)

The useful claim is not "memo everything" and not "never memo". A React component is a unit of update. Updates follow the owner tree, not the parent tree. Structure the owner tree so that changing state only re-renders the UI that depends on that state. Better composition often makes the data flow shorter at the same time. Performance is the side effect of that alignment.

Read [references/model.md](references/model.md) when the diagnosis needs the precise definitions, the ColorPicker / Dashboard examples, or the memo pitfalls. Do not paste the articles into the answer.

## When this applies

Use the workflow below for function-component React (including Next.js client components) when the task is about:

- a component re-rendering more than the changed data requires
- state living above UI that does not read it
- props passed through components that do not use them
- whether `memo`, `useMemo`, or `useCallback` is the right fix
- splitting a component so frequent updates stay local

Do not apply it to:

- non-React rendering (Vue, Solid, Svelte, raw DOM)
- network, bundle-size, image, or server-response slowness unless a React render is actually on the path
- a measured render that is already cheap and not user-visible. Do not optimize before it is a problem.

Server Components change where `children` is created, but the owner rule still holds for client state: the client component that closes over the state owns the update. Do not move client state into a Server Component to "fix" a re-render.

## Workflow

1. Name the state update, not the component that "feels slow".
   Which state changes, how often, and which visible UI actually reads it?
2. Separate the two trees for the nodes involved. Write this down before editing.
   - Parent: the component or element this node is nested inside. This is the React DevTools Components tree and, roughly, the DOM.
   - Owner: the component whose render created this element. This is what you see in the source. Props come from owners. Owner-updates cascade down the owner tree.
   - In DevTools, double-click a component to reveal its owner. The Components tab alone is the parent tree and will mislead you.
3. Classify the re-render.
   - Self-update: React calls the component whose state changed.
   - Owner-update: a re-render also calls the components that component renders. This is recursive down the owner tree.
     A parent self-update does not, by itself, re-render a slotted child. The owner does.
4. Measure the two distances.
   - Source-to-surface: how many components a value passes through between where it is defined and where it is rendered or used in a handler. Shorter is usually easier to change. A value passed through a component that never reads it is a false dependency.
   - Unit of update: the owner plus everything it renders. If that unit contains UI that ignores the state, the state is too high or the content is owned too low.
5. Restructure before memoizing. Pick the smallest move that aligns the update with the UI that reads the state.
   - Move state down into the component that actually renders it, when nothing above needs it.
   - If the state must sit above a shared parent, make a small slotted component whose only job is to hold that state, then pass the unrelated UI in as `children` or named element props.
   - If the value is needed deep in the tree but intermediate components must keep owning their content, Context is the escape hatch. Prefer composition first. Lifting content is not always right: it makes the owner more coupled to layout and the slot more generic than the product may want.
6. Change code only after the before/after owner is explicit.
   Preserve the parent tree unless the UI is supposed to change. After a slot refactor, the DOM structure should match; the owner tree should be flatter or the frequently updated state should own less.
7. Verify with the running app or a render trace, not by inspection alone.
   Trigger the state update and confirm the expensive or unrelated component does not render. React DevTools "Highlight updates" or a temporary render log is enough. Remove the log.
8. Only then consider `memo`.

## Choosing the fix

Try in this order:

1. Move state down.
2. Slot the unchanged UI out of the component that owns the frequently updated state (`children` or a named JSX prop). The element is created by the owner. If that owner does not re-render, React sees the same element and skips it.
3. Split a new state-holder component when no existing component should own the state.
4. Context, when many distant readers need the same value and composition would tangle the owner.
5. `memo` / `useMemo` / `useCallback` at a measured chokepoint.

`useMemo` around an element is the less natural form of the same skip: it keeps the element referentially equal. Prefer a slot when the owner boundary can express it. A slot is composition; a memoized element is a cache.

## memo is a fickle fix

`memo` opts out of an owner-update by comparing props. It is worth it only when that component re-renders often with the same props and the render is expensive enough to feel.

- Memoization is contagious. One new object, inline function, or fresh element defeats it, and the parent must then `useCallback` / `useMemo` its props. That chain is where the fix silently does nothing while adding work.
- Do not wrap a slotted component in `memo`. `children` is just a prop. The owner creates a new element whenever the owner renders, so `memo` never bails out. Memoizing the child element at the owner with `useMemo` can restore it, but that is a last resort, not the default.
- Do not add `memo` because a component is "pure". Add it when you can name the chokepoint and the unchanged props.

## Output when you are diagnosing

Lead with the boundary, then the change. Use this shape when the user asked why something re-renders or how to structure it:

```markdown
## Boundary

- State: [name, where it lives, what reads it]
- Parent tree: [A contains B contains C]
- Owner tree: [A renders B renders C]
- Update: [self-update of X cascades through ...]
- False dependency: [prop or subtree that ignores the state, or "none"]

## Change

[Move state down / slot unchanged UI / context / memo at a named chokepoint]
[Why this shrinks the unit of update or the source-to-surface without changing the intended UI]

## Check

[How the frequent update was triggered and which component no longer renders]
```

Keep it short. Name components that exist in the code. Do not recommend a slot refactor for a one-level pass-through that is already obvious and stable.

## Editing rules

- Preserve behavior and DOM structure unless the task is a visual change.
- Do not introduce Context, a state library, or `memo` as the first edit.
- Do not "fix" a render by hiding it behind a broken dependency array.
- A few levels of prop passing is fine. Reach for a slot when intermediate components are false dependencies, when the leaf needs to move, or when a frequent update owns an expensive tree.
- Named slots (`header`, `footer`, `sidebar`) are the same mechanism as `children` when one hole is not enough. Passing JSX as a prop does not render it; the receiving component does. Ownership stays at the call site.
- After editing, run the project's relevant check if one exists. This skill does not add a test framework. A render log or DevTools highlight is the acceptance check for the render claim.
