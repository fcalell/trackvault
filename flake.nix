{
  description = "TrackVault dev shell: pnpm monorepo on a local checkout of @fcalell/stack";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            # Provides the `pnpm` shim that honours packageManager.
            pkgs.corepack
            pkgs.biome
            pkgs.vtsls
            pkgs.tailwindcss-language-server
            # Tag and peaks jobs shell out to these.
            pkgs.ffmpeg
            pkgs.chromaprint
          ];

          CHROME_PATH = pkgs.lib.getExe pkgs.chromium;

          shellHook = ''
            export COREPACK_HOME="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.corepack"
            mkdir -p "$COREPACK_HOME"
            corepack enable --install-directory "$COREPACK_HOME" 2>/dev/null || true
            export PATH="$COREPACK_HOME:$PATH"
          '';
        };
      }
    );
}
