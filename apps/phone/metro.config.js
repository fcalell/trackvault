// The native Metro config is generated into .stack/metro.config.cjs by
// `stack generate`. Configure Metro through stack.config.ts — this shim only
// re-exports the generated config so Expo's root-file convention is satisfied.
// (The generated file is `.cjs` so Node can require() it from this `type: module`
// package — a `.js` would parse as ESM and its require/module.exports would throw.)
module.exports = require("./.stack/metro.config.cjs");
