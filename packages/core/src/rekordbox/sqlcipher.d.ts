// better-sqlite3-multiple-ciphers ships its types (index.d.ts) but its package.json
// "exports" map has no "types" condition, so TypeScript cannot resolve them. This
// points the module at the shipped file; consumers pick it up through the
// `/// <reference>` in db.ts and write.ts.
declare module "better-sqlite3-multiple-ciphers" {
	import Database = require("../../node_modules/better-sqlite3-multiple-ciphers/index.d.ts");
	export = Database;
}
