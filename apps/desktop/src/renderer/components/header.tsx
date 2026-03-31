import { toast } from "@repo/ui/components/toast";
import { Link, useMatches } from "@tanstack/solid-router";
import { RotateCw } from "lucide-solid";
import { createMemo } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation } from "#lib/query";

const sections = [
	{ label: "Library", to: "/library", match: "/library" },
	{ label: "Quality", to: "/quality/duplicates", match: "/quality" },
	{ label: "Settings", to: "/settings", match: "/settings" },
] as const;

export default function Header() {
	const matches = useMatches();
	const rescan = useMutation(() => orpc.library.rescan.mutationOptions());

	function handleRescan() {
		rescan.mutate(
			{},
			{
				onSuccess: (result) => {
					toast.success(
						`Rescan complete: ${result.added} added, ${result.removed} removed`,
					);
				},
				onError: () => toast.error("Rescan failed"),
			},
		);
	}

	const activeSection = createMemo(() => {
		const paths = matches().map((m) => m.fullPath);
		for (const section of sections) {
			if (paths.some((p) => p.startsWith(section.match))) return section.match;
		}
		return "/library" as string;
	});

	return (
		<header class="flex h-12 items-center border-b-[length:var(--border-heavy)] border-border bg-card">
			<div class="flex h-full min-w-[240px] items-center border-r-[length:var(--border-heavy)] border-border px-5">
				<span class="text-sm font-bold uppercase tracking-widest text-primary">
					TrackVault
				</span>
			</div>

			<nav class="flex h-full">
				{sections.map((section) => (
					<Link
						to={section.to}
						class="flex items-center border-r border-input px-6 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						activeProps={{}}
						classList={{
							"!text-foreground !bg-background shadow-[inset_0_-2px_0_var(--color-primary)]":
								activeSection() === section.match,
						}}
					>
						{section.label}
					</Link>
				))}
			</nav>

			<div class="ml-auto flex h-full">
				<button
					type="button"
					class="flex w-12 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
					title="Rescan Library"
					onClick={handleRescan}
					disabled={rescan.isPending}
				>
					<RotateCw
						class="size-4"
						classList={{ "animate-spin": rescan.isPending }}
					/>
				</button>
			</div>
		</header>
	);
}
