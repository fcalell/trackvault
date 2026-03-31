import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DropdownMenuPrimitive.DropdownMenuContentProps<T>>,
) => {
	const [local, others] = splitProps(
		props as DropdownMenuPrimitive.DropdownMenuContentProps & {
			class?: string;
		},
		["class"],
	);
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				class={cn(
					"z-50 min-w-[8rem] overflow-hidden border border-border bg-popover p-1 text-popover-foreground animate-content-show data-[closed]:animate-content-hide",
					local.class,
				)}
				{...others}
			/>
		</DropdownMenuPrimitive.Portal>
	);
};

const DropdownMenuItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DropdownMenuPrimitive.DropdownMenuItemProps<T>>,
) => {
	const [local, others] = splitProps(
		props as DropdownMenuPrimitive.DropdownMenuItemProps & { class?: string },
		["class"],
	);
	return (
		<DropdownMenuPrimitive.Item
			class={cn(
				"relative flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
				local.class,
			)}
			{...others}
		/>
	);
};

const DropdownMenuSeparator = <T extends ValidComponent = "hr">(
	props: PolymorphicProps<
		T,
		DropdownMenuPrimitive.DropdownMenuSeparatorProps<T>
	>,
) => {
	const [local, others] = splitProps(
		props as DropdownMenuPrimitive.DropdownMenuSeparatorProps & {
			class?: string;
		},
		["class"],
	);
	return (
		<DropdownMenuPrimitive.Separator
			class={cn("-mx-1 my-1 h-px bg-muted", local.class)}
			{...others}
		/>
	);
};

const DropdownMenuLabel = <T extends ValidComponent = "span">(
	props: PolymorphicProps<
		T,
		DropdownMenuPrimitive.DropdownMenuGroupLabelProps<T>
	>,
) => {
	const [local, others] = splitProps(
		props as DropdownMenuPrimitive.DropdownMenuGroupLabelProps & {
			class?: string;
		},
		["class"],
	);
	return (
		<DropdownMenuPrimitive.GroupLabel
			class={cn("px-2 py-1.5 text-sm font-semibold", local.class)}
			{...others}
		/>
	);
};

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuTrigger,
};
