FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --maxsockets=5 --fetch-retries=5
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --offline

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3100
CMD ["node", "dist/main.js"]
