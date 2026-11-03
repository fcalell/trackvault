import type { SQLiteTable } from "@fcalell/plugin-db/orm";
import { getTableColumns, getTableName } from "@fcalell/plugin-db/orm";
import { db } from "./db.ts";

interface Statement {
	run(parameters: Record<string, unknown>): {
		lastInsertRowid: number | bigint;
	};
}

interface Raw {
	prepare(sql: string): Statement;
}

// The better-sqlite3 connection behind the drizzle handle, for the statements a
// scan runs thousands of times: prepared once, run with named parameters.
const raw = (): Raw => (db() as unknown as { $client: Raw }).$client;

// An insert into `table` for the hot path, keyed by the table's own property names.
export function inserter<T extends SQLiteTable>(
	table: T,
): (row: T["$inferInsert"]) => number {
	const columns = Object.entries(getTableColumns(table));
	let statement: Statement | undefined;
	return (row) => {
		statement ??= raw().prepare(
			`INSERT INTO "${getTableName(table)}" (${columns.map(([, c]) => `"${c.name}"`).join(", ")}) VALUES (${columns.map(([, c]) => `@${c.name}`).join(", ")})`,
		);
		const parameters: Record<string, unknown> = {};
		for (const [key, column] of columns) {
			const value = (row as Record<string, unknown>)[key];
			parameters[column.name] =
				value instanceof Date
					? value.getTime()
					: typeof value === "boolean"
						? value
							? 1
							: 0
						: (value ?? null);
		}
		return Number(statement.run(parameters).lastInsertRowid);
	};
}
