FROM oven/bun:alpine as builder

WORKDIR /app

COPY package.json .
COPY bun.lockb .

RUN bun install --production

COPY src src
COPY tsconfig.json .

ENV NODE_ENV production
RUN bun build ./src/index.ts --compile --outfile ./server

# ? -------------------------
FROM gcr.io/distroless/base

COPY --from=builder /app/server /server

CMD ["/server"]

EXPOSE 3000
