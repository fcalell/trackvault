import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { Toaster as SolidSonnerToaster, toast } from "solid-sonner";

type ToasterProps = ComponentProps<typeof SolidSonnerToaster>;

function Toaster(props: ToasterProps) {
	const [local, rest] = splitProps(props, ["theme", "position"]);

	return (
		<SolidSonnerToaster
			data-slot="toaster"
			theme={local.theme ?? "dark"}
			position={local.position ?? "top-right"}
			style={{ "font-family": "var(--font-mono)" }}
			toastOptions={{
				unstyled: true,
				style: {
					padding: "16px",
					background: "var(--color-card)",
					border: "2px solid var(--color-border)",
					color: "var(--color-foreground)",
					"font-family": "inherit",
				},
				classes: {
					success: "!border-l-[3px] !border-l-green-500",
					error: "!border-l-[3px] !border-l-red-500",
					warning: "!border-l-[3px] !border-l-yellow-500",
					info: "!border-l-[3px] !border-l-primary",
				},
			}}
			{...rest}
		/>
	);
}

export type { ToasterProps };
export { Toaster, toast };
