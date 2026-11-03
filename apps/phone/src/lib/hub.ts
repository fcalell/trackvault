import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// Where the hub is and the device key that signs the phone in. Both live in the
// secure store (the key is a credential) and are read once, synchronously, at start.
const URL_KEY = "trackvault-hub-url";
const KEY_KEY = "trackvault-hub-key";

export interface Hub {
	url: string | null;
	key: string | null;
}

function load(): Hub {
	try {
		return {
			url: SecureStore.getItem(URL_KEY),
			key: SecureStore.getItem(KEY_KEY),
		};
	} catch {
		return { url: null, key: null };
	}
}

let current: Hub = load();
const listeners = new Set<() => void>();

export const hub = (): Hub => current;

/** The hub's origin without a trailing slash; a bare host gets `http://`. */
export function normalizeUrl(typed: string): string {
	const trimmed = typed.trim().replace(/\/+$/, "");
	return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function set(next: Hub) {
	current = next;
	for (const listener of listeners) listener();
}

/** Takes the credentials in memory for the next requests; `save` keeps them. */
export function use(next: { url: string; key: string }) {
	set({ url: next.url, key: next.key });
}

export async function save() {
	if (current.url && current.key) {
		await SecureStore.setItemAsync(URL_KEY, current.url);
		await SecureStore.setItemAsync(KEY_KEY, current.key);
	}
}

export async function forget() {
	set({ url: current.url, key: null });
	await SecureStore.deleteItemAsync(KEY_KEY);
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export function useHub(): Hub {
	return useSyncExternalStore(subscribe, hub, hub);
}
