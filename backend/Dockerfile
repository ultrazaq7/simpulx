FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3002

WORKDIR /app

RUN addgroup -S simpulx && \
    adduser -S simpulx -G simpulx && \
    mkdir -p /var/lib/simpulx/uploads && \
    chown -R simpulx:simpulx /app /var/lib/simpulx

COPY --from=build --chown=simpulx:simpulx /app/package*.json ./
COPY --from=build --chown=simpulx:simpulx /app/node_modules ./node_modules
COPY --from=build --chown=simpulx:simpulx /app/dist ./dist

USER simpulx

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
