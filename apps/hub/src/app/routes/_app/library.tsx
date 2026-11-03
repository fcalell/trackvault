import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ISSUE_FILTERS, type IssueFilter } from "../../../shared/library.ts";
import { LibraryPane } from "../../lib/library.tsx";

// Filters a link can open the library with: an issue (from Issues), a tag
// (from Tags) or a genre.
interface Filters {
	issue?: IssueFilter | undefined;
	tag?: number | undefined;
	genre?: string | undefined;
	neverPlayed?: boolean | undefined;
}

export const Route = createFileRoute("/_app/library")({
	validateSearch: (search: Record<string, unknown>): Filters => ({
		issue: (ISSUE_FILTERS as readonly unknown[]).includes(search.issue)
			? (search.issue as IssueFilter)
			: undefined,
		tag:
			Number.isFinite(Number(search.tag)) && search.tag !== undefined
				? Number(search.tag)
				: undefined,
		genre: typeof search.genre === "string" ? search.genre : undefined,
		neverPlayed:
			search.neverPlayed === true || search.neverPlayed === "true"
				? true
				: undefined,
	}),
	component: Library,
});

// Every track, searched, filtered and sorted on the hub; a record opens beside it.
function Library() {
	const search = Route.useSearch();
	return (
		<LibraryPane
			key={`${search.issue}|${search.tag}|${search.genre}|${search.neverPlayed}`}
			title="All tracks"
			initial={search}
		>
			<Outlet />
		</LibraryPane>
	);
}
