import type { JSX } from "solid-js";
import { createSignal, onCleanup, Show } from "solid-js";

type DialogInstance<P, R> = {
	open: (props: P) => Promise<R | undefined>;
	Component: () => JSX.Element;
};

function createDialog<P = void, R = undefined>(
	render: (props: P, close: (result?: R) => void) => JSX.Element,
): DialogInstance<P, R> {
	const [state, setState] = createSignal<{
		props: P;
		resolve: (result: R | undefined) => void;
	} | null>(null);

	function close(result?: R) {
		const current = state();
		if (!current) return;
		setState(null);
		current.resolve(result);
	}

	function open(props: P): Promise<R | undefined> {
		return new Promise<R | undefined>((resolve) => {
			setState({ props, resolve } as {
				props: P;
				resolve: (result: R | undefined) => void;
			});
		});
	}

	function Component() {
		onCleanup(() => {
			const current = state();
			if (current) {
				setState(null);
				current.resolve(undefined);
			}
		});

		return (
			<Show when={state()} keyed>
				{(s) => render(s.props, close)}
			</Show>
		);
	}

	return { open, Component };
}

export type { DialogInstance };
export { createDialog };
