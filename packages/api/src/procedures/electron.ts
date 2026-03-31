import { ORPCError } from "@orpc/server";
import { baseProcedure } from "#lib/orpc";
import { requirePlatform } from "#middleware/platform";

const selectFolder = baseProcedure
	.use(requirePlatform("electron"))
	.handler(async ({ context }) => {
		if (!context.electronApi) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Electron API not available",
			});
		}

		const paths = await context.electronApi.showOpenDialog();
		if (!paths || paths.length === 0) {
			throw new ORPCError("CLIENT_CLOSED_REQUEST", {
				message: "Dialog cancelled",
			});
		}
		return paths[0] as string;
	});

export const electronRouter = {
	selectFolder,
};
