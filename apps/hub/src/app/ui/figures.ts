const COUNT = new Intl.NumberFormat("en");
const MB = 1024 * 1024;
const WHEN = new Intl.DateTimeFormat("en", {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

// 12,345.
export const count = (n: number): string => COUNT.format(n);

// 128, 127.9: one decimal at most; null where the track has none.
export const bpm = (value: number | null): number | null =>
	value === null ? null : Math.round(value * 10) / 10;

// 5:32.
export function duration(ms: number | null): string | null {
	if (!ms || ms <= 0) return null;
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 4 h 32 min, 48 min: a total length.
export function span(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	return minutes >= 60
		? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
		: `${minutes} min`;
}

// 12.4 MB, 3.2 GB.
export function size(bytes: number): string {
	return bytes >= 1024 * MB
		? `${(bytes / (1024 * MB)).toFixed(1)} GB`
		: `${(bytes / MB).toFixed(1)} MB`;
}

// 480 KB/s.
export function speed(bytesPerSecond: number): string {
	return bytesPerSecond >= MB
		? `${(bytesPerSecond / MB).toFixed(1)} MB/s`
		: `${Math.round(bytesPerSecond / 1024)} KB/s`;
}

// MP3 320.
export function bitrate(format: string, kbps: number | null): string {
	return kbps ? `${format.toUpperCase()} ${kbps}` : format.toUpperCase();
}

// The moment a Table's `age` column and a row's `trailing.age` read, which they word and keep current.
export const age = (date: Date): string => date.toISOString();

// Tue 3 Nov, 03:00.
export const date = (moment: Date): string => WHEN.format(moment);

// "in 5 min", "in 3 h", "in 2 days": when something is due; "now" when it is.
export function until(moment: Date | null, now = Date.now()): string | null {
	if (!moment) return null;
	const minutes = Math.round((moment.getTime() - now) / 60_000);
	if (minutes <= 0) return "now";
	if (minutes < 60) return `in ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `in ${hours} h`;
	return `in ${Math.round(hours / 24)} days`;
}
