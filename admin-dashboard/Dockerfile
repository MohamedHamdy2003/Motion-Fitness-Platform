FROM node:24-bookworm-slim AS build
WORKDIR /admin
COPY package.json package-lock.json ./
RUN npm ci --maxsockets=5 --fetch-retries=5
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /admin/dist /srv/admin
