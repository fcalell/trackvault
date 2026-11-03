import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { asc } from "@fcalell/plugin-db/orm";
import { user } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";

// The most folders one listing returns; a folder with more is filtered by the picker.
const MAX_DIRS = 1000;

const listing = z.object({
	// The folder listed, absolute and normalised.
	path: z.string(),
	// Its parent, null at the top.
	parent: z.string().nullable(),
	dirs: z.array(z.object({ name: z.string(), path: z.string() })),
	// More folders than a listing holds: the rest are not shown.
	truncated: z.boolean(),
});

export const fs = {
	// The folders under a path on the hub's disk, for choosing the library root. Only
	// the owner (the first account) may look at the hub's filesystem.
	browse: procedure({ auth: true })
		.input(z.object({ path: z.string().optional() }))
		.output(listing)
		.query(({ input, context }) => {
			const owner = db()
				.select({ id: user.id })
				.from(user)
				.orderBy(asc(user.createdAt), asc(user.id))
				.limit(1)
				.get();
			if (owner?.id !== context.user.id) throw new ApiError("FORBIDDEN");

			const start = input.path ?? readSettings().libraryRoot ?? homedir();
			const path = normalize(start).replace(/(.)\/+$/, "$1");
			if (!isAbsolute(path)) {
				throw new ApiError("BAD_REQUEST", {
					message: "Enter the folder's full path, starting with /",
				});
			}
			let names: string[];
			try {
				if (!statSync(path).isDirectory()) throw new Error("not a folder");
				names = readdirSync(path);
			} catch {
				throw new ApiError("BAD_REQUEST", {
					message: "That folder can't be read on the hub",
				});
			}
			const dirs: Array<{ name: string; path: string }> = [];
			for (const name of names.sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: "base" }),
			)) {
				// Hidden folders are not music.
				if (name.startsWith(".")) continue;
				const child = join(path, name);
				try {
					if (statSync(child).isDirectory()) dirs.push({ name, path: child });
				} catch {}
				if (dirs.length > MAX_DIRS) break;
			}
			const parent = dirname(path);
			return {
				path,
				parent: parent === path ? null : parent,
				dirs: dirs.slice(0, MAX_DIRS),
				truncated: dirs.length > MAX_DIRS,
			};
		}),
};
