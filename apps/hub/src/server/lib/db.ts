import { createClient } from "@fcalell/plugin-db/sqlite";
import * as schema from "../../schema/index.ts";

type Db = ReturnType<typeof createClient<typeof schema>>;

// The hub's one database handle, for the services. `createClient` opens each file
// once per process and tunes the connection (WAL, mmap, cache), and the worker's
// context takes the same handle, so a service and a procedure share one connection.
export function db(): Db {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	return createClient(file, schema);
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
