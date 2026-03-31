import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

const buttonVariants = cva(
	"inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,background-color,border-color] duration-(--duration-base) ease-(--ease) focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
				outline:
					"text-foreground border border-input hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
				ghost:
					"text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
				link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
			},
			size: {
				default: "h-10 px-4 py-2 [&_svg]:size-4",
				sm: "h-9 px-3 text-xs [&_svg]:size-4",
				lg: "h-11 px-8 [&_svg]:size-5",
				icon: "size-10 [&_svg]:size-5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

type ButtonProps<T extends ValidComponent = "button"> =
	ButtonPrimitive.ButtonRootProps<T> &
		VariantProps<typeof buttonVariants> & {
			class?: string | undefined;
			children?: JSX.Element;
		};

const Button = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, ButtonProps<T>>,
) => {
	const [local, others] = splitProps(props as ButtonProps, [
		"variant",
		"size",
		"class",
	]);
	return (
		<ButtonPrimitive.Root
			class={cn(
				buttonVariants({ variant: local.variant, size: local.size }),
				local.class,
			)}
			{...others}
		/>
	);
};

export type { ButtonProps };
export { Button, buttonVariants };
