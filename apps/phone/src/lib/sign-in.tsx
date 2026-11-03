import {
	type AuthClient,
	sendEmailOtp,
	signInWithEmailOtp,
	useAuthClient,
} from "@fcalell/plugin-auth/expo";
import { Button } from "@fcalell/plugin-native-ui/components/button";
import { Gate } from "@fcalell/plugin-native-ui/components/gate";
import { Input } from "@fcalell/plugin-native-ui/components/input";
import { Picker } from "@fcalell/plugin-native-ui/components/picker";
import { useState } from "react";
import { Platform } from "react-native";
import { client, hubUrl } from "./api";
import { forget, normalizeUrl, point, save, use, useHub } from "./hub";

type Way = "code" | "key";

const WAYS = [
	{ value: "code" as const, label: "Email code" },
	{ value: "key" as const, label: "Device key" },
];

// A signed-in session is traded for a device key of this phone: the key is what every
// later request carries (the API, the player), it can be revoked in the hub under
// Devices, and no session is kept.
async function keyFromSession(authClient: AuthClient): Promise<string> {
	// No key is held yet, so the shared client sends the session's cookie.
	const made = await client.auth.devices.create({
		name: `Phone (${Platform.OS})`,
	});
	await authClient.signOut();
	return made.key;
}

/** Takes the key in and proves it with a call: a wrong address or a revoked key stops here. */
async function connect(url: string, key: string) {
	use({ url, key });
	try {
		await client.jobs.list({ limit: 1 });
	} catch (error) {
		await forget();
		throw error;
	}
	await save();
}

export function SignIn() {
	const authClient = useAuthClient();
	const saved = useHub();
	const [way, setWay] = useState<Way>("code");
	const [address, setAddress] = useState(saved.url ?? "");
	const [key, setKey] = useState("");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [sentTo, setSentTo] = useState<string>();
	const [refused, setRefused] = useState<string>();
	const url = normalizeUrl(address);
	const addressed = address.trim() !== "";

	const unreachable =
		"The hub did not accept this. Check the address and that the phone can reach the hub.";

	return (
		<Gate
			title="Connect to your hub"
			description={
				way === "key"
					? [
							"Make a key in the hub under ",
							{ strong: "Devices" },
							", name it for this phone, and paste it here with the hub's address.",
						]
					: "The hub emails a code to its owner's address."
			}
		>
			<Input
				label="Hub address"
				kind="source"
				value={address}
				onChange={(next) => {
					setAddress(next);
					setSentTo(undefined);
				}}
				placeholder="https://trackvault.example.ts.net"
			/>
			<Picker
				fit="segments"
				label="Sign in with"
				options={WAYS}
				value={way}
				onChange={(next) => {
					setWay(next);
					setRefused(undefined);
				}}
			/>
			{way === "key" ? (
				<>
					<Input
						label="Device key"
						kind="secret"
						value={key}
						onChange={setKey}
						error={refused}
					/>
					<Button
						label="Connect"
						blocked={
							addressed && key.trim() !== ""
								? undefined
								: "Enter the address and the key."
						}
						onAct={async () => {
							setRefused(undefined);
							try {
								await connect(url, key.trim());
							} catch (error) {
								setRefused(unreachable);
								throw error;
							}
						}}
					/>
				</>
			) : sentTo === undefined ? (
				<>
					<Input
						label="Email"
						kind="email"
						value={email}
						onChange={setEmail}
						error={refused}
					/>
					<Button
						label="Email me a code"
						blocked={
							addressed && email.trim() !== ""
								? undefined
								: "Enter the address and your email."
						}
						onAct={async () => {
							setRefused(undefined);
							point(url);
							const sent = await sendEmailOtp(authClient, email.trim());
							if (sent.error) {
								setRefused(sent.error.message ?? unreachable);
								throw new Error(sent.error.message);
							}
							setCode("");
							setSentTo(email.trim());
						}}
					/>
				</>
			) : (
				<>
					<Input
						label={`Code sent to ${sentTo}`}
						kind="code"
						length={6}
						value={code}
						onChange={setCode}
						onComplete={async (entered) => {
							const signed = await signInWithEmailOtp(authClient, {
								email: sentTo,
								otp: entered,
							});
							if (signed.error) throw new Error(signed.error.message);
							await connect(hubUrl(), await keyFromSession(authClient));
						}}
					/>
					<Button
						act="secondary"
						label="Use another email"
						onAct={() => setSentTo(undefined)}
					/>
				</>
			)}
		</Gate>
	);
}
