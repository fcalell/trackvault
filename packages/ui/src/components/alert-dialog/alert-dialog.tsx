import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ComponentProps, JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<
		T,
		AlertDialogPrimitive.AlertDialogContentProps<T>
	> & { class?: string },
) => {
	const [local, others] = splitProps(
		props as unknown as AlertDialogPrimitive.AlertDialogContentProps & {
			class?: string;
			children?: JSX.Element;
		},
		["class", "children"],
	);
	return (
		<AlertDialogPrimitive.Portal>
			<AlertDialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/80 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0" />
			<div class="fixed inset-0 z-50 flex items-center justify-center">
				<AlertDialogPrimitive.Content
					class={cn(
						"z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 animate-content-show data-[closed]:animate-content-hide",
						local.class,
					)}
					{...others}
				>
					{local.children}
				</AlertDialogPrimitive.Content>
			</div>
		</AlertDialogPrimitive.Portal>
	);
};

const AlertDialogHeader = (props: ComponentProps<"div">) => {
	const [local, others] = splitProps(props, ["class"]);
	return (
		<div
			class={cn("flex flex-col gap-2 text-center sm:text-left", local.class)}
			{...others}
		/>
	);
};

const AlertDialogFooter = (props: ComponentProps<"div">) => {
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

const AlertDialogTitle = <T extends ValidComponent = "h2">(
	props: PolymorphicProps<T, AlertDialogPrimitive.AlertDialogTitleProps<T>>,
) => {
	const [local, others] = splitProps(
		props as AlertDialogPrimitive.AlertDialogTitleProps & { class?: string },
		["class"],
	);
	return (
		<AlertDialogPrimitive.Title
			class={cn("text-lg font-semibold", local.class)}
			{...others}
		/>
	);
};

const AlertDialogDescription = <T extends ValidComponent = "p">(
	props: PolymorphicProps<
		T,
		AlertDialogPrimitive.AlertDialogDescriptionProps<T>
	>,
) => {
	const [local, others] = splitProps(
		props as AlertDialogPrimitive.AlertDialogDescriptionProps & {
			class?: string;
		},
		["class"],
	);
	return (
		<AlertDialogPrimitive.Description
			class={cn("text-sm text-muted-foreground", local.class)}
			{...others}
		/>
	);
};

export {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
};
