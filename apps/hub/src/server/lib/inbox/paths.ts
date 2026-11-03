// The folder under the library root where new music arrives. The scanner leaves it
// alone: a file there is an inbox item until it is approved and filed.
export const INBOX_DIR = "Inbox";
export const SOULSEEK_DIR = "Soulseek";

export const isInboxPath = (path: string): boolean =>
	path === INBOX_DIR || path.startsWith(`${INBOX_DIR}/`);
