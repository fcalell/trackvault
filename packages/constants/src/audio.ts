export const SUPPORTED_EXTENSIONS = [".mp3"] as const;

export const LOW_BITRATE_THRESHOLD = 320;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
