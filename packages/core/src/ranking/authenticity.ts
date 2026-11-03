import { isLossless } from "../dedupe/keeper.ts";
import type { SoulseekFile } from "../slskd/types.ts";

export type Authenticity = "ok" | "suspect" | "fake" | "unverifiable";

export interface AuthenticityResult {
	verdict: Authenticity;
	reasons: string[];
	// True when the claim is worth proving after download with the spectral
	// cutoff check (quality module): lossless and high-bitrate lossy files are
	// where transcodes hide, and metadata alone cannot see those.
	needsCutoffCheck: boolean;
	// Size/length derived bitrate, kbps.
	impliedKbps: number | null;
}

const STANDARD_MP3 = new Set([
	8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
]);

// Judges what a peer claims by what the numbers allow. A CBR file's size is
// bitrate x length, so a "320" file that is far smaller was re-labelled or
// truncated. Spectral transcodes (a 128 kbps file re-encoded at 320) pass this
// check by design; that is what needsCutoffCheck is for.
export function assessAuthenticity(f: SoulseekFile): AuthenticityResult {
	const reasons: string[] = [];
	const lossless = isLossless(f.extension);
	const implied =
		f.length && f.size > 0 ? (f.size * 8) / f.length / 1000 : null;
	let verdict: Authenticity = "ok";
	const worsen = (v: Authenticity) => {
		const order: Authenticity[] = ["ok", "unverifiable", "suspect", "fake"];
		if (order.indexOf(v) > order.indexOf(verdict)) verdict = v;
	};

	if (lossless) {
		if (implied !== null) {
			if (
				f.extension === "wav" ||
				f.extension === "aif" ||
				f.extension === "aiff"
			) {
				if (f.sampleRate && f.bitDepth) {
					const stereo = (f.sampleRate * f.bitDepth * 2) / 1000;
					if (implied < stereo * 0.45) {
						reasons.push(
							`${Math.round(implied)} kbps implied, uncompressed stereo would be ${Math.round(stereo)}`,
						);
						worsen("suspect");
					}
				}
			} else if (implied < 350) {
				reasons.push(`lossless but only ${Math.round(implied)} kbps implied`);
				worsen(implied < 200 ? "fake" : "suspect");
			}
		} else {
			reasons.push("no length: size cannot be checked");
			worsen("unverifiable");
		}
		return {
			verdict,
			reasons,
			needsCutoffCheck: true,
			impliedKbps: implied,
		};
	}

	const claimed = f.bitrate;
	if (claimed === null) {
		reasons.push("no bitrate reported");
		worsen("unverifiable");
	} else if (f.extension === "mp3" && claimed > 320) {
		reasons.push(`mp3 cannot be ${claimed} kbps`);
		worsen("fake");
	}
	if (claimed !== null && implied !== null) {
		const cbr = f.vbr !== true;
		const low = cbr ? 0.9 : 0.75;
		const high = cbr ? 1.1 : 1.3;
		const ratio = implied / claimed;
		if (ratio < low) {
			reasons.push(
				`claims ${claimed} kbps but size/length gives ${Math.round(implied)}`,
			);
			worsen(ratio < low - 0.15 ? "fake" : "suspect");
		} else if (ratio > high && f.size > 0) {
			// Embedded art, not fraud, but worth knowing.
			reasons.push(`size is ${Math.round((ratio - 1) * 100)}% over the claim`);
			worsen("suspect");
		}
		if (cbr && f.extension === "mp3" && !STANDARD_MP3.has(claimed)) {
			reasons.push(`${claimed} kbps is not a standard CBR rate`);
			worsen("suspect");
		}
	} else if (claimed !== null && implied === null) {
		reasons.push("no length: size cannot be checked");
		worsen("unverifiable");
	}
	return {
		verdict,
		reasons,
		needsCutoffCheck: (claimed ?? 0) >= 224,
		impliedKbps: implied,
	};
}
