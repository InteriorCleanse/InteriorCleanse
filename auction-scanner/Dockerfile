# Gavel in a container. One process, one data folder that must survive restarts.
#   docker build -t gavel .
#   docker run -d --name gavel --env-file .env -v gavel-data:/data -p 127.0.0.1:8790:8790 gavel
# Put HTTPS in front (deploy/Caddyfile, or deploy/compose.yaml for both at once).
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    GAVEL_HOST=0.0.0.0 \
    GAVEL_PORT=8790 \
    GAVEL_DATA_DIR=/data

# The only package is the optional Anthropic SDK; the app itself has no runtime dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY config.ts tsconfig.json ./
COPY src ./src
COPY web ./web

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GAVEL_PORT||8790)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "src/server.ts"]
