const ORIGINS: Record<string, string> = {
	ui: "You",
	rule: "Rules",
	autotag: "Auto-tag",
	rekordbox: "Rekordbox",
	agent: "Agent",
	scan: "Scan",
	analysis: "Analysis",
	mcp: "Claude",
};

// What made a batch, in words; a Rekordbox install's origin carries its id.
export const originLabel = (origin: string): string =>
	ORIGINS[origin.split(":")[0] ?? origin] ?? origin;

// The origins a history filter picks by: a prefix of the origin, so every install is Rekordbox.
export const ORIGIN_OPTIONS = Object.entries(ORIGINS).map(([value, label]) => ({
	value,
	label,
}));
