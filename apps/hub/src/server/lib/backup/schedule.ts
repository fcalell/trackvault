// When the daily backup is due: the latest `hour` o'clock (the hub's local time)
// that is not in the future, and the next one after now.
export function lastDue(now: Date, hour: number): Date {
	const due = new Date(now);
	due.setHours(hour, 0, 0, 0);
	if (due.getTime() > now.getTime()) due.setDate(due.getDate() - 1);
	return due;
}

export function nextDue(now: Date, hour: number): Date {
	const due = lastDue(now, hour);
	due.setDate(due.getDate() + 1);
	return due;
}
