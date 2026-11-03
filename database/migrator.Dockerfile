FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node backend/src/db/pool.js ./src/db/pool.js
COPY --chown=node:node database/migrations ./migrations
COPY --chown=node:node database/migrate.js ./src/migrate.js

USER node
CMD ["node", "src/migrate.js"]
