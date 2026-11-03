import { Button } from "@fcalell/plugin-native-ui/components/button";
import { Gate } from "@fcalell/plugin-native-ui/components/gate";
import { Input } from "@fcalell/plugin-native-ui/components/input";
import { Shell } from "@fcalell/plugin-native-ui/components/shell";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { Stack } from "expo-router";
import { useState } from "react";
import { client } from "../lib/api";
import { forget, normalizeUrl, save, use, useHub } from "../lib/hub";
import { queryClient } from "../lib/query";

const places: PlaceSpec[] = [
	{ route: "/", label: "Library", icon: "Library" },
	{ route: "/playlists", label: "Playlists", icon: "ListMusic" },
	{ route: "/next", label: "Next", icon: "Shuffle" },
	{ route: "/inbox", label: "Inbox", icon: "Inbox" },
	{ route: "/more", label: "More", icon: "Ellipsis" },
];

function SignIn() {
	const saved = useHub();
	const [address, setAddress] = useState(saved.url ?? "");
	const [key, setKey] = useState("");
	const [refused, setRefused] = useState<string>();
	const ready = address.trim() !== "" && key.trim() !== "";
	return (
		<Gate
			title="Connect to your hub"
			description={[
				"Make a key in the hub under ",
				{ strong: "Devices" },
				", name it for this phone, and paste it here with the hub's address.",
			]}
		>
			<Input
				label="Hub address"
				kind="source"
				value={address}
				onChange={setAddress}
				placeholder="https://trackvault.example.ts.net"
			/>
			<Input
				label="Device key"
				kind="secret"
				value={key}
				onChange={setKey}
				error={refused}
			/>
			<Button
				label="Connect"
				blocked={ready ? undefined : "Enter the address and the key."}
				onAct={async () => {
					setRefused(undefined);
					use({ url: normalizeUrl(address), key: key.trim() });
					try {
						// The first call decides: a wrong address or a revoked key stops here.
						await client.jobs.list({ limit: 1 });
					} catch (error) {
						await forget();
						setRefused(
							"The hub did not accept this address and key. Check both and that the phone can reach the hub.",
						);
						throw error;
					}
					await save();
					await queryClient.invalidateQueries();
				}}
			/>
		</Gate>
	);
}

export default function Layout() {
	const { url, key } = useHub();
	if (!url || !key) return <SignIn />;
	return (
		<Shell places={places}>
			<Stack screenOptions={{ headerShown: false, animation: "none" }}>
				<Stack.Screen
					name="track/[id]"
					options={{ animation: "slide_from_right" }}
				/>
				<Stack.Screen
					name="playlist/[id]"
					options={{ animation: "slide_from_right" }}
				/>
				<Stack.Screen
					name="wishlist"
					options={{ animation: "slide_from_right" }}
				/>
				<Stack.Screen name="jobs" options={{ animation: "slide_from_right" }} />
			</Stack>
		</Shell>
	);
}
