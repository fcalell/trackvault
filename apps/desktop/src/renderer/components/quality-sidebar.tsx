import { useLocation, useNavigate } from "@tanstack/solid-router";
import { createMemo, For } from "solid-js";

const tools = [
	{ label: "Duplicates", to: "/quality/duplicates" },
	{ label: "Genre Normalization", to: "/quality/genre-normalization" },
	{ label: "File Organizer", to: "/quality/file-organizer" },
] as const;

export default function QualitySidebar() {
	const location = useLocation();
	const navigate = useNavigate();

	const activeTool = createMemo(() => {
		const path = location().pathname;
		for (const tool of tools) {
			if (path === tool.to) return tool.to;
		}
		return tools[0].to;
	});

	return (
		<div>
			<div class="px-4 pt-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
				Tools
			</div>
			<For each={[...tools]}>
				{(tool) => {
					const isActive = () => activeTool() === tool.to;
					return (
						<button
							type="button"
							class="flex w-full items-center gap-2.5 px-4 py-2 text-xs transition-colors hover:bg-muted hover:text-foreground"
							classList={{
								"text-foreground bg-background shadow-[inset_2px_0_0_var(--color-primary)]":
									isActive(),
								"text-muted-foreground": !isActive(),
							}}
							onClick={() => navigate({ to: tool.to } as never)}
						>
							{tool.label}
						</button>
					);
				}}
			</For>
		</div>
	);
}
