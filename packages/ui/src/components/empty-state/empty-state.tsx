import type { ComponentProps, JSX, ParentProps } from "solid-js";
import { children as resolveChildren, Show, splitProps } from "solid-js";

import { cn } from "#lib/cn";

type EmptyStateProps = ParentProps<
	ComponentProps<"div"> & {
		icon?: JSX.Element;
		title: string;
		description?: string;
	}
>;

const EmptyState = (props: EmptyStateProps) => {
	const [local, rest] = splitProps(props, [
		"icon",
		"title",
		"description",
		"children",
		"class",
	]);

	const resolved = resolveChildren(() => local.children);

	return (
		<div
			class={cn(
				"flex flex-col items-center justify-center gap-4 py-16",
				local.class,
			)}
			{...rest}
		>
			<Show when={local.icon}>
				<div class="text-border [&_svg]:size-12" aria-hidden="true">
					{local.icon}
				</div>
			</Show>

			<h3 class="text-sm font-bold uppercase tracking-widest text-foreground">
				{local.title}
			</h3>

			<Show when={local.description}>
				<p class="text-sm text-muted-foreground">{local.description}</p>
			</Show>

			<Show when={resolved()}>
				<div class="flex flex-row items-center gap-2">{resolved()}</div>
			</Show>
		</div>
	);
};

export type { EmptyStateProps };
export { EmptyState };
