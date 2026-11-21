FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS builder

# ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG VERSION
WORKDIR /app
COPY . .

# The npm version comes from packageManager in package.json, which Renovate updates.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')" && npm ci
RUN npm version "${VERSION:?VERSION build argument is required}" --no-git-tag-version --allow-same-version
RUN npm run build


FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runner

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
