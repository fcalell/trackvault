// Babel must live at the project root for Metro to find it. babel-preset-expo
// includes the expo-router require.context transform used by .stack/entry.tsx.
// The React Compiler runs first (plugins precede presets) over your code and
// @fcalell/* under node_modules, the same filter the web build uses;
// babel-preset-expo compiles no dependency on its own.
const { COMPILED_SOURCE } = require("@fcalell/cli/compiled-source");

module.exports = (api) => {
	api.cache(true);
	return {
		plugins: [
			[
				"babel-plugin-react-compiler",
				{
					target: "19",
					sources: (filename) => new RegExp(COMPILED_SOURCE).test(filename),
				},
			],
		],
		presets: ["babel-preset-expo"],
	};
};
