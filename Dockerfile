FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS builder

# ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG VERSION
WORKDIR /app
COPY . .

# The npm version comes from packageManager in package.json, which Renovate updates.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')" && npm ci
RUN npm version "${VERSION:?VERSION build argument is required}" --no-git-tag-version --allow-same-version
RUN npm run build


FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runner

# ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone /app
COPY --from=builder /app/.next/static /app/.next/static
COPY --from=builder /app/public /app/public

WORKDIR /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
