# ─── Frontend Dockerfile (Next.js standalone build) ───────────────────────────
#
# NEXT_PUBLIC_API_URL is embedded into the JS bundle at build time.
# Pass it as a build arg:
#   docker build --build-arg NEXT_PUBLIC_API_URL=http://<EC2_IP>:5001 .
#
# Two-stage build keeps the final image small (~200 MB vs ~1 GB).

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Accept the public API URL at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Source
COPY . .

# Build Next.js (standalone output enabled in next.config.ts)
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# next.config.ts output:"standalone" copies only what the server needs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public

EXPOSE 3000

# Start the standalone server (no next-start / npm needed)
CMD ["node", "server.js"]
