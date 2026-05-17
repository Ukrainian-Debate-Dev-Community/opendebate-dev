# syntax=docker/dockerfile:1.7
# ---------- Stage 1: deps ----------
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN apk add --no-cache tini=0.19.0-r3
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json .sequelizerc ./
COPY --chown=node:node src ./src
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/app.js"]
