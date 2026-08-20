# The org daemon's cloud image (Railway auto-detects this Dockerfile).
# The console (web/) is NOT in here — it deploys to Vercel separately.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    TZ=America/Detroit \
    BRAIN_PATH=brain
COPY package.json package-lock.json ./
# tsx runs the daemon and lives in devDependencies — install everything.
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
# Fetch doctrine at boot (every restart = doctrine refresh), then hand the
# process over to the daemon (exec: SIGTERM reaches it directly on redeploys).
CMD ["sh", "-c", "node scripts/fetch-brain.mjs && exec npx tsx src/cli.ts daemon"]
