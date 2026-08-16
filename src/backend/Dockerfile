# ====== 构建阶段 ======
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# 复制项目文件（分层利用缓存）
COPY src/backend/MangaManager.Api/MangaManager.Api.csproj       MangaManager.Api/
COPY src/backend/MangaManager.Services/MangaManager.Services.csproj MangaManager.Services/
COPY src/backend/MangaManager.Data/MangaManager.Data.csproj     MangaManager.Data/
COPY src/backend/MangaManager.Core/MangaManager.Core.csproj     MangaManager.Core/
RUN dotnet restore MangaManager.Api/MangaManager.Api.csproj

# 复制源码并发布
COPY src/backend/ .
RUN dotnet publish MangaManager.Api/MangaManager.Api.csproj -c Release -o /app --no-restore

# ====== 运行阶段 ======
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

# 创建持久化目录
RUN mkdir -p /app/data /app/downloads

ENV ASPNETCORE_URLS=http://0.0.0.0:5208
ENV EHENTAI__DOWNLOADDIR=/app/downloads

COPY --from=build /app .

EXPOSE 5208
ENTRYPOINT ["dotnet", "MangaManager.Api.dll"]
