import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings")({
	component: Settings,
});

// Settings are a page per area, each opened from this list.
function Settings() {
	return (
		<>
			<Pane title="Settings" back={false} wide>
				<Section
					items={[
						{
							key: "library",
							leading: { icon: "Library" },
							title: "Library",
							line: "The folder that holds your music, and the bitrate it is checked against",
							href: "/settings/library",
						},
						{
							key: "soulseek",
							leading: { icon: "Search" },
							title: "Soulseek",
							line: "slskd's address and key, and what the wishlist downloads",
							href: "/settings/soulseek",
						},
						{
							key: "inbox",
							leading: { icon: "Inbox" },
							title: "Inbox",
							line: "What is filed without asking, and how alike two files must be",
							href: "/settings/inbox",
						},
						{
							key: "autotag",
							leading: { icon: "WandSparkles" },
							title: "Auto-tag",
							line: "Which providers are asked, with their keys",
							href: "/settings/autotag",
						},
						{
							key: "analysis",
							leading: { icon: "Image" },
							title: "Cover art and analysis",
							line: "The smallest cover to embed, and measuring BPM and key",
							href: "/settings/analysis",
						},
						{
							key: "import",
							leading: { icon: "ListPlus" },
							title: "Playlist import",
							line: "Your Spotify app's client id and secret",
							href: "/settings/import",
						},
						{
							key: "backups",
							leading: { icon: "DatabaseBackup" },
							title: "Backups",
							line: "The daily database backup and the offsite bucket, on the Backups page",
							href: "/backups/settings",
						},
						{
							key: "account",
							leading: { icon: "UserRound" },
							title: "Account",
							line: "Passkeys and signing out",
							href: "/settings/account",
						},
					]}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
