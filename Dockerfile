# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.15.0

FROM node:${NODE_VERSION}-bookworm-slim AS base

WORKDIR /app

ENV CI=true

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
  && npm run build

FROM dependencies AS migration

ENV NODE_ENV=production

COPY prisma.config.ts ./
COPY prisma ./prisma

USER node

ENTRYPOINT ["npx", "prisma"]
CMD ["migrate", "deploy"]

FROM base AS production-dependencies

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

FROM base AS production

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json

RUN mkdir -p /app/storage/system-health \
  && chown -R node:node /app/storage

USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
