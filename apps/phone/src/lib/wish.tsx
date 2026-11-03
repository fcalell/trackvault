import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Input } from "@fcalell/plugin-native-ui/components/input";
import { Sheet } from "@fcalell/plugin-native-ui/components/sheet";
import { useState } from "react";
import { orpc } from "./api";
import { refresh } from "./refresh";

/** The "heard it in a club" quick add: a sheet that takes an artist and a title. */
export function WishSheet({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [artist, setArtist] = useState("");
	const [title, setTitle] = useState("");
	const add = useMutation({
		...orpc.wishlist.add.mutationOptions(),
		onSuccess: refresh,
	});
	return (
		<Sheet
			open={open}
			onClose={onClose}
			title="Heard in a club"
			description="The hub looks for it and tells you when it is found."
			submit={{
				label: "Add",
				blocked:
					artist.trim() && title.trim()
						? undefined
						: "Enter the artist and the title.",
				done: "Added to the wishlist.",
				onAct: async () => {
					await add.mutateAsync({ artist, title });
					setArtist("");
					setTitle("");
					onClose();
				},
			}}
		>
			<Input label="Artist" value={artist} onChange={setArtist} />
			<Input label="Title" value={title} onChange={setTitle} />
		</Sheet>
	);
}
