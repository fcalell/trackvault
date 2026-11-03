import { type AuthClient, createAuthClient } from "@fcalell/plugin-auth/expo";
import * as SecureStore from "expo-secure-store";
import { cookiePrefix, scheme } from "../../.stack/native-auth";
import { hub } from "./hub";

// The provider stack nativeUi() wires needs an auth client. The phone signs in with a
// device key (lib/hub.ts), not a Better Auth session, so this client only exists to
// satisfy the entry; it is pointed at the stored hub. Email-code sign-in would need
// `auth({ expo: true })` on the hub (a recorded gap).
export const authClient: AuthClient = createAuthClient({
	baseURL: hub().url ?? "http://localhost:8788",
	scheme,
	cookiePrefix,
	storage: SecureStore,
});
