FROM oven/bun:slim AS builder

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lockb tsconfig.json ./
RUN bun install --production --no-cache

COPY src src

RUN bun build \
  --compile \
  --minify-whitespace \
  --minify-syntax \
  --target bun \
  --outfile server \
  ./src/index.ts

# ? -------------------------

FROM gcr.io/distroless/base:nonroot

COPY --from=builder /app/server .

CMD ["./server"]

EXPOSE 3000
