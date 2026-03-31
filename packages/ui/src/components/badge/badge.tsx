import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const badgeVariants = cva(
	"inline-flex items-center px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider transition-colors",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				secondary: "bg-secondary text-secondary-foreground",
				outline: "border border-border text-foreground",
				success: "bg-status-success/20 text-status-success",
				warning: "bg-status-warning/20 text-status-warning",
				error: "bg-status-error/20 text-status-error",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

type BadgeProps = ComponentProps<"div"> & VariantProps<typeof badgeVariants>;

const Badge: Component<BadgeProps> = (props) => {
	const [local, others] = splitProps(props, ["variant", "class"]);
	return (
		<div
			data-slot="badge"
			class={cn(badgeVariants({ variant: local.variant }), local.class)}
			{...others}
		/>
	);
};

export type { BadgeProps };
export { Badge };
