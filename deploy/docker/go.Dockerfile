# syntax=docker/dockerfile:1
# Multi-stage build untuk service Go. Context build = repo root.
# ARG SERVICE memilih binary mana yang dibuild (gateway|messaging|realtime|...).
# Built natively (CI runner arch = arm64). BuildKit cache mounts + a separate
# module-download layer keep rebuilds incremental.
FROM golang:alpine AS build
ARG SERVICE
WORKDIR /src
RUN apk add --no-cache git
ENV GOFLAGS=-mod=mod
# Download modules first so code changes don't re-fetch deps. Cached via mount.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download || true
COPY libs ./libs
COPY db ./db
COPY services ./services
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -o /out/app ./services/${SERVICE}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget ffmpeg
WORKDIR /app
COPY --from=build /out/app /app/app
ENTRYPOINT ["/app/app"]
