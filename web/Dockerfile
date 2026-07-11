# Next.js production image (standalone). Build context = ./web
# NEXT_PUBLIC_* are inlined at BUILD time, so they're passed as build args.
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Don't download puppeteer's bundled Chromium (it's glibc; we use Alpine's system
# chromium at runtime). Saves image size and avoids a musl/glibc mismatch.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
# WhatsApp Embedded Signup (Channels > Create Channel > Login with Facebook).
# Public values, safe to inline; the gateway holds the App Secret server-side.
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_CONFIG_ID
# Display-only: shown in the Direct Cloud API path so users can configure Meta's
# webhook. Must equal META_VERIFY_TOKEN on the gateway.
ARG NEXT_PUBLIC_META_VERIFY_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID \
    NEXT_PUBLIC_META_CONFIG_ID=$NEXT_PUBLIC_META_CONFIG_ID \
    NEXT_PUBLIC_META_VERIFY_TOKEN=$NEXT_PUBLIC_META_VERIFY_TOKEN \
    NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:20-alpine AS run
WORKDIR /app
# Chromium + fonts so puppeteer can render the headless PDF reports.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Standalone output bundles a minimal server + only the deps it needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
