// Starting templates of the organiser (core/organize syntax: {token}, {token|fallback},
// [optional text with {token}], "/" between folders).
export const ORGANISER_PRESETS = [
	{
		label: "Genre / Artist - Title",
		template: "{genre|Unknown}/{artist|Unknown} - {title}",
	},
	{
		label: "Artist / Title (Mix)",
		template: "{artist|Unknown}/{title}[ ({mix})]",
	},
	{
		label: "Artist / Album / Track",
		template: "{artist|Unknown}/{album|Singles}/{artist|Unknown} - {title}",
	},
	{
		label: "Label / Artist - Title",
		template: "{label|Unreleased}/{artist|Unknown} - {title}",
	},
	{
		label: "Key and BPM first",
		template: "{genre|Unknown}/{key|--} {bpm|--} - {artist|Unknown} - {title}",
	},
] as const;
