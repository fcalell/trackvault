import * as DialogPrimitive from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { X } from "lucide-solid";
import type { ComponentProps, JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DialogPrimitive.DialogOverlayProps<T>>,
) => {
	const [local, others] = splitProps(
		props as DialogPrimitive.DialogOverlayProps & { class?: string },
		["class"],
	);
	return (
		<DialogPrimitive.Overlay
			class={cn(
				"fixed inset-0 z-50 bg-black/80 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
				local.class,
			)}
			{...others}
		/>
	);
};

const DialogContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DialogPrimitive.DialogContentProps<T>> & {
		class?: string;
	},
) => {
	const [local, others] = splitProps(
		props as DialogPrimitive.DialogContentProps & {
			class?: string;
			children?: JSX.Element;
		},
		["class", "children"],
	);
	return (
		<DialogPortal>
			<DialogOverlay />
			<div class="fixed inset-0 z-50 flex items-center justify-center">
				<DialogPrimitive.Content
					class={cn(
						"z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 animate-content-show data-[closed]:animate-content-hide",
						local.class,
					)}
					{...others}
				>
					{local.children}
					<DialogPrimitive.CloseButton class="absolute top-4 right-4 opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none">
						<X class="size-4" />
						<span class="sr-only">Close</span>
					</DialogPrimitive.CloseButton>
				</DialogPrimitive.Content>
			</div>
		</DialogPortal>
	);
};

const DialogHeader = (props: ComponentProps<"div">) => {
	const [local, others] = splitProps(props, ["class"]);
	return (
		<div
			class={cn("flex flex-col gap-1.5 text-center sm:text-left", local.class)}
			{...others}
		/>
	);
};

const DialogFooter = (props: ComponentProps<"div">) => {
	const [local, others] = splitProps(props, ["class"]);
	return (
		<div
			class={cn(
				"flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2",
				local.class,
			)}
			{...others}
		/>
	);
};

const DialogTitle = <T extends ValidComponent = "h2">(
	props: PolymorphicProps<T, DialogPrimitive.DialogTitleProps<T>>,
) => {
	const [local, others] = splitProps(
		props as DialogPrimitive.DialogTitleProps & { class?: string },
		["class"],
	);
	return (
		<DialogPrimitive.Title
			class={cn(
				"text-lg font-semibold leading-none tracking-tight",
				local.class,
			)}
			{...others}
		/>
	);
};

const DialogDescription = <T extends ValidComponent = "p">(
	props: PolymorphicProps<T, DialogPrimitive.DialogDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(
		props as DialogPrimitive.DialogDescriptionProps & { class?: string },
		["class"],
	);
	return (
		<DialogPrimitive.Description
			class={cn("text-sm text-muted-foreground", local.class)}
			{...others}
		/>
	);
};

export {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
};
