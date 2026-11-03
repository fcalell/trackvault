import {
	useMutation,
	useQueryClient,
} from "@fcalell/plugin-api/tanstack-query";
import { Button } from "@fcalell/plugin-react-ui/components/button";
import { Gate } from "@fcalell/plugin-react-ui/components/gate";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../lib/api.ts";
import { authClient } from "../lib/auth.ts";
import { followRedirect, oauthQuery } from "../lib/oauth.ts";

export const Route = createFileRoute("/sign-in")({
	component: SignIn,
});

// A page outside the shell, one `Gate`: the email step, the code step its send act
// swaps in, and a passkey for an owner who has enrolled one. No mail is sent: the hub
// writes the code to its own log, which only the owner reads.
function SignIn() {
	const queryClient = useQueryClient();
	const sendOtp = useMutation(orpc.auth.signIn.sendOtp.mutationOptions());
	const [sentTo, setSentTo] = useState<string>();

	const passkey = {
		label: "Use a passkey",
		onAct: async () => {
			const answer = await authClient.signIn.passkey();
			if (answer?.error)
				throw new Error(answer.error.message ?? "That passkey did not work");
			await queryClient.invalidateQueries();
		},
		to: "/",
	} as const;

	if (sentTo !== undefined) {
		return (
			<Gate
				title="Enter your code"
				description={[
					"The hub wrote a code for ",
					{ strong: sentTo },
					" to its log. Paste it here.",
				]}
				form={{
					act: orpc.auth.signIn.verifyOtp,
					given: { email: sentTo, oauthQuery: oauthQuery() },
					fields: { otp: { label: "Code", control: "code" } },
					// An MCP client's authorization resumes where the hub says; otherwise home.
					submit: { label: "Verify", ...(oauthQuery() ? {} : { to: "/" }) },
					onDone: (answer) => followRedirect(answer),
				}}
			>
				<Button act="quiet" label="Back" onAct={() => setSentTo(undefined)} />
				<Button
					act="quiet"
					label="Resend"
					onAct={() => sendOtp.mutateAsync({ email: sentTo })}
				/>
			</Gate>
		);
	}
	return (
		<Gate
			title="Sign in"
			description="Enter your email. The hub writes a code to its log, where only you read it; no email is sent."
			acts={<Button act="secondary" {...passkey} />}
			form={{
				act: orpc.auth.signIn.sendOtp,
				fields: { email: { label: "Email" } },
				submit: { label: "Get a code" },
				onDone: (_sent, { email }) => setSentTo(email),
			}}
		/>
	);
}
