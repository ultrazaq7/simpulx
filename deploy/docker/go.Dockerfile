# Multi-stage build untuk service Go. Context build = repo root.
# ARG SERVICE memilih binary mana yang dibuild (gateway|messaging|realtime).
FROM golang:alpine AS build
ARG SERVICE
WORKDIR /src
RUN apk add --no-cache git
ENV GOFLAGS=-mod=mod
COPY go.mod ./
COPY libs ./libs
COPY db ./db
COPY services ./services
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/app ./services/${SERVICE}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget ffmpeg
WORKDIR /app
COPY --from=build /out/app /app/app
ENTRYPOINT ["/app/app"]
