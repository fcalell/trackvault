import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { forget, useHub } from "../lib/hub";
import { queryClient } from "../lib/query";

export default function More() {
	const { url } = useHub();
	return (
		<Pane title="More" back={false}>
			<Section
				items={[
					{
						key: "wishlist",
						title: "Wishlist",
						leading: { icon: "Heart" },
						href: "/wishlist",
					},
					{
						key: "jobs",
						title: "Jobs",
						leading: { icon: "ListChecks" },
						href: "/jobs",
					},
				]}
			/>
			<Section
				title="Hub"
				items={[
					{ key: "address", label: "Address", title: url ?? "" },
					{
						key: "out",
						title: "Disconnect this phone",
						act: {
							icon: "LogOut",
							label: "Disconnect",
							onAct: async () => {
								await forget();
								queryClient.clear();
							},
						},
					},
				]}
			/>
		</Pane>
	);
}
