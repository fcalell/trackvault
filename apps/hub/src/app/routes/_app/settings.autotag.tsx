import { preload } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { createFileRoute } from "@tanstack/react-router";
import {
	AUTOTAG_POLICIES,
	AUTOTAG_POLICY_LABELS,
} from "../../../shared/intelligence.ts";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/settings/autotag")({
	loader: ({ context }) =>
		Promise.all([preload(context.queryClient, orpc.autotag.settings.read())]),
	component: AutotagSettings,
});

function AutotagSettings() {
	const autotag = orpc.autotag.settings.read();
	return (
		<Pane
			title="Auto-tag"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"Providers are asked about a track and what they agree on waits in Auto-tag review. A provider with no key or user agent is not asked.",
			}}
		>
			<Form
				act={orpc.autotag.updateSettings}
				commit="field"
				values={autotag.at((each) => ({
					autotagMusicbrainz: each.autotagMusicbrainz,
					autotagMusicbrainzAgent: each.autotagMusicbrainzAgent ?? "",
					autotagAcoustid: each.autotagAcoustid,
					autotagDiscogs: each.autotagDiscogs,
					autotagBeatport: each.autotagBeatport,
					autotagDeezer: each.autotagDeezer,
					autotagPolicy: each.autotagPolicy,
					autotagMinConfidence: each.autotagMinConfidence,
					autotagCacheDays: each.autotagCacheDays,
					autotagInbox: each.autotagInbox,
					autotagAcoustidKey: each.autotagAcoustidKey ?? undefined,
					autotagDiscogsToken: each.autotagDiscogsToken ?? undefined,
					autotagBeatportToken: each.autotagBeatportToken ?? undefined,
				}))}
				submit={{ done: "Saved" }}
				fields={{
					autotagMusicbrainz: { label: "MusicBrainz" },
					autotagMusicbrainzAgent: {
						label: "MusicBrainz user agent",
						description:
							"Who you are to MusicBrainz and Discogs, for example TrackVault/1.0 (you@example.com). They block anonymous agents.",
					},
					autotagAcoustid: { label: "AcoustID" },
					autotagAcoustidKey: {
						label: "AcoustID key",
						control: "secret",
						description:
							"A free application key (acoustid.org/new-application). Needs fpcalc on the hub to fingerprint files.",
					},
					autotagDiscogs: { label: "Discogs" },
					autotagDiscogsToken: {
						label: "Discogs token",
						control: "secret",
						description:
							"A personal access token (discogs.com/settings/developers).",
					},
					autotagBeatport: { label: "Beatport" },
					autotagBeatportToken: {
						label: "Beatport access token",
						control: "secret",
						description: "Genre, key and tempo for dance music.",
					},
					autotagDeezer: {
						label: "Deezer",
						description: "Needs no key: covers, ISRC and release dates.",
					},
					autotagPolicy: {
						label: "Policy",
						description:
							"Overwrite also replaces differing tags, except the title and artist the search used.",
						options: AUTOTAG_POLICIES.map((value) => ({
							value,
							label: AUTOTAG_POLICY_LABELS[value],
						})),
					},
					autotagMinConfidence: {
						label: "Least confidence",
						description: "Percent. A field below it is not proposed.",
					},
					autotagCacheDays: {
						label: "Remember answers for",
						description: "Days. 0 asks the providers every time.",
					},
					autotagInbox: {
						label: "Tag new files in the inbox",
						description:
							"The inbox pipeline fills tags with this policy before you approve a file.",
					},
				}}
			/>
		</Pane>
	);
}
