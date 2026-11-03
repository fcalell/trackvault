export const COMPRESSIONS = ["zstd", "gzip", "none"] as const;
export type Compression = (typeof COMPRESSIONS)[number];

export const COMPRESSION_LABELS: Record<Compression, string> = {
	zstd: "zstd (smallest, fast)",
	gzip: "gzip (opens anywhere)",
	none: "None",
};

// The job kinds the Backups place follows live.
export const BACKUP_KINDS = ["backup", "backup-verify", "offsite"] as const;
