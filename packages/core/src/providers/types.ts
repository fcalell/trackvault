// What the auto-tagger knows about a track before asking anyone.
export interface TrackFacts {
	title: string | null;
	artist: string | null;
	album?: string | null;
	durationSec?: number | null;
	isrc?: string | null;
	label?: string | null;
	year?: number | null;
	bpm?: number | null;
	// Chromaprint, compressed (base64) form, as `fpcalc -json` prints it.
	fingerprint?: string | null;
	// Known MusicBrainz recording id (skips the search).
	mbid?: string | null;
}

export type CandidateField =
	| "title"
	| "artist"
	| "album"
	| "albumArtist"
	| "year"
	| "releaseDate"
	| "label"
	| "genre"
	| "subGenre"
	| "tags"
	| "isrc"
	| "bpm"
	| "key"
	| "catalogNumber"
	| "mixName"
	| "remixer"
	| "coverUrl"
	| "mbid"
	// MusicBrainz release id, for the Cover Art Archive.
	| "releaseMbid";

export type FieldValue = string | number | string[];

export interface FieldClaim {
	value: FieldValue;
	// 0..1: how sure the provider is of this field for the matched record
	// (already scaled by how well the record matches the track).
	confidence: number;
}

export interface Candidate {
	provider: ProviderName;
	// The provider's own id for the record.
	id: string;
	// Page a person can open to check the match.
	sourceUrl: string;
	// How well the record matches the track, 0..1.
	matchConfidence: number;
	fields: Partial<Record<CandidateField, FieldClaim>>;
}

export type ProviderName =
	| "musicbrainz"
	| "acoustid"
	| "discogs"
	| "deezer"
	| "beatport";

export interface LookupContext {
	signal?: AbortSignal;
}

export interface Provider {
	readonly name: ProviderName;
	lookup(facts: TrackFacts, context?: LookupContext): Promise<Candidate[]>;
}

// Where responses are remembered between lookups (the hub backs it with a table).
// Values are JSON-safe; `ttlMs` is a hint.
export interface ProviderCache {
	get(key: string): Promise<unknown | undefined> | unknown | undefined;
	set(key: string, value: unknown, ttlMs: number): Promise<void> | void;
}

export interface ProviderOptions {
	fetch?: typeof fetch;
	cache?: ProviderCache;
	// Replaces the provider's default limiter (tests, or a shared bucket).
	limiter?: TokenBucket;
	// Candidates returned at most. Default 3.
	limit?: number;
}

import type { TokenBucket } from "./http.ts";
