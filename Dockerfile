# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build

ENV CI=true
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci

COPY . .
RUN npm run typecheck && npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app /app
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/aurum
RUN chmod 0555 /usr/local/bin/aurum

USER node
EXPOSE 3000 8787
ENTRYPOINT ["/usr/local/bin/aurum"]
CMD ["api"]
