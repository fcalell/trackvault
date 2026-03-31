import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { DbClient } from "./client";

export function migrateDb(db: DbClient, migrationsFolder: string) {
	migrate(db, { migrationsFolder });
}
