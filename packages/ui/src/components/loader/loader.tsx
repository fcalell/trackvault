import { createSignal, onCleanup } from "solid-js";

import { cn } from "#lib/cn";

type LoaderProps = {
	text?: string;
	class?: string;
};

const CHARS = "0123456789abcdef.:/-_#";
const TICK_MS = 50;
const TICKS_PER_RESOLVE = 2;
const PAUSE_MS = 1500;

function randomChar() {
	return CHARS[Math.floor(Math.random() * CHARS.length)];
}

const Loader = (props: LoaderProps) => {
	const text = () => props.text ?? "loading...";

	const [display, setDisplay] = createSignal(text());

	let resolvedCount = 0;
	let tickCount = 0;
	let paused = false;
	let pauseTimeout: ReturnType<typeof setTimeout> | undefined;

	function restart() {
		resolvedCount = 0;
		tickCount = 0;
		paused = false;
	}

	const interval = setInterval(() => {
		if (paused) return;

		const t = text();
		tickCount++;

		if (tickCount >= TICKS_PER_RESOLVE) {
			tickCount = 0;
			resolvedCount++;
		}

		if (resolvedCount >= t.length) {
			setDisplay(t);
			paused = true;
			pauseTimeout = setTimeout(restart, PAUSE_MS);
			return;
		}

		let result = "";
		for (let i = 0; i < t.length; i++) {
			if (i < resolvedCount) {
				result += t[i];
			} else if (t[i] === " ") {
				result += " ";
			} else {
				result += randomChar();
			}
		}
		setDisplay(result);
	}, TICK_MS);

	onCleanup(() => {
		clearInterval(interval);
		if (pauseTimeout !== undefined) clearTimeout(pauseTimeout);
	});

	return (
		<span
			role="status"
			aria-label={text()}
			class={cn("text-xs text-muted-foreground font-mono", props.class)}
		>
			{display()}
		</span>
	);
};

export type { LoaderProps };
export { Loader };
