FROM oven/bun:slim AS builder

WORKDIR /app

COPY src src
COPY package.json bun.lockb tsconfig.json ./

ENV NODE_ENV=production

RUN bun install --production --no-cache
RUN bun build src/index.ts --compile --minify --outfile build/app

# ? -------------------------

FROM gcr.io/distroless/base:nonroot

COPY --from=builder /app/build .

CMD ["./app"]

EXPOSE 3000
