// Set whenever something may have landed in the inbox; the inbox job clears it before
// each pass and looks again while it is set, so a file that arrives mid-run is not
// left until the next reconcile.
export const inboxState = { dirty: false };
