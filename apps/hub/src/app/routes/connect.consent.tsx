import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Button } from "@fcalell/plugin-react-ui/components/button";
import { Gate } from "@fcalell/plugin-react-ui/components/gate";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../lib/api.ts";
import { followRedirect, oauthQuery } from "../lib/oauth.ts";

export const Route = createFileRoute("/connect/consent")({
	validateSearch: (search: Record<string, unknown>) => ({
		client_id:
			typeof search.client_id === "string" ? search.client_id : undefined,
	}),
	component: ConnectConsent,
});

// The last step of connecting an MCP client: say what it may do, and allow or decline.
function ConnectConsent() {
	const { client_id } = Route.useSearch();
	const client = orpc.auth.oauth.client.read({
		clientId: client_id ?? "client",
	});
	const consent = useMutation(orpc.auth.oauth.consent.mutationOptions());
	const answer = async (accept: boolean) =>
		followRedirect(
			await consent.mutateAsync({ accept, oauthQuery: oauthQuery() }),
		);
	return (
		<Gate
			title="Connect a client"
			description="It can search your library, read tracks, playlists and stats, build playlists, and queue auto-tag, analysis and cover jobs. It cannot edit tags or delete files."
			acts={
				<>
					<Button label="Allow" onAct={() => answer(true)} />
					<Button act="quiet" label="Decline" onAct={() => answer(false)} />
				</>
			}
		>
			<Section
				items={client.at((each) => [
					{
						key: "client",
						label: "Client",
						title: each.client_name ?? each.client_id,
						line: each.client_uri ?? undefined,
					},
				])}
			/>
		</Gate>
	);
}
