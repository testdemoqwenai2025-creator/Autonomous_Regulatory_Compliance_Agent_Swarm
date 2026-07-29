# Multi-stage Golang build
FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /mttr-tracker ./cmd/mttr_tracker

# Runtime image
FROM alpine:3.19
RUN apk add --no-cache ca-certificates sqlite

COPY --from=builder /mttr-tracker /usr/local/bin/mttr-tracker

EXPOSE 8080

ENTRYPOINT ["mttr-tracker"]
CMD []