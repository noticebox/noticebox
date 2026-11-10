# Build: full deps, next build (standalone output).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime: only the standalone server and its traced deps.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 NOTICEBOX_DB=/data/noticebox.sqlite NOTICEBOX_CONFIG=/app/noticebox.json
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The server needs neither npm nor corepack, which bring their own dependencies (and their advisories) into the image;
# the base's packages are brought up to their fixed versions.
RUN apk upgrade --no-cache && apk add --no-cache su-exec && mkdir /data && chown node:node /data \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
