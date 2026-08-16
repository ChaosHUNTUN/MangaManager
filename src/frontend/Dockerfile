# ====== 构建阶段 ======
FROM node:22-alpine AS build
WORKDIR /src

COPY src/frontend/manga-ui/package.json src/frontend/manga-ui/package-lock.json* ./
RUN npm ci

COPY src/frontend/manga-ui/ .
RUN npm run build

# ====== 运行阶段 ======
FROM nginx:latest

# 覆盖默认 nginx 配置
COPY src/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80
