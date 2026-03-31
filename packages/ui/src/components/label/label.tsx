import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

type LabelProps = ComponentProps<"label">;

const Label: Component<LabelProps> = (props) => {
	const [local, others] = splitProps(props, ["class"]);
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: composed with inputs at usage site
		<label
			class={cn(
				"text-xs font-bold uppercase tracking-widest text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
				local.class,
			)}
			{...others}
		/>
	);
};

export type { LabelProps };
export { Label };
