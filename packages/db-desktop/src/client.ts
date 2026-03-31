import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function getDesktopClient(dbPath: string) {
	const sqlite = new Database(dbPath);
	return drizzle({ client: sqlite, schema });
}

export type DesktopDbClient = ReturnType<typeof getDesktopClient>;
