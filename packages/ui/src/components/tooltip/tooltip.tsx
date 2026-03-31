import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TooltipPrimitive from "@kobalte/core/tooltip";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, TooltipPrimitive.TooltipContentProps<T>>,
) => {
	const [local, others] = splitProps(
		props as TooltipPrimitive.TooltipContentProps & { class?: string },
		["class"],
	);
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				class={cn(
					"z-50 overflow-hidden border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground animate-content-show data-[closed]:animate-content-hide",
					local.class,
				)}
				{...others}
			/>
		</TooltipPrimitive.Portal>
	);
};

export { Tooltip, TooltipContent, TooltipTrigger };
