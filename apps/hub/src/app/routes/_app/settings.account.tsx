import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { authClient } from "../../lib/auth.ts";

export const Route = createFileRoute("/_app/settings/account")({
	component: AccountSettings,
});

function AccountSettings() {
	return (
		<Pane
			title="Account"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description: "How you sign in to this hub.",
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
		</Pane>
	);
}
