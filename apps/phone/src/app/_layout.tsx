import { audioOutput } from "@fcalell/plugin-native-ui/audio/expo";
import { Dock } from "@fcalell/plugin-native-ui/components/dock";
import { Shell } from "@fcalell/plugin-native-ui/components/shell";
import { connectOutput } from "@fcalell/plugin-native-ui/lib/player";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { Stack } from "expo-router";
import { useHub } from "../lib/hub";
import { SignIn } from "../lib/sign-in";

connectOutput(audioOutput());

const places: PlaceSpec[] = [
	{ route: "/", label: "Library", icon: "Library" },
	{ route: "/playlists", label: "Playlists", icon: "ListMusic" },
	{ route: "/next", label: "Next", icon: "Shuffle" },
	{ route: "/inbox", label: "Inbox", icon: "Inbox" },
	{ route: "/more", label: "More", icon: "Ellipsis" },
];

export default function Layout() {
	const { url, key } = useHub();
	if (!url || !key) return <SignIn />;
	return (
		<Shell places={places} foot={<Dock />}>
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
