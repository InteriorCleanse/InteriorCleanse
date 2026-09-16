# Mr. Cash — paper-trading bot. Runs TypeScript directly on Node 22; zero
# runtime dependencies. This image runs the paper stack 24/7; it ships with no
# exchange keys and cannot place a real order (see the live gate chain).
FROM node:22-slim

WORKDIR /app
# Only the manifest first, for layer caching. There are no runtime deps to
# install (optionalDependencies are dev-only), so this stays tiny.
COPY package.json ./
COPY . .

ENV NODE_ENV=production
ENV MRCASH_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4173

# Health: the deep /api/health check must report healthy.
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>r.json()).then(j=>process.exit(j.data&&j.data.healthy?0:1)).catch(()=>process.exit(1))"

# Default: the dashboard + 24/7 watch loop. Override with `npm run watch` for headless.
CMD ["npm", "start"]
