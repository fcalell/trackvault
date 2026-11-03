import { createHmac, timingSafeEqual } from "node:crypto";

// A signed, expiring address for a track's media (`/media/<id>?t=<token>`), so a player
// that cannot send headers (a native audio player) streams without a cookie or a bearer
// key. The token is the expiry and an HMAC of the track id and the expiry under
// AUTH_SECRET: it opens that one track (its file, cover and waveform) until it runs out,
// and changing AUTH_SECRET voids every one.
export const MEDIA_TOKEN_TTL_MS = 6 * 3600 * 1000;

function secret(): string {
	const value = process.env.AUTH_SECRET;
	if (!value) throw new Error("AUTH_SECRET is not set");
	return value;
}

const signature = (id: string, expires: number): string =>
	createHmac("sha256", secret())
		.update(`media\0${id}\0${expires}`)
		.digest("base64url");

export function mintMediaToken(
	id: string,
	now = Date.now(),
): { token: string; expiresAt: number } {
	const expiresAt = now + MEDIA_TOKEN_TTL_MS;
	return { token: `${expiresAt}.${signature(id, expiresAt)}`, expiresAt };
}

export function verifyMediaToken(
	id: string,
	token: string | null,
	now = Date.now(),
): boolean {
	if (!token) return false;
	const dot = token.indexOf(".");
	if (dot < 1) return false;
	const expires = Number(token.slice(0, dot));
	if (!Number.isSafeInteger(expires) || expires < now) return false;
	const given = Buffer.from(token.slice(dot + 1));
	const wanted = Buffer.from(signature(id, expires));
	return given.length === wanted.length && timingSafeEqual(given, wanted);
}
