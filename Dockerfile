FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY .sequelizerc ./
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/app.js"]
