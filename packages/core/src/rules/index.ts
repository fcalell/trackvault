import { applyRules, compileRules } from "./engine.ts";
import type { Rule, RuleContext, RulePreview, RuleTrack } from "./types.ts";

export { BUILTIN_RULES } from "./builtin.ts";
export {
	applyRules,
	type CompiledRules,
	compileRules,
	validateRules,
} from "./engine.ts";
export {
	collapseWhitespace,
	extractFeaturing,
	normalizeMixBrackets,
	normalizeSeparators,
	sentenceCase,
	stripJunk,
	stripTrackNumber,
	titleCase,
} from "./text.ts";
export * from "./types.ts";

export type PreviewInput = RuleTrack & { id: string | number };

// Streams the tracks that the rules would change, so a 50k library never
// holds more than the current track and the caller's own batch.
export function* previewRules(
	tracks: Iterable<PreviewInput>,
	rules: readonly Rule[],
	ctx?: RuleContext,
): Generator<RulePreview, void, undefined> {
	const compiled = compileRules(rules);
	for (const track of tracks) {
		const { patch, changes } = applyRules(track, compiled, ctx);
		if (changes.length > 0) yield { id: track.id, patch, changes };
	}
}

export async function* previewRulesAsync(
	tracks: AsyncIterable<PreviewInput> | Iterable<PreviewInput>,
	rules: readonly Rule[],
	ctx?: RuleContext,
): AsyncGenerator<RulePreview, void, undefined> {
	const compiled = compileRules(rules);
	for await (const track of tracks) {
		const { patch, changes } = applyRules(track, compiled, ctx);
		if (changes.length > 0) yield { id: track.id, patch, changes };
	}
}
