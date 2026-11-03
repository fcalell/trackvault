// essentia.js ships no types for its CommonJS entry.
declare module "essentia.js" {
	const lib: { Essentia: new (wasm: unknown) => unknown; EssentiaWASM: unknown };
	export default lib;
}
