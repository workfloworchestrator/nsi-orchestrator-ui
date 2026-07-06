FROM node:20-alpine AS builder

# ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY . .

RUN npm install -g npm@11.16.0 && npm ci
RUN npm run build


FROM node:20-alpine AS runner

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
