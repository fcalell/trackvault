import { sql } from "@fcalell/plugin-db/orm";
import { previews } from "../../schema/index.ts";
import { db } from "./db.ts";
import { inserter, statement } from "./raw.ts";

export interface PreviewRow {
	trackId: string;
	label: string | null;
	field: string;
	before: string | null;
	after: string | null;
}

const insertPreview = inserter(previews);

// The writer of a preview job's result: rows stored in transactions of 1k, in
// the order they come, so the screen reads them in windows. The last preview of
// the same kind goes first.
export class PreviewWriter {
	private pos = 0;
	private pending: PreviewRow[] = [];
	private readonly jobId: string;

	constructor(jobId: string, kind: string) {
		this.jobId = jobId;
		statement(
			"DELETE FROM previews WHERE job_id IN (SELECT id FROM jobs WHERE kind = @kind AND id != @id)",
		).run({ kind, id: jobId });
		statement("DELETE FROM previews WHERE job_id = @id").run({ id: jobId });
	}

	add(row: PreviewRow): void {
		this.pending.push(row);
		if (this.pending.length >= 1000) this.flush();
	}

	get rows(): number {
		return this.pos + this.pending.length;
	}

	flush(): void {
		if (this.pending.length === 0) return;
		const group = this.pending;
		this.pending = [];
		db().transaction(() => {
			for (const row of group)
				insertPreview({ ...row, jobId: this.jobId, pos: this.pos++ });
		});
	}
}

// Previews older than a day go.
export function purgeOldPreviews(): void {
	db().run(
		sql`DELETE FROM previews WHERE job_id NOT IN (SELECT id FROM jobs WHERE created_at > ${Date.now() - 24 * 3600 * 1000})`,
	);
}

export const text = (value: unknown): string | null =>
	value === null || value === undefined || value === "" ? null : String(value);
