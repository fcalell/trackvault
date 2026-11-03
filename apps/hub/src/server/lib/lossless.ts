import { isLossless } from "@trackvault/core/dedupe";

const LOSSLESS_CODECS = new Set([
	"flac",
	"alac",
	"pcm",
	"ape",
	"wv",
	"wavpack",
]);

// Whether a file's audio is lossless: by what is coded inside it (an .m4a holds AAC or
// ALAC), and by the container only when the codec is not known.
export function losslessOf(format: string, codec: string | null): boolean {
	return codec ? LOSSLESS_CODECS.has(codec.toLowerCase()) : isLossless(format);
}

// The format name core's quality rules understand (core/dedupe `isLossless` reads a
// name): a lossless codec stands under its own name, anything else under the container.
export function qualityFormat(format: string, codec: string | null): string {
	if (!losslessOf(format, codec)) return format;
	const name = (codec ?? format).toLowerCase();
	return name === "pcm" ? (format === "aiff" ? "aiff" : "wav") : name;
}
