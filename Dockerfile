FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts tsconfig*.json ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY test-fixtures/i18n.local.json ./test-fixtures/i18n.local.json

RUN pnpm build && pnpm prune --prod

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server-dist ./server-dist
COPY --from=build --chown=node:node /app/test-fixtures/i18n.local.json ./test-fixtures/i18n.local.json

USER node
EXPOSE 3000

CMD ["node", "server-dist/server/server.js"]
