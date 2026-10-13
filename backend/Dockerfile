# syntax=docker/dockerfile:1
#
# 众爱联盟后端镜像（Nuxt 4 + Bun，单镜像集成数据库迁移）
# 结构与仓库根目录全栈 Dockerfile 一致，仅缺少前端 H5 部分。
#
# 构建上下文为 backend/ 目录（在 backend/ 下执行）：
#   docker build -t zalm-backend .
#
# 启动（不迁移，直接对外服务）：
#   docker run --rm -p 9999:9999 --env-file .env zalm-backend
#
# 启动（启动前自动执行数据库迁移，迁移成功后才启动应用；失败则容器退出）：
#   docker run --rm -p 9999:9999 \
#     -e RUN_DB_MIGRATION=true --env-file .env zalm-backend
#
# 运行时环境变量：
#   RUN_DB_MIGRATION  true/1/yes 时，容器入口先执行 drizzle 迁移再启动应用；
#                     未设置或 false/0/no（默认）时跳过迁移直接启动。
#   其余必须注入的变量见 .env.example（至少 DATABASE_URL、BETTER_AUTH_URL、
#   BETTER_AUTH_SECRET）；容器不内置任何 .env 文件。
#
# 说明：种子脚本（server/database/seed.ts）依赖完整源码，不在运行镜像内，
# 请在本地或 CI 中执行；运行镜像仅内置迁移所需资源（scripts/migrate.ts + drizzle/ + 三个零传递依赖）。

# ---------- 基础 ----------
FROM oven/bun:1.4.0 AS base
WORKDIR /app

# ---------- 依赖安装 ----------
# 仅复制清单以最大化利用层缓存；--ignore-scripts 跳过 postinstall(nuxt prepare)，
# 此阶段还没有源码与 nuxt.config.ts，prepare 会在后续 build 中自动执行。
# 网络抖动导致安装失败时自动重试。
FROM base AS backend-deps
COPY package.json bun.lock ./
RUN sh -c '\
      for i in 1 2 3; do \
        bun install --frozen-lockfile --ignore-scripts && exit 0; \
        echo "bun install 失败，第 ${i} 次重试..."; sleep 3; \
      done; exit 1'

# ---------- 构建 ----------
FROM backend-deps AS backend-build
COPY . .
# 首页配置了 prerender，预渲染会执行服务端代码，getEnv() 会 fail-fast 校验必填环境变量。
# 构建上下文不含 .env（.dockerignore 已排除），这里仅以行内变量给占位值通过校验；
# Nitro node-server 产物在运行时重新读取 process.env，真实值启动容器时注入，占位值不进入运行镜像。
RUN DATABASE_URL=postgresql://user:pass@localhost:5432/dbname \
    BETTER_AUTH_URL=http://localhost:9999 \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-0123456789abcdef \
    bun run build

# ---------- 唯一运行镜像（业务服务 + 数据库迁移二合一） ----------
FROM oven/bun:1.4.0-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=9999 \
    RUN_DB_MIGRATION=false

# 1) Nitro 自包含产物（server/index.mjs + 打包依赖 + public 静态资源）
COPY --chown=bun:bun --from=backend-build /app/.output ./.output
# 2) 内置数据库迁移所需全部资源：迁移入口脚本 + drizzle SQL/meta + 三个零传递依赖的运行时包
COPY --chown=bun:bun --from=backend-build /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --chown=bun:bun --from=backend-build /app/drizzle ./drizzle
COPY --chown=bun:bun --from=backend-build /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=bun:bun --from=backend-build /app/node_modules/postgres ./node_modules/postgres
COPY --chown=bun:bun --from=backend-build /app/node_modules/dotenv ./node_modules/dotenv
# 3) 容器入口：按 RUN_DB_MIGRATION 决定是否先迁移，再 exec 主进程
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# 兼容 Windows 检出可能产生的 CRLF 行尾
USER root
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh

USER bun
EXPOSE 9999

# /api/health 不查库、不鉴权；用 bun 内建 fetch 探测，slim 镜像无需额外安装 curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const p=process.env.NITRO_PORT||process.env.PORT||9999;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "run", ".output/server/index.mjs"]
