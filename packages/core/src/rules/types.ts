import type { Taxonomy } from "../taxonomy/index.ts";

export const RULE_TEXT_FIELDS = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"label",
	"remixer",
	"comment",
	"featured",
] as const;
export const RULE_NUMBER_FIELDS = ["year", "bpm", "rating", "energy"] as const;
export const RULE_FIELDS = [
	...RULE_TEXT_FIELDS,
	...RULE_NUMBER_FIELDS,
	"key",
	"isrc",
] as const;

export type TextField = (typeof RULE_TEXT_FIELDS)[number];
export type RuleField = (typeof RULE_FIELDS)[number];
export type FieldValue = string | number | null;

// The fields a rule reads and writes: the tags plus `featured` (the credits
// moved out of a title when no place for them in the artist is wanted).
export type RuleTrack = { [K in RuleField]?: FieldValue };
export type RulePatch = { [K in RuleField]?: FieldValue };

export type Condition =
	| { all: Condition[] }
	| { any: Condition[] }
	| { not: Condition }
	| { field: RuleField; op: "empty" | "notEmpty" }
	| {
			field: RuleField;
			op: "eq" | "neq" | "contains" | "startsWith" | "endsWith";
			value: string | number;
			ignoreCase?: boolean;
	  }
	| {
			field: RuleField;
			op: "in";
			value: Array<string | number>;
			ignoreCase?: boolean;
	  }
	| { field: RuleField; op: "matches"; value: string; flags?: string }
	| { field: RuleField; op: "gt" | "gte" | "lt" | "lte"; value: number };

interface FieldsAction {
	// Defaults to every text field.
	fields?: TextField[];
}

export type Action =
	| ({ do: "whitespace" } & FieldsAction)
	| ({
			do: "case";
			mode: "title" | "lower" | "upper" | "sentence";
	  } & FieldsAction)
	| ({ do: "stripJunk" } & FieldsAction)
	| { do: "moveFeaturing"; to: "artist" | "featured" }
	| { do: "splitArtistTitle" }
	| { do: "normalizeSeparators"; fields?: TextField[]; joiner?: string }
	| { do: "normalizeMixBrackets" }
	| { do: "stripTrackNumber" }
	| {
			do: "set";
			field: RuleField;
			value: FieldValue;
			onlyIfEmpty?: boolean;
	  }
	| ({
			do: "replace";
			pattern: string;
			with: string;
			flags?: string;
			literal?: boolean;
	  } & FieldsAction)
	| ({
			do: "map";
			table: Record<string, string>;
	  } & FieldsAction)
	| {
			do: "alias";
			field: TextField;
			table: "genre" | "artist" | "label";
			fuzzy?: boolean;
			threshold?: number;
	  };

// Plain JSON: stored in the `rules` table and edited in the UI.
export interface Rule {
	id: string;
	name: string;
	enabled?: boolean;
	when?: Condition;
	actions: Action[];
}

export interface RuleContext {
	taxonomies?: { genre?: Taxonomy; artist?: Taxonomy; label?: Taxonomy };
}

export interface FieldChange {
	field: RuleField;
	before: FieldValue;
	after: FieldValue;
	// Rules that touched the field, in order.
	ruleIds: string[];
}

export interface RuleResult {
	patch: RulePatch;
	changes: FieldChange[];
	// Rules whose condition held (whether or not they changed anything).
	matched: string[];
}

export interface RulePreview {
	id: string | number;
	patch: RulePatch;
	changes: FieldChange[];
}
