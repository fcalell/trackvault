import { type Selector, z } from "@fcalell/plugin-api/schema";
import {
	and,
	asc,
	between,
	bm25,
	count,
	desc,
	eq,
	ftsQuery,
	gte,
	inArray,
	lte,
	notInArray,
	type SQL,
	type SQLiteColumn,
	sql,
} from "@fcalell/plugin-db/orm";
import { ISSUE } from "@trackvault/core/issues";
import { trackSearch, tracks } from "../../schema/index.ts";
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
	// The view's own order when the caller sorts nothing: newest first.
	recent: z.boolean().optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuery>;

// Text sorts are case-insensitive, to match the indexes (`collate nocase`).
const nocase = (column: SQLiteColumn) => sql`${column} collate nocase`;

const ORDER: Record<SortColumn, SQL> = {
	title: nocase(tracks.title),
	artist: nocase(tracks.artist),
	genre: nocase(tracks.genre),
	bpm: sql`${tracks.bpm}`,
	key: sql`${tracks.key}`,
	rating: sql`${tracks.rating}`,
	durationMs: sql`${tracks.durationMs}`,
	bitrate: sql`${tracks.bitrate}`,
	addedAt: sql`${tracks.addedAt}`,
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
	if (query.issue !== undefined) {
		// Written as the partial indexes write it, so they answer it.
		conditions.push(sql.raw(issueSql(query.issue)));
	}
	return and(...conditions);
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

// The rows of `ids`, in that order.
function rowsInOrder(database: Db, ids: string[]): ListRow[] {
	if (ids.length === 0) return [];
	const byId = new Map<string, ListRow>();
	for (const row of database
		.select(LIST_COLUMNS)
		.from(tracks)
		.where(inArray(tracks.id, ids))
		.all())
		byId.set(row.id, row);
	return ids.flatMap((id) => {
		const row = byId.get(id);
		return row ? [row] : [];
	});
}

// The rows of the tracks numbered `seqs`, in that order.
function rowsBySeq(database: Db, seqs: number[]): ListRow[] {
	if (seqs.length === 0) return [];
	const bySeq = new Map<number, ListRow>();
	for (const row of database
		.select({ ...LIST_COLUMNS, seq: tracks.seq })
		.from(tracks)
		.where(inArray(tracks.seq, seqs))
		.all()) {
		const { seq, ...rest } = row;
		bySeq.set(seq, rest);
	}
	return seqs.flatMap((seq) => {
		const row = bySeq.get(seq);
		return row ? [row] : [];
	});
}

// One window of the library: `limit` rows from `offset` in the order asked, and
// the total the filter matches. A search with no sort ranks by relevance (bm25);
// every other order is an index range scan (schema), the id the last tiebreak.
export function listPage(
	database: Db,
	given: ListInput,
	version: number,
): {
	data: ListRow[];
	total: number;
	offset: number;
} {
	const input = prepareQuery(database, given, version);
	const offset = Math.max(0, Math.trunc(input.offset ?? 0));
	const fts = searchOf(input.q);
	const filters = filtersOf(input);

	if (fts && !input.sort) {
		const rank = bm25(trackSearch, {
			title: 10,
			artist: 6,
			remixer: 3,
			mixName: 2,
			album: 2,
			label: 1,
			genre: 1,
		});
		const matches = sql`${trackSearch} MATCH ${fts}`;
		// The order is decided on the ids alone, then the page's rows are read.
		const data = filters
			? rowsInOrder(
					database,
					database
						.select({ id: tracks.id })
						.from(trackSearch)
						.innerJoin(tracks, eq(tracks.seq, trackSearch.rowid))
						.where(and(matches, filters))
						.orderBy(rank, asc(trackSearch.rowid))
						.limit(input.limit)
						.offset(offset)
						.all()
						.map((row) => row.id),
				)
			: rowsBySeq(
					database,
					database
						.select({ seq: trackSearch.rowid })
						.from(trackSearch)
						.where(matches)
						.orderBy(rank, asc(trackSearch.rowid))
						.limit(input.limit)
						.offset(offset)
						.all()
						.map((row) => row.seq),
				);
		const where = and(matches, filters);
		// With no other filter the matches count in the index alone, no join.
		const total =
			(filters
				? database
						.select({ n: count() })
						.from(trackSearch)
						.innerJoin(tracks, eq(tracks.seq, trackSearch.rowid))
						.where(where)
						.get()
				: database
						.select({ n: count() })
						.from(trackSearch)
						.where(sql`${trackSearch} MATCH ${fts}`)
						.get()
			)?.n ?? 0;
		return { data, total, offset };
	}

	const where = and(filters, fts ? searchIn(fts) : undefined);
	const by = (expression: SQL, way: "asc" | "desc") =>
		way === "desc" ? desc(expression) : asc(expression);
	const first = input.sort
		? { expression: ORDER[input.sort.column], way: input.sort.direction }
		: input.recent
			? { expression: ORDER.addedAt, way: "desc" as const }
			: { expression: ORDER.title, way: "asc" as const };
	// The order is decided on the ids alone (a sorter that holds a key and an id,
	// not thirteen columns), then the page's rows are read by id.
	const ids = database
		.select({ id: tracks.id })
		.from(tracks)
		.where(where)
		.orderBy(by(first.expression, first.way), by(sql`${tracks.id}`, first.way))
		.limit(input.limit)
		.offset(offset)
		.all()
		.map((row) => row.id);
	const data = rowsInOrder(database, ids);
	return {
		data,
		total: totalOf(database, where, version, where === undefined),
		offset,
	};
}

// Counts for the sidebar's facet pickers, one pass over a covering index each.
export interface Facets {
	genres: Array<{ value: string; count: number }>;
	keys: Array<{ value: string; count: number }>;
	formats: Array<{ value: string; count: number }>;
	issues: Array<{ value: IssueFilter; count: number }>;
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
			.where(sql`${tracks[column]} IS NOT NULL`)
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
		.get();
	const facets: Facets = {
		genres: group("genre"),
		keys: group("key"),
		formats: group("format"),
		issues: ISSUE_FILTERS.map((value) => ({
			value,
			count: sums?.[value] ?? 0,
		})).filter((issue) => issue.count > 0),
		total: totalOf(database, undefined, version, true),
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
