FROM node:22-alpine

ENV NODE_ENV=production MIGRATIONS_DIR=/app/database/migrations
WORKDIR /app

COPY --chown=node:node backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node backend/src/db/pool.js ./backend/src/db/pool.js
COPY --chown=node:node database/migrations ./database/migrations
COPY --chown=node:node database/migrate.js ./database/migrate.js

USER node
CMD ["node", "database/migrate.js"]
