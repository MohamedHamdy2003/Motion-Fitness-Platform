FROM node:24-bookworm-slim AS build
WORKDIR /admin
COPY package.json package-lock.json ./
RUN npm ci --maxsockets=5 --fetch-retries=5
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /admin/dist /usr/share/nginx/html
EXPOSE 8080
