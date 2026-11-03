// Smart-playlist rules: JSON a UI can edit and the hub can store.

export type Compare = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

export type NumericField =
	| "bpm"
	| "rating"
	| "energy"
	| "year"
	| "playCount"
	| "durationSec"
	| "lufs";
export type TextField =
	| "genre"
	| "artist"
	| "title"
	| "album"
	| "label"
	| "remixer";
export type DateField = "addedAt" | "lastPlayedAt";

export type Condition =
	| { field: NumericField; op: Compare; value: number }
	| { field: NumericField; op: "between"; value: [number, number] }
	| { field: TextField; op: "eq" | "contains" | "startsWith"; value: string }
	| { field: TextField; op: "in" | "notIn"; value: string[] }
	// Camelot/Open Key/musical notation all parse; "compatibleWith" expands the
	// wheel (same, +-1, relative, and with includeBoosts the +2/+7 moves).
	| {
			field: "key";
			op: "compatibleWith";
			value: string;
			includeBoosts?: boolean;
	  }
	| { field: "key"; op: "in"; value: string[] }
	| { field: "tags"; op: "hasAny" | "hasAll" | "hasNone"; value: string[] }
	// Dates: `within` the last N days, `before` N days ago. A track never played
	// counts as "before" unless includeNever is false.
	| {
			field: DateField;
			op: "within" | "before";
			value: { days: number };
			includeNever?: boolean;
	  }
	| { field: "lastPlayedAt"; op: "never" };

export type Rule =
	| { all: Rule[] }
	| { any: Rule[] }
	| { not: Rule }
	| Condition;

export interface SmartPlaylist {
	rule: Rule;
	// Sort and limit are left to the hub's query; kept here so one JSON describes it.
	sort?: { field: string; dir: "asc" | "desc" };
	limit?: number;
}

// What the evaluator reads. Dates are epoch ms; keys any notation.
export interface SmartTrack {
	bpm?: number | null;
	rating?: number | null;
	energy?: number | null;
	year?: number | null;
	playCount?: number | null;
	durationSec?: number | null;
	lufs?: number | null;
	genre?: string | null;
	artist?: string | null;
	title?: string | null;
	album?: string | null;
	label?: string | null;
	remixer?: string | null;
	key?: string | null;
	tags?: readonly string[];
	addedAt?: number | null;
	lastPlayedAt?: number | null;
}

// How the hub's schema maps onto the fields. Values are SQL identifiers
// (`tracks.bpm` or `bpm`), validated, never quoted user input.
export interface SmartSchema {
	columns: Partial<Record<Exclude<keyof SmartTrack, "tags">, string>>;
	// Key column holds Camelot ("8A").
	// Date columns hold epoch ms unless dateUnit says seconds.
	dateUnit?: "ms" | "s";
	tags?: {
		// The tracks table's id column, e.g. "tracks.id".
		trackId: string;
		// The join table and its columns, e.g. track_tags / track_id / tag.
		table: string;
		trackColumn: string;
		tagColumn: string;
	};
}

export interface CompiledRule {
	sql: string;
	params: Array<string | number>;
}
