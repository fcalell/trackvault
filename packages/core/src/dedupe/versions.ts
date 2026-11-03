import { fold, mixKey } from "../normalize/index.ts";
import type { MixKind } from "./types.ts";

export interface MixClass {
	kind: MixKind;
	remixer: string | null;
	// Equal keys are the same version of a song.
	key: string;
}

const HAS = (re: RegExp) => (s: string) => re.test(s);
const RULES: Array<[MixKind, (s: string) => boolean]> = [
	["acapella", HAS(/\b(?:acapella|a cappella|acappella|vocal only)\b/)],
	["instrumental", HAS(/\binstrumental\b/)],
	["live", HAS(/\blive\b/)],
	["dub", HAS(/\bdub\b/)],
	["vip", HAS(/\bvip\b/)],
	["bootleg", HAS(/\b(?:bootleg|mashup|mash up)\b/)],
	["remix", HAS(/\b(?:remix|rework|flip|refix|re edit|redrum|remixed)\b/)],
	["extended", HAS(/\b(?:extended|long|full length)\b/)],
	["radio", HAS(/\b(?:radio|short|single|clean)\b/)],
	["club", HAS(/\bclub\b/)],
	["remaster", HAS(/\bremaster(?:ed)?\b/)],
];
const STRIP_WORDS =
	/\b(?:remix|remixed|rework|flip|vip|mix|dub|bootleg|edit|version|refix|the|s)\b/g;

// Reads a mix name ("Extended Mix", "Radio Edit", "Joris Voorn Remix") into a
// kind and a comparable key. No mix name, "Original Mix" and "Original
// Version" are all the original.
export function classifyMix(
	mixName: string | null | undefined,
	remixer?: string | null,
): MixClass {
	if (mixKey(mixName) === "")
		return { kind: "original", remixer: null, key: "original" };
	const text = fold(mixName);
	let kind: MixKind = "other";
	for (const [k, test] of RULES) {
		if (test(text)) {
			kind = k;
			break;
		}
	}
	if (kind === "other" && /\boriginal\b/.test(text)) kind = "original";
	let who = remixer ? fold(remixer) : "";
	if (
		(kind === "remix" ||
			kind === "dub" ||
			kind === "vip" ||
			kind === "bootleg") &&
		who === ""
	) {
		who = text.replace(STRIP_WORDS, " ").replace(/\s+/g, " ").trim();
	}
	const carriesWho =
		kind === "remix" || kind === "bootleg" || kind === "dub" || kind === "vip";
	const key =
		kind === "other" ? `other:${text}` : carriesWho ? `${kind}:${who}` : kind;
	return { kind, remixer: who === "" ? null : who, key };
}
