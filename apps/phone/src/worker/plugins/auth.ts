import type { AuthCallbacks } from "@fcalell/plugin-auth/runtime";

// The phone's own (never run) worker; sign-in goes to the hub.
const callbacks: AuthCallbacks = {
	sendOTP({ email, code }) {
		console.log(`OTP for ${email}: ${code}`);
	},
};

export default callbacks;
