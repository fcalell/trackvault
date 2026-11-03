import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { authClient } from "../../lib/auth.ts";
import { date } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/settings/account")({
	component: AccountSettings,
});

function AccountSettings() {
	const apps = orpc.auth.oauth.grants.list.read();
	const revoke = useMutation(orpc.auth.oauth.grants.revoke.mutationOptions());
	return (
		<Pane
			title="Account"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"How you sign in to this hub, and the apps you have let into it.",
			}}
		>
			<Section
				items={[
					{
						key: "passkey",
						leading: { icon: "KeyRound" },
						title: "Passkey",
						line: "Sign in with this device instead of a code",
						act: {
							icon: "Plus",
							label: "Add a passkey",
							onAct: async () => {
								const answer = await authClient.passkey.addPasskey();
								if (answer?.error)
									throw new Error(
										answer.error.message ?? "The passkey was not added",
									);
							},
							done: "Passkey added",
						},
					},
					{
						key: "sign-out",
						leading: { icon: "LogOut" },
						title: "Sign out",
						act: {
							icon: "LogOut",
							label: "Sign out",
							onAct: () => orpc.auth.signOut.call(),
							to: "/sign-in",
						},
					},
				]}
			/>
			<Section
				title="Connected apps"
				description="MCP clients, such as Claude, that you allowed to read this library and queue jobs."
				items={apps.at((rows) =>
					rows.map((each) => ({
						key: each.id,
						leading: { icon: "Plug" as const },
						title: each.name,
						line: each.uri ?? undefined,
						facts: [date(each.createdAt)],
						act: {
							icon: "Unplug" as const,
							label: `Revoke ${each.name}`,
							destructive: true,
							confirm: {
								title: `Revoke ${each.name}?`,
								sentence:
									"It loses its access at once and can no longer read or change this library. Connecting it again asks for your approval.",
							},
							onAct: () => revoke.mutateAsync({ id: each.id }),
							done: `${each.name} revoked`,
						},
					})),
				)}
				empty={{
					sentence:
						"No app is connected. An MCP client asks for your approval when it first connects.",
				}}
			/>
		</Pane>
	);
}
