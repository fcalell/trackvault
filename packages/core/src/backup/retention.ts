// Which backups to keep: the newest of each of the last N days, of each of the last
// M weeks and of each of the last K months (calendar days in local time, weeks
// starting on Monday). A backup that is kept by any rule stays; the rest can go.

export interface RetentionPolicy {
	daily: number;
	weekly: number;
	monthly: number;
}

export interface Dated {
	id: string;
	at: Date;
	// A backup that failed verification is never what a rule keeps for, and is the
	// first to go; `undefined` counts as good.
	good?: boolean;
}

const dayKey = (d: Date): string =>
	`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}`;

function weekKey(d: Date): string {
	// The Monday of the week, as a day key.
	const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return dayKey(monday);
}

// The ids to keep. The newest good backup is always kept, so a policy of zeros never
// leaves nothing.
export function retained(items: Dated[], policy: RetentionPolicy): Set<string> {
	const keep = new Set<string>();
	const newest = [...items]
		.filter((item) => item.good !== false)
		.sort((a, b) => b.at.getTime() - a.at.getTime());
	const take = (key: (d: Date) => string, count: number): void => {
		if (count <= 0) return;
		const seen = new Set<string>();
		for (const item of newest) {
			const k = key(item.at);
			if (seen.has(k)) continue;
			if (seen.size >= count) break;
			seen.add(k);
			keep.add(item.id);
		}
	};
	take(dayKey, policy.daily);
	take(weekKey, policy.weekly);
	take(monthKey, policy.monthly);
	const first = newest[0];
	if (first) keep.add(first.id);
	return keep;
}

export const expired = (items: Dated[], policy: RetentionPolicy): Dated[] => {
	const keep = retained(items, policy);
	return items.filter((item) => !keep.has(item.id));
};

// "trackvault-2026-11-03T03-00-00Z.sqlite.zst" <-> its time.
export function stampOf(at: Date): string {
	return at
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/:/g, "-");
}

const NAME =
	/^trackvault-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.sqlite(\.zst|\.gz)?(\.enc)?$/;

export function parseBackupName(name: string): {
	at: Date;
	compression: "zstd" | "gzip" | "none";
	encrypted: boolean;
} | null {
	const m = NAME.exec(name);
	if (!m) return null;
	const [, y, mo, d, h, mi, s, ext, enc] = m;
	return {
		at: new Date(
			Date.UTC(
				+(y as string),
				+(mo as string) - 1,
				+(d as string),
				+(h as string),
				+(mi as string),
				+(s as string),
			),
		),
		compression: ext === ".zst" ? "zstd" : ext === ".gz" ? "gzip" : "none",
		encrypted: enc === ".enc",
	};
}

export function backupName(
	at: Date,
	compression: "zstd" | "gzip" | "none",
): string {
	const ext =
		compression === "zstd" ? ".zst" : compression === "gzip" ? ".gz" : "";
	return `trackvault-${stampOf(at)}.sqlite${ext}`;
}
