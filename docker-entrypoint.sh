#!/bin/sh
# 众爱联盟 容器入口
#
# 行为由环境变量 RUN_DB_MIGRATION 控制：
#   true/1/yes（大小写不敏感）→ 先执行 drizzle 数据库迁移，成功后再启动主应用；
#   未设置 / false/0/no / 其他值 → 跳过迁移直接启动主应用。
# 迁移输出完整透传到容器日志；迁移失败时容器以非零码退出，主应用不会启动。

set -eu

log() {
  echo "[entrypoint] $*"
}

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

MIGRATION_VALUE="$(to_lower "${RUN_DB_MIGRATION:-}")"

case "$MIGRATION_VALUE" in
  true|1|yes)
    log "RUN_DB_MIGRATION='${RUN_DB_MIGRATION}'：启动前先执行数据库迁移（scripts/migrate.ts）"
    log "------------------------------------------------ 迁移日志开始 ------------------------------------------------"
    # set -e 下用 if 捕获退出码，确保能打印明确的失败日志并以原退出码终止容器
    if bun run scripts/migrate.ts; then
      log "------------------------------------------------ 迁移日志结束 ------------------------------------------------"
      log "数据库迁移成功，准备启动主应用"
    else
      rc=$?
      log "------------------------------------------------ 迁移日志结束 ------------------------------------------------"
      log "数据库迁移失败（退出码 ${rc}），为避免在数据库异常状态下提供服务，容器终止启动" >&2
      exit "$rc"
    fi
    ;;
  false|0|no|"")
    log "RUN_DB_MIGRATION='${RUN_DB_MIGRATION:-<未设置>}'：跳过数据库迁移，直接启动主应用"
    ;;
  *)
    log "RUN_DB_MIGRATION='${RUN_DB_MIGRATION}' 不是可识别值（true/1/yes 或 false/0/no），按不迁移处理"
    ;;
esac

log "启动主应用：$*"
exec "$@"
