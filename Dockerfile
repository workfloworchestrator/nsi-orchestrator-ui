FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS builder

# ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG VERSION
WORKDIR /app
COPY . .

# The npm version comes from packageManager in package.json, which Renovate updates.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')" && npm ci
RUN npm version "${VERSION:?VERSION build argument is required}" --no-git-tag-version --allow-same-version
RUN npm run build


FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS runner

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
