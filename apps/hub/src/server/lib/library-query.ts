import { paginateWindow } from "@fcalell/plugin-api/lib/window";
import { type Selector, z } from "@fcalell/plugin-api/schema";
import {
	and,
	between,
	bm25,
	count,
	desc,
	eq,
	ftsQuery,
	gte,
	lte,
	notInArray,
	type SQL,
	type SQLiteColumn,
	sql,
} from "@fcalell/plugin-db/orm";
import { ISSUE } from "@trackvault/core/issues";
import { tags, trackSearch, tracks, trackTags } from "../../schema/index.ts";
import {
	ISSUE_FILTERS,
	type IssueFilter,
	type ListRow,
	SORT_COLUMNS,
	type SortColumn,
} from "../../shared/library.ts";
import type { db as database } from "./db.ts";

type Db = ReturnType<typeof database>;

// What the library is asked for: the one shape the list, the selection of a bulk
// act and the facets agree on. Every facet is one value, so a filter is an
// equality prefix of a composite index (schema: `tracks_*_idx`).
export const libraryQuery = z.object({
	// What was typed in the search box: full-text over the tags.
	q: z.string().optional(),
	genre: z.string().optional(),
	artist: z.string().optional(),
	key: z.string().optional(),
	format: z.string().optional(),
	bpmMin: z.number().optional(),
	bpmMax: z.number().optional(),
	issue: z.enum(ISSUE_FILTERS).optional(),
	// A custom tag's id: the tracks that carry it.
	tag: z.number().int().optional(),
	// Energy 1 to 10 (tag or analysis).
	energy: z.number().int().optional(),
	// Tracks no play was ever recorded for.
	neverPlayed: z.boolean().optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuery>;

// Text sorts are case-insensitive, to match the indexes (`collate nocase`).
const nocase = (column: SQLiteColumn) => sql`${column} collate nocase`;

export const ORDER: Record<SortColumn, SQL> = {
	title: nocase(tracks.title),
	artist: nocase(tracks.artist),
	genre: nocase(tracks.genre),
	bpm: sql`${tracks.bpm}`,
	key: sql`${tracks.key}`,
	rating: sql`${tracks.rating}`,
	durationMs: sql`${tracks.durationMs}`,
	bitrate: sql`${tracks.bitrate}`,
	addedAt: sql`${tracks.addedAt}`,
	energy: sql`${tracks.energy}`,
	loudness: sql`${tracks.loudness}`,
};

// What a window draws; the full record loads on open.
export const LIST_COLUMNS = {
	id: tracks.id,
	title: tracks.title,
	artist: tracks.artist,
	mixName: tracks.mixName,
	bpm: tracks.bpm,
	key: tracks.key,
	genre: tracks.genre,
	rating: tracks.rating,
	durationMs: tracks.durationMs,
	format: tracks.format,
	bitrate: tracks.bitrate,
	addedAt: tracks.addedAt,
	issues: tracks.issues,
};

// Under this many characters a search finds too much to rank: it waits for more.
const MIN_SEARCH = 2;

const searchOf = (q: string | undefined): string | null =>
	q && q.trim().length >= MIN_SEARCH ? ftsQuery(q.trim()) : null;

// The facet and issue filters, apart from the text search. Each is a condition a
// composite index answers (equality, then the order).
export function filtersOf(query: LibraryQuery): SQL | undefined {
	const conditions: SQL[] = [];
	if (query.genre !== undefined)
		conditions.push(sql`${tracks.genre} = ${query.genre} collate nocase`);
	if (query.artist !== undefined)
		conditions.push(sql`${tracks.artist} = ${query.artist} collate nocase`);
	if (query.key !== undefined) conditions.push(eq(tracks.key, query.key));
	if (query.format !== undefined)
		conditions.push(eq(tracks.format, query.format));
	if (query.bpmMin !== undefined && query.bpmMax !== undefined)
		conditions.push(between(tracks.bpm, query.bpmMin, query.bpmMax));
	else if (query.bpmMin !== undefined)
		conditions.push(gte(tracks.bpm, query.bpmMin));
	else if (query.bpmMax !== undefined)
		conditions.push(lte(tracks.bpm, query.bpmMax));
	if (query.energy !== undefined)
		conditions.push(eq(tracks.energy, query.energy));
	if (query.neverPlayed) conditions.push(sql`${tracks.playCount} = 0`);
	if (query.issue !== undefined) {
		// Written as the partial indexes write it, so they answer it.
		conditions.push(sql.raw(issueSql(query.issue)));
	}
	if (query.tag !== undefined)
		conditions.push(
			sql`${tracks.id} IN (SELECT ${trackTags.trackId} FROM ${trackTags} WHERE ${trackTags.tagId} = ${query.tag})`,
		);
	// Quarantined tracks are out of the library until they are restored. Only when
	// some exist: the partial index answers that, and the condition costs nothing
	// while there are none.
	if (hidden > 0)
		conditions.push(sql.raw(`("tracks"."issues" & ${QUARANTINED}) = 0`));
	return and(...conditions);
}

const QUARANTINED = ISSUE.quarantined;

// How many tracks are quarantined, as of the last query prepared (by library
// version): the library list leaves them out only while there are some.
let hidden = 0;
let hiddenAt = -1;

export function refreshHidden(database: Db, version: number): void {
	if (hiddenAt === version) return;
	hidden =
		database
			.select({ n: count() })
			.from(tracks)
			.where(sql.raw(`("tracks"."issues" & ${QUARANTINED}) != 0`))
			.get()?.n ?? 0;
	hiddenAt = version;
}

export const issueSql = (issue: IssueFilter): string =>
	`("tracks"."issues" & ${ISSUE[issue]}) != 0`;

// The tracks the text search finds, as a condition on the table itself: what a
// selection takes (no ranking needed), and an explicit sort filters through.
function searchIn(fts: string): SQL {
	return sql`${tracks.seq} IN (SELECT rowid FROM ${trackSearch} WHERE ${trackSearch} MATCH ${fts})`;
}

// The one `where` of the library: the list's rows, its total and every bulk act's
// selection are the same tracks.
export function libraryWhere(query: LibraryQuery): SQL | undefined {
	const fts = searchOf(query.q);
	return and(filtersOf(query), fts ? searchIn(fts) : undefined);
}

export { SORT_COLUMNS };

export interface SortInput {
	column: SortColumn;
	direction: "asc" | "desc";
}

export interface ListInput extends LibraryQuery {
	sort?: SortInput | undefined;
	offset?: number | undefined;
	limit: number;
}

// The pages of an unfiltered library count the same until a write: the total is
// cached by the library version.
let cachedTotal: { version: number; total: number } | undefined;

function totalOf(
	database: Db,
	where: SQL | undefined,
	version: number,
	unfiltered: boolean,
): number {
	if (unfiltered && cachedTotal?.version === version) return cachedTotal.total;
	const total =
		database.select({ n: count() }).from(tracks).where(where).get()?.n ?? 0;
	if (unfiltered) cachedTotal = { version, total };
	return total;
}

// A format that every track has filters nothing, and as an index lookup it would
// read the whole library: the filter is dropped. (Once the library holds a second
// format, the majority one is the only one dropped.)
export function prepareQuery<T extends LibraryQuery>(
	database: Db,
	query: T,
	version: number,
): T {
	refreshHidden(database, version);
	if (query.format === undefined) return query;
	const everyone = facetsOf(database, version).formats.find(
		(each) => each.value === query.format,
	);
	const total = facetsOf(database, version).total;
	if (everyone && everyone.count === total) {
		const { format: _format, ...rest } = query;
		return rest as T;
	}
	return query;
}

// What a window draws is the list columns: every other column of a track is left out
// of the page's rows (the full record loads on open).
export const OTHER_COLUMNS = {
	seq: false,
	audioHash: false,
	fingerprint: false,
	artists: false,
	remixer: false,
	album: false,
	albumArtist: false,
	label: false,
	genreId: false,
	year: false,
	releaseDate: false,
	isrc: false,
	colour: false,
	comment: false,
	playCount: false,
	lastPlayedAt: false,
	sampleRate: false,
	size: false,
	blockKey: false,
	updatedAt: false,
	version: false,
} as const;

const RANK = {
	title: 10,
	artist: 6,
	remixer: 3,
	mixName: 2,
	album: 2,
	label: 1,
	genre: 1,
} as const;

// One window of the library: `limit` rows from `offset` in the order asked, and the
// total the filter matches (stack's `paginateWindow`: the ids are ordered and paged
// alone, then the rows are read by id). A search with no sort ranks by relevance
// (bm25) over a join of the full-text index; every other order is an index range
// scan (schema), the id the last tiebreak.
export async function listPage(
	database: Db,
	given: ListInput,
	version: number,
): Promise<{
	data: ListRow[];
	total: number;
	offset: number;
}> {
	const input = prepareQuery(database, given, version);
	const fts = searchOf(input.q);
	const filters = filtersOf(input);
	const matches = fts ? sql`${trackSearch} MATCH ${fts}` : undefined;
	const dflt = fts
		? { column: bm25(trackSearch, RANK), direction: "asc" as const }
		: { column: ORDER.title, direction: "asc" as const };
	const page = await paginateWindow(database.query.tracks, {
		where: and(matches, filters),
		orderBy: dflt,
		sorts: ORDER,
		sort: input.sort,
		join: fts
			? (query) =>
					query.innerJoin(trackSearch, eq(trackSearch.rowid, tracks.seq))
			: undefined,
		idColumn: tracks.id,
		columns: OTHER_COLUMNS,
		offset: input.offset,
		limit: input.limit,
		db: database,
	});
	return page as { data: ListRow[]; total: number; offset: number };
}

// Counts for the sidebar's facet pickers, one pass over a covering index each.
export interface Facets {
	genres: Array<{ value: string; count: number }>;
	keys: Array<{ value: string; count: number }>;
	formats: Array<{ value: string; count: number }>;
	energies: Array<{ value: number; count: number }>;
	issues: Array<{ value: IssueFilter; count: number }>;
	tags: Array<{ id: number; name: string; count: number }>;
	total: number;
}

let cachedFacets: { version: number; facets: Facets } | undefined;

export function facetsOf(database: Db, version: number): Facets {
	if (cachedFacets?.version === version) return cachedFacets.facets;
	const group = (column: "genre" | "key" | "format") => {
		const expression =
			column === "genre"
				? sql`${tracks.genre} collate nocase`
				: sql`${tracks[column]}`;
		return database
			.select({
				value: sql<string>`min(${tracks[column]})`,
				count: count(),
			})
			.from(tracks)
			.where(
				sql`${tracks[column]} IS NOT NULL AND (${tracks.issues} & ${QUARANTINED}) = 0`,
			)
			.groupBy(expression)
			.orderBy(desc(count()))
			.limit(1000)
			.all();
	};
	const sums = database
		.select(
			Object.fromEntries(
				ISSUE_FILTERS.map((name) => [
					name,
					sql<number>`coalesce(sum(CASE WHEN (${tracks.issues} & ${ISSUE[name]}) != 0 THEN 1 ELSE 0 END), 0)`,
				]),
			) as Record<IssueFilter, SQL<number>>,
		)
		.from(tracks)
		.where(sql`(${tracks.issues} & ${QUARANTINED}) = 0`)
		.get();
	refreshHidden(database, version);
	const facets: Facets = {
		genres: group("genre"),
		keys: group("key"),
		formats: group("format"),
		energies: database
			.select({ value: sql<number>`${tracks.energy}`, count: count() })
			.from(tracks)
			.where(
				sql`${tracks.energy} IS NOT NULL AND (${tracks.issues} & ${QUARANTINED}) = 0`,
			)
			.groupBy(tracks.energy)
			.orderBy(tracks.energy)
			.all(),
		issues: ISSUE_FILTERS.map((value) => ({
			value,
			count: sums?.[value] ?? 0,
		})).filter((issue) => issue.count > 0),
		tags: database
			.select({ id: tags.id, name: tags.name, count: count(trackTags.trackId) })
			.from(tags)
			.leftJoin(trackTags, eq(trackTags.tagId, tags.id))
			.groupBy(tags.id)
			.orderBy(sql`${tags.name} collate nocase`)
			.all(),
		total: totalOf(database, undefined, version, true) - hidden,
	};
	cachedFacets = { version, facets };
	return facets;
}

// The ids a bulk act names: a list of them, or every track the library query
// matches less the excepted ones (select-all over 50k is this one statement).
export function selectedTrackIds(
	database: Db,
	selection: Selector<LibraryQuery>,
	version: number,
): string[] {
	if ("ids" in selection) return selection.ids;
	const matching = libraryWhere(
		prepareQuery(database, selection.query, version),
	);
	const rows = database
		.select({ id: tracks.id })
		.from(tracks)
		.where(
			and(
				matching,
				selection.except.length > 0
					? notInArray(tracks.id, selection.except)
					: undefined,
			),
		)
		.all();
	return rows.map((row) => row.id);
}
