import * as CheckboxPrimitive from "@kobalte/core/checkbox";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { Check } from "lucide-solid";
import type { JSX, ValidComponent } from "solid-js";
import { Show, splitProps } from "solid-js";

import { cn } from "#lib/cn";

type CheckboxProps<T extends ValidComponent = "div"> =
	CheckboxPrimitive.CheckboxRootProps<T> & {
		class?: string;
		label?: JSX.Element;
	};

const Checkbox = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, CheckboxProps<T>>,
) => {
	const [local, others] = splitProps(props as CheckboxProps, [
		"class",
		"label",
	]);
	return (
		<CheckboxPrimitive.Root
			class={cn("group flex items-center gap-2", local.class)}
			{...others}
		>
			<CheckboxPrimitive.Input class="peer" />
			<CheckboxPrimitive.Control class="size-4 shrink-0 border border-primary transition-colors data-[checked]:bg-primary data-[checked]:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
				<CheckboxPrimitive.Indicator>
					<Check class="size-3.5" />
				</CheckboxPrimitive.Indicator>
			</CheckboxPrimitive.Control>
			<Show when={local.label}>
				<CheckboxPrimitive.Label class="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
					{local.label}
				</CheckboxPrimitive.Label>
			</Show>
		</CheckboxPrimitive.Root>
	);
};

export type { CheckboxProps };
export { Checkbox };
