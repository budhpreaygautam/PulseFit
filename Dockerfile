# PulseFit production image (Railway builds it; any Docker host can run it).
# The API serves the built website itself; the JSON database lives on a volume at /data.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix server --no-audit --no-fund && npm ci --prefix client --no-audit --no-fund
COPY server server
COPY client client
RUN npm run build --prefix server && npm run build --prefix client

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PULSEFIT_DB_PATH=/data/gym-db.json
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist
COPY deploy/docker-entrypoint.sh /usr/local/bin/pulsefit-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/pulsefit-entrypoint && chmod 0755 /usr/local/bin/pulsefit-entrypoint
EXPOSE 5004
ENTRYPOINT ["/usr/local/bin/pulsefit-entrypoint"]
CMD ["node", "dist/index.js"]
