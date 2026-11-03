// A worker thread's module. Run from source, a worker is its `.ts` file (Node strips the
// types). The production bundle is one file and holds no such file: `scripts/bundle-extras.ts`
// writes each worker as `<name>.mjs` beside `server.mjs`, which this finds by the bundle
// being the module that is running.
const bundled = import.meta.url.endsWith(".mjs");

export function workerFile(name: string, source: URL): URL {
	return bundled ? new URL(`./${name}.mjs`, import.meta.url) : source;
}
