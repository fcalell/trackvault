import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import type { Tone } from "@fcalell/ui-core/tokens";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { JobView } from "../../../shared/channels.ts";
import { orpc } from "../../lib/api.ts";
import { Candidates } from "../../lib/candidates.tsx";
import { jobsLive } from "../../lib/live.ts";

interface Params {
	// The search job whose candidates are shown.
	s?: string | undefined;
}

export const Route = createFileRoute("/_app/soulseek")({
	validateSearch: (search: Record<string, unknown>): Params => ({
		s: typeof search.s === "string" ? search.s : undefined,
	}),
	component: Soulseek,
});

const TONES: Record<JobView["state"], Tone> = {
	queued: "waiting",
	running: "running",
	done: "done",
	failed: "failed",
	cancelled: "idle",
};

// Soulseek, through slskd: type what you want, get the candidates ranked best first
// with the reasons, what the library already has marked, and a download for each.
function Soulseek() {
	const { s } = Route.useSearch();
	const navigate = useNavigate();
	const settings = orpc.soulseek.settings.read();
	return (
		<Pane
			title="Soulseek"
			back={false}
			wide
			acts={[
				{ icon: "Download", label: "Downloads", href: "/downloads" },
				{ icon: "ListPlus", label: "Wishlist", href: "/wishlist" },
			]}
		>
			<Banner
				tone="attention"
				sentence={settings.at((each) =>
					each.configured
						? undefined
						: "Soulseek is not set up. Add the slskd address and API key in Settings.",
				)}
				act={settings.at((each) =>
					each.configured
						? undefined
						: { label: "Open Settings", href: "/settings/soulseek" },
				)}
			/>
			<Section
				title="Find a track"
				description="Artist - Title (Mix) works best; a few words do too."
			>
				<Form
					act={orpc.soulseek.search}
					fields={{
						query: { label: "What to find" },
					}}
					submit={{ label: "Search Soulseek" }}
					onDone={(job) => navigate({ to: "/soulseek", search: { s: job.id } })}
				/>
			</Section>
			{s && (
				<Section title="Candidates">
					<Banner
						tone={jobsLive.at((jobs) => {
							const job = jobs.find((each) => each.id === s);
							return job ? TONES[job.state] : "idle";
						})}
						sentence={jobsLive.at((jobs) => {
							const job = jobs.find((each) => each.id === s);
							if (!job) return undefined;
							if (job.state === "failed")
								return job.error ?? "The search failed.";
							if (job.state === "done") return job.message ?? "Done";
							return job.message ?? "Searching Soulseek";
						})}
					/>
					<Candidates searchId={s} />
				</Section>
			)}
		</Pane>
	);
}
