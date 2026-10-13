# syntax=docker/dockerfile:1
#
# 众爱联盟 全栈镜像（后端 Nuxt 4 + 前端 unibest H5，单镜像集成数据库迁移）
#
# 构建上下文为仓库根目录（backend/ 与 frontend/ 两个独立工程）：
#   docker build -t zalm-app .
#
# 启动（不迁移，直接对外服务）：
#   docker run --rm -p 9999:9999 --env-file backend/.env zalm-app
#
# 启动（启动前自动执行数据库迁移，迁移成功后才启动应用；失败则容器退出）：
#   docker run --rm -p 9999:9999 \
#     -e RUN_DB_MIGRATION=true --env-file backend/.env zalm-app
#
# 访问入口：
#   http://domain/        → 管理后台（Nuxt SSR 页面）
#   http://domain/h5/     → H5 端应用（unibest，hash 路由，VITE_APP_PUBLIC_BASE=/h5/）
#   http://domain/api/**  → REST API（H5 以相对路径 /api 同源访问，自动携带会话 Cookie）
#
# 运行时环境变量：
#   RUN_DB_MIGRATION  true/1/yes 时，容器入口先执行 drizzle 迁移再启动应用；
#                     未设置或 false/0/no（默认）时跳过迁移直接启动。
#   其余必须注入的变量见 backend/.env.example（至少 DATABASE_URL、BETTER_AUTH_URL、
#   BETTER_AUTH_SECRET）；容器不内置任何 .env 文件。

# ---------- 前端：依赖安装（Node 20 + Bun 安装器）----------
# 注意：H5 构建必须用真正的 Node 运行，不能用 Bun 运行时。
# Bun 1.4.0（Linux）在 Vite 经 esbuild 打包加载配置的上下文下，createRequire 的相对路径
# 解析存在缺陷，会导致 jiti（../dist/babel.cjs）、css-tree（../data/patch.json）等
# 相对 require 全部失败、构建中断（文件实际存在，Node 下正常）。
# 依赖仍按项目统一约定用 Bun 依据 bun.lock 安装，仅构建进程使用 Node。
FROM node:20-bookworm-slim AS frontend-deps
WORKDIR /app/frontend
RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g bun@1.4.0
# 仅复制清单以最大化利用层缓存；--ignore-scripts 跳过 prepare（husky 需要 git 仓库），
# 构建所需的基础文件在 build 阶段显式生成。网络抖动导致安装失败时自动重试。
COPY frontend/package.json frontend/bun.lock ./
RUN sh -c '\
      for i in 1 2 3; do \
        bun install --frozen-lockfile --ignore-scripts && exit 0; \
        echo "bun install 失败，第 ${i} 次重试..."; sleep 3; \
      done; exit 1'

# ---------- 前端：H5 构建（Node 运行） ----------
FROM frontend-deps AS frontend-build
COPY frontend/ .
# 镜像内 H5 固定部署在 /h5/（与后端 .output/public/h5 的目录布局一一对应）。
# 构建期强制规范该值，避免本地 env/.env 被改成其他基址（如 /app/）后产物路径失配。
RUN sed -i 's|^VITE_APP_PUBLIC_BASE=.*|VITE_APP_PUBLIC_BASE=/h5/|' env/.env \
    && sed -i 's|open: true,|open: false,|' vite.config.ts
# 固定 H5 平台；SKIP_OPEN_DEVTOOLS 阻止构建期尝试拉起微信开发者工具
ENV UNI_PLATFORM=h5 \
    SKIP_OPEN_DEVTOOLS=true
# init-baseFiles 生成 src/manifest.json、src/pages.json（gitignore 的生成物）；
# 直接调用 uni CLI（Node）构建 H5
RUN node ./scripts/create-base-files.js \
    && node ./node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build
# 产物：/app/frontend/dist/build/h5

# ---------- 后端：基础与依赖安装 ----------
FROM oven/bun:1.4.0 AS base
WORKDIR /app

FROM base AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN sh -c '\
      for i in 1 2 3; do \
        bun install --frozen-lockfile --ignore-scripts && exit 0; \
        echo "bun install 失败，第 ${i} 次重试..."; sleep 3; \
      done; exit 1'

# ---------- 后端：构建 ----------
FROM backend-deps AS backend-build
COPY backend/ .
# H5 产物必须在 nuxt build 之前放进 public/h5：Nitro 静态资源按构建期清单
# （.output/server 内的 assets manifest + index.html 回退）服务，构建后再拷入
# .output/public 不会被服务。构建后 public/h5 原样进入 .output/public/h5/。
COPY --from=frontend-build /app/frontend/dist/build/h5 ./public/h5
# 首页配置了 prerender，预渲染会执行服务端代码，getEnv() 会 fail-fast 校验必填环境变量。
# 构建上下文不含 backend/.env（.dockerignore 已排除），这里仅以行内变量给占位值通过校验；
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

# 1) Nitro 自包含产物（server/index.mjs + 打包依赖 + public 静态资源，含 public/h5 的 H5 应用）
COPY --chown=bun:bun --from=backend-build /app/backend/.output ./.output
# 2) 内置数据库迁移所需全部资源：迁移入口脚本 + drizzle SQL/meta + 三个零传递依赖的运行时包
COPY --chown=bun:bun --from=backend-build /app/backend/scripts/migrate.ts ./scripts/migrate.ts
COPY --chown=bun:bun --from=backend-build /app/backend/drizzle ./drizzle
COPY --chown=bun:bun --from=backend-build /app/backend/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=bun:bun --from=backend-build /app/backend/node_modules/postgres ./node_modules/postgres
COPY --chown=bun:bun --from=backend-build /app/backend/node_modules/dotenv ./node_modules/dotenv
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
