import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

type InputProps = ComponentProps<"input"> & {
	class?: string;
};

const Input: Component<InputProps> = (props) => {
	const [local, others] = splitProps(props, ["class", "type"]);
	return (
		<input
			type={local.type}
			class={cn(
				"flex h-10 w-full border border-input bg-background px-3 py-2 text-sm text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				local.class,
			)}
			{...others}
		/>
	);
};

export type { InputProps };
export { Input };
