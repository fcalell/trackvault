import { createAuthClient } from "@fcalell/plugin-auth/client";

// Passkeys have no procedure: the sign-in ceremony and enrolment run on Better Auth's
// own client, with the flags `auth()` sets in stack.config.ts.
export const authClient = createAuthClient({
	passkey: true,
	organization: true,
});
