// Jobs that move or delete files (organise, quarantine, undo, purge) and the scan
// that reads them do not overlap: a scan that meets a half-finished move would
// read a file as gone and its copy as new. One holder at a time, first come first
// served.
let tail: Promise<void> = Promise.resolve();

export async function acquireFs(signal?: AbortSignal): Promise<() => void> {
	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const before = tail;
	tail = before.then(() => held);
	await before;
	if (signal?.aborted) {
		release();
		signal.throwIfAborted();
	}
	return release;
}
