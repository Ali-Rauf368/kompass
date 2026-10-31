# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci --workspace apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm -w apps/web run build

FROM nginx:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
