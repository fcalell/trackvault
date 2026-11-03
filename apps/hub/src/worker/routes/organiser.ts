import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { eq } from "@fcalell/plugin-db/orm";
import { parseTemplate } from "@trackvault/core/organize";
import { settings } from "../../schema/index.ts";
import organise from "../../server/jobs/organise.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const template = z.string().trim().min(1, "Enter a template").max(300);

function checked(value: string): string {
	try {
		parseTemplate(value);
	} catch (error) {
		throw new ApiError("BAD_REQUEST", {
			message:
				error instanceof Error ? error.message : "The template is not valid",
		});
	}
	return value;
}

function save(value: string): void {
	readSettings();
	db()
		.update(settings)
		.set({ organiseTemplate: value, updatedAt: new Date() })
		.where(eq(settings.id, 1))
		.run();
}

export const organiser = {
	get: procedure({ auth: true, reads: ["settings"] }).query(() => ({
		template: readSettings().organiseTemplate,
	})),

	// Keeps the template.
	save: procedure({ auth: true, writes: ["settings"] })
		.input(z.object({ template }))
		.mutation(({ input }) => {
			save(checked(input.template));
		}),

	// Plans the moves of the whole library under a template; the job stores them.
	preview: procedure({ auth: true, writes: ["settings", "previews", "jobs"] })
		.input(z.object({ template }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			save(checked(input.template));
			return enqueue(organise, { mode: "preview", template: input.template });
		}),

	apply: procedure({ auth: true, writes: ["tracks", "files", "jobs"] })
		.input(z.object({ template }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			save(checked(input.template));
			return enqueue(organise, { mode: "apply", template: input.template });
		}),
};
