export const FILE_ORGANIZER_PRESETS = [
	{ label: "Artist / Album / Title", pattern: "{artist}/{album}/{title}" },
	{ label: "Genre / Artist / Title", pattern: "{genre}/{artist}/{title}" },
	{ label: "Artist / Title", pattern: "{artist}/{title}" },
] as const;

export type FileOrganizerPreset = (typeof FILE_ORGANIZER_PRESETS)[number];
