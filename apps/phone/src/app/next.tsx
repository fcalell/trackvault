import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { Toolbar } from "@fcalell/plugin-native-ui/components/toolbar";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { orpc } from "../lib/api";

type Direction = "up" | "flat" | "down";

// The set builder, for the booth: the tracks that mix well after the one playing.
// Without a track named it follows the hub's draft set (its last track); a search
// names the track you are on, and "Add to set" extends the draft and moves on.
export default function Next() {
	const { from } = useLocalSearchParams<{ from?: string }>();
	const [q, setQ] = useState("");
	const [direction, setDirection] = useState<Direction>("flat");
	const found = orpc.sets.find.read({ q });
	const suggestions = orpc.sets.suggest.read({ from, direction, limit: 20 });
	const append = useMutation(orpc.sets.append.mutationOptions());
	return (
		<Pane title="Next track" back={false}>
			<Toolbar
				search={{
					value: q,
					onChange: setQ,
					placeholder: "The track you are on",
				}}
				filters={[
					{
						label: "Energy",
						options: [
							{ value: "up", label: "Up" },
							{ value: "flat", label: "Hold" },
							{ value: "down", label: "Down" },
						],
						value: direction,
						onChange: (value) =>
							setDirection((value as Direction | null) ?? "flat"),
					},
				]}
			/>
			{q.trim().length >= 2 ? (
				<Section
					title="Playing now"
					items={found.at((rows) =>
						rows.map((t) => ({
							key: t.id,
							title: t.title ?? "Untitled",
							facts: [
								t.artist ?? "Unknown artist",
								...(t.bpm ? [`${Math.round(t.bpm)} BPM`] : []),
								...(t.key ? [t.key] : []),
							],
							onOpen: () => {
								setQ("");
								router.setParams({ from: t.id });
							},
						})),
					)}
					empty={{ sentence: "No track matches." }}
				/>
			) : null}
			<Section
				title="Plays well after"
				items={suggestions.at((rows) =>
					rows.map((t) => ({
						key: t.id,
						title: t.title ?? "Untitled",
						facts: [
							t.artist ?? "Unknown artist",
							...(t.bpm ? [`${Math.round(t.bpm)} BPM`] : []),
							...(t.key ? [t.key] : []),
							...(t.energy ? [`Energy ${t.energy}`] : []),
						],
						line: t.why,
						trailing: { value: `${t.score}%` },
						href: `/track/${t.id}` as const,
						act: {
							icon: "Plus" as const,
							label: "Add to set",
							done: "Added to the set.",
							onAct: () => append.mutateAsync({ trackIds: [t.id] }),
						},
					})),
				)}
				empty={{
					sentence: "Name the track you are on, or start a set in the hub.",
				}}
			/>
		</Pane>
	);
}
