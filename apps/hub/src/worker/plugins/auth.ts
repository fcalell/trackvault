import type { AuthCallbacks } from "@fcalell/plugin-auth/runtime";

const callbacks: AuthCallbacks = {
	sendOTP({ email, code }) {
		console.log(`sign-in code for ${email}: ${code}`);
	},
};

export default callbacks;
