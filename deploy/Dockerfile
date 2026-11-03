# Build context: the folder that holds BOTH checkouts (`stack/` and `trackvault/`), because
# the hub links the stack checkout (`link:../stack/...`).
#   docker build -f trackvault/deploy/Dockerfile -t trackvault-hub .
FROM node:24-bookworm-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /srv
COPY stack ./stack
COPY trackvault ./trackvault
RUN cd stack && pnpm install --frozen-lockfile
RUN cd trackvault && pnpm install --frozen-lockfile && TRACKVAULT_DOMAIN=${TRACKVAULT_DOMAIN:-trackvault.localhost} pnpm build

FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /srv /srv
WORKDIR /srv/trackvault/apps/hub
ENV DB_FILE=/data/trackvault.sqlite NODE_ENV=production
VOLUME /data
EXPOSE 8788
CMD ["sh", "-c", "node_modules/.bin/stack db apply && exec node .stack/server.ts"]
