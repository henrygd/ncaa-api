# -------------------- BUILD STAGE --------------------
  FROM oven/bun:slim AS builder

  WORKDIR /app
  
  ENV NODE_ENV=production
  
  # copy only the files needed for install
  COPY package.json bun.lockb tsconfig.json ./
  
  # install dependencies (skip frozen lockfile issues)
  RUN rm -f bun.lockb && bun install --production --no-cache
  
  # copy source after install for better cache usage
  COPY src ./src
  
  # build your app to a single binary
  RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --target bun \
    --outfile server \
    ./src/index.ts
  
  # -------------------- RUNTIME STAGE --------------------
  FROM gcr.io/distroless/base:nonroot
  
  WORKDIR /
  
  # copy built binary from builder stage
  COPY --from=builder /app/server .
  
  # expose port and define startup command
  EXPOSE 3000
  CMD ["./server"]
  