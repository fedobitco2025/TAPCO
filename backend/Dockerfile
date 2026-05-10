# ============================
# TAPCO Backend — Dockerfile
# ============================
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose API port
EXPOSE 4000

# Default command (overridden per-service in docker-compose.yml)
CMD ["node", "server.js"]
