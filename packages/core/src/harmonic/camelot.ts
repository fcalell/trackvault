// Key notation: Camelot ("8A"), Open Key ("1m"), musical ("Am"), and the
// wheel math DJs mix by. Pitch classes: 0 = C ... 11 = B.

export type Mode = "major" | "minor";

export interface MusicalKey {
	// Pitch class of the tonic, 0 = C.
	tonic: number;
	mode: Mode;
}

export interface Camelot {
	// 1..12
	number: number;
	letter: "A" | "B";
}

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NAME_TO_PC: Record<string, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11,
};

const wrap12 = (n: number): number => ((n % 12) + 12) % 12;

export function toCamelot(key: MusicalKey): Camelot {
	// Walking up a fifth moves one step clockwise; C major is 8B and A minor 8A.
	const major = key.mode === "major" ? key.tonic : wrap12(key.tonic + 3);
	return {
		number: ((wrap12(major * 7) + 7) % 12) + 1,
		letter: key.mode === "major" ? "B" : "A",
	};
}

export function fromCamelot(c: Camelot): MusicalKey {
	// Inverse of the fifth walk: 7 is its own inverse mod 12.
	const major = wrap12((c.number - 8) * 7);
	return c.letter === "B"
		? { tonic: major, mode: "major" }
		: { tonic: wrap12(major + 9), mode: "minor" };
}

export const camelotString = (c: Camelot): string => `${c.number}${c.letter}`;

export function toOpenKey(c: Camelot): string {
	// Open Key 1d is C major, which Camelot calls 8B.
	return `${wrap12(c.number - 8) + 1}${c.letter === "B" ? "d" : "m"}`;
}

export function musicalName(key: MusicalKey, flats = false): string {
	return `${(flats ? FLAT : SHARP)[key.tonic]}${key.mode === "minor" ? "m" : ""}`;
}

// Accepts "8A", "08a", "Am", "A minor", "F# major", "Dbm", Open Key "1m"/"1d".
export function parseKey(text: string | null | undefined): MusicalKey | null {
	if (!text) return null;
	const t = text.trim();
	let m = /^0?(1[0-2]|[1-9])\s*([ABab])$/.exec(t);
	if (m)
		return fromCamelot({
			number: Number(m[1]),
			letter: (m[2] as string).toUpperCase() as "A" | "B",
		});
	m = /^0?(1[0-2]|[1-9])\s*([dm])$/.exec(t);
	if (m) {
		const camelot = {
			number: ((Number(m[1]) + 6) % 12) + 1,
			letter: m[2] === "d" ? "B" : "A",
		} as Camelot;
		return fromCamelot(camelot);
	}
	m = /^([A-Ga-g])([#♯b♭]?)\s*(m|min|minor|maj|major)?$/i.exec(t);
	if (!m) return null;
	let pc = NAME_TO_PC[(m[1] as string).toUpperCase()] as number;
	if (m[2] === "#" || m[2] === "♯") pc++;
	else if (m[2] === "b" || m[2] === "♭") pc--;
	const suffix = m[3] ?? "";
	// A bare "m" is minor, a bare "M" major; words are case-insensitive.
	const minor = suffix === "m" || /^min/i.test(suffix);
	return { tonic: wrap12(pc), mode: minor ? "minor" : "major" };
}

export function parseCamelot(text: string | null | undefined): Camelot | null {
	const key = parseKey(text);
	return key ? toCamelot(key) : null;
}

export type KeyRelation =
	| "same"
	| "adjacent" // +-1 on the wheel
	| "relative" // same number, other letter
	| "energy-boost" // +2
	| "energy-drop" // -2
	| "dominant-boost" // +7 (a semitone lift)
	| "diagonal" // +-1 and other letter
	| "clash";

export interface KeyMatch {
	relation: KeyRelation;
	// 0..1, how smooth the mix is.
	score: number;
	// Signed steps clockwise (-6..6) and whether the letter changed.
	steps: number;
	letterChanged: boolean;
}

const RELATION_SCORE: Record<KeyRelation, number> = {
	same: 1,
	adjacent: 0.92,
	relative: 0.9,
	diagonal: 0.7,
	"energy-boost": 0.65,
	"dominant-boost": 0.6,
	"energy-drop": 0.5,
	clash: 0,
};

export function keyRelation(a: Camelot, b: Camelot): KeyMatch {
	let steps = (b.number - a.number + 12) % 12;
	if (steps > 6) steps -= 12;
	const letterChanged = a.letter !== b.letter;
	let relation: KeyRelation = "clash";
	if (!letterChanged) {
		if (steps === 0) relation = "same";
		else if (Math.abs(steps) === 1) relation = "adjacent";
		else if (steps === 2) relation = "energy-boost";
		else if (steps === -2) relation = "energy-drop";
		// +7 on the wheel is one semitone up (5 steps back is the same pitch move).
		else if (steps === -5 || steps === 7) relation = "dominant-boost";
	} else if (steps === 0) relation = "relative";
	else if (Math.abs(steps) === 1) relation = "diagonal";
	return { relation, score: RELATION_SCORE[relation], steps, letterChanged };
}

// Every key that mixes without a clash from `from`, best first.
export function compatibleKeys(
	from: Camelot,
	options: { includeBoosts?: boolean } = {},
): Array<{ key: Camelot; relation: KeyRelation; score: number }> {
	const out: Array<{ key: Camelot; relation: KeyRelation; score: number }> = [];
	for (const letter of ["A", "B"] as const) {
		for (let n = 1; n <= 12; n++) {
			const key = { number: n, letter };
			const { relation, score } = keyRelation(from, key);
			if (relation === "clash") continue;
			if (
				!options.includeBoosts &&
				(relation === "energy-boost" ||
					relation === "energy-drop" ||
					relation === "dominant-boost" ||
					relation === "diagonal")
			)
				continue;
			out.push({ key, relation, score });
		}
	}
	return out.sort((x, y) => y.score - x.score);
}
