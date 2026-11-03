import { type AuthClient, createAuthClient } from "@fcalell/plugin-auth/expo";
import * as SecureStore from "expo-secure-store";
import { cookiePrefix, scheme } from "../../.stack/native-auth";
import { hub } from "./hub";

// The email-code sign-in's client: it talks to whichever hub the Gate pointed the phone at
// (`baseURL` is read on every use). It holds a session only until the sign-in has traded
// it for a device key (lib/sign-in.tsx); every later request carries the key.
export const authClient: AuthClient = createAuthClient({
	baseURL: () => hub().url ?? "http://localhost:8788",
	scheme,
	cookiePrefix,
	storage: SecureStore,
});
