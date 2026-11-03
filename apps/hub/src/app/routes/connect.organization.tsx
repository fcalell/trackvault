import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Button } from "@fcalell/plugin-react-ui/components/button";
import { Gate } from "@fcalell/plugin-react-ui/components/gate";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../lib/api.ts";
import { followRedirect, oauthQuery } from "../lib/oauth.ts";

export const Route = createFileRoute("/connect/organization")({
	component: ConnectOrganization,
});

// Step two of connecting an MCP client: the organization the client may work in
// (always asked, the active one too). Choosing resumes the authorization at consent.
function ConnectOrganization() {
	const organizations = orpc.auth.organization.list.read();
	const choose = useMutation(
		orpc.auth.organization.setActive.mutationOptions(),
	);
	const deny = useMutation(orpc.auth.oauth.consent.mutationOptions());
	return (
		<Gate
			title="Choose an organization"
			description="The client will work in the library of the one you choose."
			acts={
				<Button
					act="quiet"
					label="Deny"
					onAct={async () =>
						followRedirect(
							await deny.mutateAsync({
								accept: false,
								oauthQuery: oauthQuery(),
							}),
						)
					}
				/>
			}
		>
			<Section
				items={organizations.at((rows) =>
					rows.map((each) => ({
						key: each.id,
						leading: { icon: "Building2" as const },
						title: each.name,
						act: {
							icon: "ArrowRight" as const,
							label: `Use ${each.name}`,
							onAct: async () =>
								followRedirect(
									await choose.mutateAsync({
										organizationId: each.id,
										oauthQuery: oauthQuery(),
									}),
								),
						},
					})),
				)}
				empty={{ sentence: "You belong to no organization." }}
			/>
		</Gate>
	);
}
