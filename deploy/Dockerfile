# The image holds the built bundle (`apps/hub/dist`: client/ and server/) and nothing else:
# no stack checkout, no install, no CLI. Build it where stack is checked out and installed
# (the bundle is the build machine's platform: build on the box's, linux for this image),
# then build the image from the repo root:
#   TRACKVAULT_DOMAIN=trackvault.example.com pnpm build
#   docker build -f deploy/Dockerfile -t trackvault-hub .
FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/hub
COPY apps/hub/dist ./dist
ENV DB_FILE=/data/trackvault.sqlite PORT=8788 NODE_ENV=production
VOLUME /data
EXPOSE 8788
# Migrations are applied before it listens; SIGTERM stops the services.
CMD ["node", "dist/server/server.mjs"]
