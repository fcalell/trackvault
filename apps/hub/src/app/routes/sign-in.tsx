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

export const Route = createFileRoute("/sign-in")({
	component: SignIn,
});

// A page outside the shell, one `Gate`: the email step, the code step its Continue
// swaps in, and a passkey for an owner who has enrolled one. The code is written to the
// hub's log, which only the owner reads.
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
					"The code was written to the hub's log for ",
					{ strong: sentTo },
				]}
				form={{
					act: orpc.auth.signIn.verifyOtp,
					given: { email: sentTo },
					fields: { otp: { label: "Code", control: "code" } },
					submit: { label: "Verify", to: "/" },
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
			form={{
				act: orpc.auth.signIn.sendOtp,
				fields: { email: { label: "Email" } },
				submit: { label: "Continue" },
				onDone: (_sent, { email }) => setSentTo(email),
			}}
		>
			<Button act="quiet" {...passkey} />
		</Gate>
	);
}
