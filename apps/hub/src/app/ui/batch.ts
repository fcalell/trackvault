import { toast } from "@fcalell/plugin-react-ui/lib/toast";

// A job that writes a batch is recorded under its own id, so the toast of the act
// that queued it links to that batch in History.
export function batchToast(job: { id: string }, sentence: string): void {
	toast(sentence, {
		act: { label: "See the batch", href: `/history/${job.id}` },
	});
}

export async function queuedBatch<Job extends { id: string }>(
	queued: Promise<Job>,
	sentence: string,
): Promise<Job> {
	const job = await queued;
	batchToast(job, sentence);
	return job;
}
