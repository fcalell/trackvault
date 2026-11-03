// The Expo app config is generated into .stack/app.config.cjs by
// `stack generate`. Configure the app through stack.config.ts — this shim only
// re-exports the generated config so Expo's root-file convention is satisfied.
// (Expo loads this root file, then require()s the generated config through Node.
// It is `.cjs` — not `.ts` (Node can't require a `.ts`) nor `.js` (this is a
// `type: module` package, so a `.js` would parse as ESM and break).)
export { default } from "./.stack/app.config.cjs";
