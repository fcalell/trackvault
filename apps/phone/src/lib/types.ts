import type { client } from "./api";

type Out<F> = F extends (...a: never[]) => Promise<infer O> ? O : never;
type Rows<F> = Out<F> extends { data: (infer R)[] } ? R : never;

/** A row of the library window. */
export type TrackRow = Rows<typeof client.tracks.list>;
/** A suggested next track. */
export type Suggestion = Out<typeof client.sets.suggest>[number];
/** A set-builder search hit. */
export type Found = Out<typeof client.sets.find>[number];
export type InboxRow = Rows<typeof client.inbox.list>;
export type WantRow = Rows<typeof client.wishlist.list>;
export type JobRow = Out<typeof client.jobs.list>[number];
export type TreeRow = Out<typeof client.playlists.tree>[number];
/** The full record of a track. */
export type TrackFull = Out<typeof client.tracks.get>;
