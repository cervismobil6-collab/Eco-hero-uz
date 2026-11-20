# Production Multi-Stage Build for EcoHero Platform (Google Cloud Run / Render / Docker ready)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions & npm config
COPY package*.json .npmrc* ./

# Install dependencies
RUN npm ci || npm install --include=optional

# Copy application source code
COPY . .

# Build frontend static bundle
RUN npm run build

# Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules and built assets
COPY package*.json .npmrc* ./
RUN (npm ci --omit=dev --include=optional || npm install --omit=dev --include=optional) && npm install --no-save tsx
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/server-db.ts ./
COPY --from=builder /app/server-security.ts ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/firebase-applet-config.json ./
COPY --from=builder /app/server-bot-config.json ./
RUN mkdir -p /app/public/uploads

EXPOSE 3000

CMD ["./node_modules/.bin/tsx", "server.ts"]
