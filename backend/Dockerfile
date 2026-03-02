# ─── Backend Dockerfile ────────────────────────────────────────────────────────
# Node 20 slim — small and production-ready
FROM node:20-slim

WORKDIR /app

# Install dependencies first (layer cached unless package.json changes)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Env vars are supplied at runtime via docker-compose / EC2 env — NOT baked in here
# Required at runtime:
#   PORT              (default 5001)
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   JWT_SECRET
#   CORS_ORIGIN       (e.g. http://<EC2_IP>:3000 or https://yourdomain.com)

EXPOSE 5001

CMD ["node", "src/index.js"]
