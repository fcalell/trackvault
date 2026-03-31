import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSqliteClient } from "@repo/db/client";
import { migrateDb } from "@repo/db/migrate";
import { getDesktopClient } from "@repo/db-desktop/client";
import { migrateDesktopDb } from "@repo/db-desktop/migrate";
import { app } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isPackaged = app.isPackaged;
const userDataPath = app.getPath("userData");

const libraryDbPath = isPackaged
	? path.join(userDataPath, "trackvault.db")
	: "trackvault.db";

const desktopDbPath = isPackaged
	? path.join(userDataPath, "desktop.db")
	: "desktop.db";

export const db = getSqliteClient(libraryDbPath);
export const desktopDb = getDesktopClient(desktopDbPath);

const libraryMigrationsPath = isPackaged
	? path.join(process.resourcesPath, "migrations", "library")
	: path.resolve(__dirname, "../../../packages/db/src/migrations");

const desktopMigrationsPath = isPackaged
	? path.join(process.resourcesPath, "migrations", "desktop")
	: path.resolve(__dirname, "../../../packages/db-desktop/src/migrations");

migrateDb(db, libraryMigrationsPath);
migrateDesktopDb(desktopDb, desktopMigrationsPath);
