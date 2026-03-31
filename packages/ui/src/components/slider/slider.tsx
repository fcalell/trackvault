import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SliderPrimitive from "@kobalte/core/slider";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "#lib/cn";

type SliderProps<T extends ValidComponent = "div"> =
	SliderPrimitive.SliderRootProps<T> & {
		class?: string;
	};

const Slider = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, SliderProps<T>>,
) => {
	const [local, others] = splitProps(props as SliderProps, ["class"]);
	return (
		<SliderPrimitive.Root
			class={cn(
				"relative flex w-full touch-none select-none items-center",
				local.class,
			)}
			{...others}
		>
			<SliderPrimitive.Track class="relative h-1.5 w-full grow bg-muted">
				<SliderPrimitive.Fill class="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb class="block size-4 border-2 border-primary bg-background transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50">
				<SliderPrimitive.Input />
			</SliderPrimitive.Thumb>
		</SliderPrimitive.Root>
	);
};

export type { SliderProps };
export { Slider };
