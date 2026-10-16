# ── build ─────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server && npm ci --prefix client
COPY server server
COPY client client
RUN npm run build --prefix client && npm run build --prefix server

# ── runtime ───────────────────────────────────────────
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY server/package*.json server/
RUN npm ci --omit=dev --prefix server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 4000
VOLUME ["/app/server/data"]
CMD ["node", "server/dist/index.js"]
