// Every job kind, imported statically so the production bundle (one file, no `jobs/`
// directory) holds them. A kind is one file in `jobs/` that default-exports a `defineJob`;
// add it here too: the runner refuses to start when a file of `jobs/` is missing from the list.
import analyse from "../jobs/analyse.ts";
import art from "../jobs/art.ts";
import autotag from "../jobs/autotag.ts";
import autotagApply from "../jobs/autotag-apply.ts";
import backup from "../jobs/backup.ts";
import backupVerify from "../jobs/backup-verify.ts";
import bitrate from "../jobs/bitrate.ts";
import dedupe from "../jobs/dedupe.ts";
import edit from "../jobs/edit.ts";
import fingerprint from "../jobs/fingerprint.ts";
import inbox from "../jobs/inbox.ts";
import inboxApprove from "../jobs/inbox-approve.ts";
import integrity from "../jobs/integrity.ts";
import merge from "../jobs/merge.ts";
import offsite from "../jobs/offsite.ts";
import organise from "../jobs/organise.ts";
import peaks from "../jobs/peaks.ts";
import playlistAdd from "../jobs/playlist-add.ts";
import playlistImport from "../jobs/playlist-import.ts";
import playlistRemove from "../jobs/playlist-remove.ts";
import purge from "../jobs/purge.ts";
import quarantine from "../jobs/quarantine.ts";
import restore from "../jobs/restore.ts";
import rules from "../jobs/rules.ts";
import scan from "../jobs/scan.ts";
import search from "../jobs/search.ts";
import tagFlush from "../jobs/tag-flush.ts";
import tagWrite from "../jobs/tag-write.ts";
import undo from "../jobs/undo.ts";
import unify from "../jobs/unify.ts";
import wishlist from "../jobs/wishlist.ts";

export const KIND_FILES = [
	"analyse.ts",
	"art.ts",
	"autotag.ts",
	"autotag-apply.ts",
	"backup.ts",
	"backup-verify.ts",
	"bitrate.ts",
	"dedupe.ts",
	"edit.ts",
	"fingerprint.ts",
	"inbox.ts",
	"inbox-approve.ts",
	"integrity.ts",
	"merge.ts",
	"offsite.ts",
	"organise.ts",
	"peaks.ts",
	"playlist-add.ts",
	"playlist-import.ts",
	"playlist-remove.ts",
	"purge.ts",
	"quarantine.ts",
	"restore.ts",
	"rules.ts",
	"scan.ts",
	"search.ts",
	"tag-flush.ts",
	"tag-write.ts",
	"undo.ts",
	"unify.ts",
	"wishlist.ts",
] as const;

export const KINDS = [
	analyse,
	art,
	autotag,
	autotagApply,
	backup,
	backupVerify,
	bitrate,
	dedupe,
	edit,
	fingerprint,
	inbox,
	inboxApprove,
	integrity,
	merge,
	offsite,
	organise,
	peaks,
	playlistAdd,
	playlistImport,
	playlistRemove,
	purge,
	quarantine,
	restore,
	rules,
	scan,
	search,
	tagFlush,
	tagWrite,
	undo,
	unify,
	wishlist,
];
