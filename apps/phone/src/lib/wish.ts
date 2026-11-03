import { sheetOf } from "@fcalell/plugin-native-ui/lib/act";
import { orpc } from "./api";

/** The "heard it in a club" quick add: a pane act that opens a sheet over `wishlist.add`. */
export const wishAct = {
	icon: "Plus" as const,
	label: "Heard in a club",
	sheet: sheetOf({
		title: "Heard in a club",
		description: "The hub looks for it and tells you when it is found.",
		form: {
			act: orpc.wishlist.add,
			fields: {
				artist: { label: "Artist" },
				title: { label: "Title" },
			},
			submit: { label: "Add", done: "Added to the wishlist." },
		},
	}),
};
