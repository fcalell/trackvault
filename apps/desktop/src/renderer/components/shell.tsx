import type { JSX } from "solid-js";
import { Show } from "solid-js";

export default function Shell(props: {
	sidebar?: JSX.Element;
	children: JSX.Element;
}) {
	return (
		<Show
			when={props.sidebar}
			fallback={
				<main class="flex h-full flex-col overflow-hidden bg-background">
					{props.children}
				</main>
			}
		>
			{(sidebar) => (
				<div class="grid h-full grid-cols-[240px_1fr] overflow-hidden">
					<aside class="overflow-y-auto border-r-[length:var(--border-heavy)] border-border bg-card">
						{sidebar()}
					</aside>
					<main class="flex flex-col overflow-hidden bg-background">
						{props.children}
					</main>
				</div>
			)}
		</Show>
	);
}
