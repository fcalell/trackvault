import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { DesktopDbClient } from "./client";

export function migrateDesktopDb(
	db: DesktopDbClient,
	migrationsFolder: string,
) {
	migrate(db, { migrationsFolder });
}
