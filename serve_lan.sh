#!/usr/bin/env bash
# 局域网静态服务控制脚本 —— 把 robot_arm/ 下的 3D 模型页面发布到局域网。
#
# 用法:
#   ./serve_lan.sh start     启动（或重启）服务     默认端口 8123
#   ./serve_lan.sh stop      停止服务
#   ./serve_lan.sh status    查看状态与访问地址
#
# 说明: 服务由 launchd 用户代理 com.myarm.robotarm.http 托管（RunAtLoad + KeepAlive），
#       掉线自动拉起、登录后自动启动，不依赖任何终端；日志 /tmp/myarm-http-8123.log。
#       端口/目录变了改 ~/Library/LaunchAgents/com.myarm.robotarm.http.plist 后重新 start。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.myarm.robotarm.http.plist"
LABEL="com.myarm.robotarm.http"
DOMAIN="gui/$(id -u)"
PORT="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:3' "$PLIST" 2>/dev/null || echo 8123)"

urls() {
  for ip in $(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2}'); do
    echo "  http://$ip:$PORT/   (arm / finger / hand_mechanism_3d.html)"
  done
}

case "${1:-start}" in
  start)
    if [ ! -f "$PLIST" ]; then echo "缺少 $PLIST"; exit 1; fi
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    sleep 1
    echo "服务已启动（launchd: ${LABEL}，监听 0.0.0.0:${PORT}）"
    urls
    ;;
  stop)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    echo "服务已停止"
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "运行中（launchd: ${LABEL}，监听 0.0.0.0:${PORT}）"
      urls
    else
      echo "未运行；执行 ./serve_lan.sh start 启动"
    fi
    ;;
  *)
    echo "用法: $0 {start|stop|status}"; exit 1;;
esac
