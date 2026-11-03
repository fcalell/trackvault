import { dirname, join } from "node:path";

// Where the sync keeps what is not in the database: next to it, like the waveforms.
export function dataDir(): string {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	return dirname(file);
}

const safe = (text: string): string => text.replace(/[^\w-]/g, "_");

export const blobPath = (hash: string): string =>
	join(dataDir(), "anlz", safe(hash.slice(0, 2)), safe(hash));

export const uploadPath = (id: string): string =>
	join(dataDir(), "uploads", `${safe(id)}.part`);
