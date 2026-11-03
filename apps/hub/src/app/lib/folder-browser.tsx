import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { useEffect } from "react";
import { orpc } from "./api.ts";

// The folders of the hub's disk, one level at a time: opening a folder lists it. The
// folder shown is `onListed`'s, which the sheet's submit takes as the choice.
export function FolderBrowser({
	path,
	onPath,
	onListed,
}: {
	path: string | undefined;
	onPath: (path: string) => void;
	onListed: (path: string) => void;
}) {
	const listing = orpc.fs.browse.read(path ? { path } : {});
	const shown = useRead(listing)?.path;
	useEffect(() => {
		if (shown) onListed(shown);
	}, [shown, onListed]);
	return (
		<Section
			title={listing.at((each) => ({ code: each.path }))}
			items={listing.at((each) => [
				...(each.parent === null
					? []
					: [
							{
								key: "..",
								leading: { icon: "CornerLeftUp" as const },
								title: "Parent folder",
								meta: [each.parent],
								onOpen: () => onPath(each.parent as string),
							},
						]),
				...each.dirs.map((dir) => ({
					key: dir.path,
					leading: { icon: "Folder" as const },
					title: dir.name,
					onOpen: () => onPath(dir.path),
				})),
			])}
			empty={{ sentence: "No folders in here." }}
		/>
	);
}
