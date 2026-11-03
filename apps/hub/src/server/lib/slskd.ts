import {
	createSlskdClient,
	type SlskdClient,
	SlskdError,
} from "@trackvault/core/slskd";
import { readSettings } from "./settings.ts";

export class NotConfigured extends Error {
	constructor() {
		super(
			"Soulseek is not set up. Add the slskd address and API key in Settings.",
		);
		this.name = "NotConfigured";
	}
}

export function slskdConfigured(): boolean {
	const s = readSettings();
	return Boolean(s.slskdUrl && s.slskdApiKey);
}

// A client for the slskd the settings name; throws `NotConfigured` when they name none.
export function slskdClient(overrides?: {
	url: string;
	apiKey: string;
}): SlskdClient {
	const s = readSettings();
	const baseUrl = overrides?.url ?? s.slskdUrl;
	const apiKey = overrides?.apiKey ?? s.slskdApiKey;
	if (!baseUrl || !apiKey) throw new NotConfigured();
	return createSlskdClient({ baseUrl, apiKey });
}

// Where slskd saves downloads on this machine: the setting, else what slskd's own
// running configuration says (`directories.downloads`).
let discovered: { key: string; dir: string | null } | null = null;

export async function downloadsDir(
	client: SlskdClient,
): Promise<string | null> {
	const s = readSettings();
	if (s.slskdDownloadsDir) return s.slskdDownloadsDir;
	const key = `${s.slskdUrl}`;
	if (discovered?.key === key && discovered.dir) return discovered.dir;
	try {
		const options = await client.options.get();
		const dir = (options.directories as { downloads?: string } | undefined)
			?.downloads;
		discovered = { key, dir: dir ?? null };
		return dir ?? null;
	} catch {
		return null;
	}
}

// A reason in words for what went wrong talking to slskd.
export function slskdWords(error: unknown): string {
	if (error instanceof NotConfigured) return error.message;
	if (error instanceof SlskdError) {
		if (error.status === 401 || error.status === 403)
			return "slskd refused the API key.";
		if (error.status === null)
			return `slskd is not reachable: ${error.message}`;
		return `slskd answered ${error.status}.`;
	}
	return error instanceof Error ? error.message : String(error);
}
