// An MCP client's authorization sends the member to the app's pages with a signed
// query (`sig` and the parameters it names). The procedures that resume it take that
// query whole and answer `{ redirect: true, url }` for the page to leave to.

export function oauthQuery(): string | undefined {
	if (typeof window === "undefined") return undefined;
	const search = window.location.search.slice(1);
	return search.includes("sig=") ? search : undefined;
}

export function followRedirect(answer: unknown): void {
	if (
		answer &&
		typeof answer === "object" &&
		"redirect" in answer &&
		(answer as { redirect?: unknown }).redirect === true
	) {
		const url = (answer as unknown as { url?: unknown }).url;
		if (typeof url === "string") window.location.assign(url);
	}
}
