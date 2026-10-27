# Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG VITE_STORAGE_BACKEND=local
ARG VITE_STORAGE_URL=
ENV VITE_STORAGE_BACKEND=$VITE_STORAGE_BACKEND VITE_STORAGE_URL=$VITE_STORAGE_URL
RUN npm run build

# Serve (unprivileged nginx, port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
