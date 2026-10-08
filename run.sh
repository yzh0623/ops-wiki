#!/usr/bin/env bash
#
# ops-wiki 一键启动脚本 / one-shot start/stop/restart script
# 用法 / Usage:
#   ./run.sh start    启动服务（后台运行）/ start in the background
#   ./run.sh stop     停止服务 / stop
#   ./run.sh restart  重启服务 / restart
#   ./run.sh status   查看运行状态 / show status
#
set -euo pipefail

# ---- 路径与运行参数 / paths and runtime options ----
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# conda 环境名称和安装位置（改成你自己的）/ conda env name and install prefix (change these)
CONDA_ENV="wiki"
CONDA_BASE="/home/yzh/.conda"
PYTHON_BIN="${CONDA_BASE}/envs/${CONDA_ENV}/bin/python"

# conda 初始化脚本，用于 activate（改成你自己的路径）
# conda init script used by `conda activate` (change this path too)
source "/root/miniconda3/etc/profile.d/conda.sh"

# 日志与 PID 文件目录（改成你自己的，需可写）
# log and PID directory (change it; must be writable)
LOG_DIR="/home/yzh/Documents/logs/ops-wiki"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/ops-wiki.log"
PID_FILE="${LOG_DIR}/ops-wiki.pid"

# 监听地址与端口；自用建议把 HOST 改成 127.0.0.1，不要暴露到公网
# bind address and port; use 127.0.0.1 for personal use and never expose it publicly
HOST="0.0.0.0"
PORT="5100"

# 启动模式: dev=Flask 内置服务器, gunicorn=生产（需安装 gunicorn）
# Mode: dev = Flask dev server, gunicorn = production (gunicorn required)
MODE="${OPS_WIKI_MODE:-dev}"

# gunicorn worker 数：固定为 1，不要调大。
# 语义检索的 embedding 模型常驻约 2.7GB，每个 worker 都会各自加载一份；
# 而且「保存后向量转换完成」的提示事件存在进程内存里，多 worker 时保存与轮询
# 可能落在不同进程，前端就收不到 toast。
# Workers: pinned to 1 on purpose. The embedding model is resident at ~2.7GB and
# every worker would load its own copy; async re-index events also live in process
# memory, so with several workers the save and the polling request can land in
# different processes and the toast never shows.
WORKERS=1

# ---- 工具函数 / helpers ----
is_running() {
    [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null
}

start() {
    if is_running; then
        echo "ops-wiki 已在运行 (PID $(cat "${PID_FILE}"))"
        return 0
    fi

    echo "正在启动 ops-wiki (mode=${MODE}) ..."
    conda activate "${CONDA_ENV}"

    cd "${PROJECT_DIR}"
    # 清掉旧的字节码缓存，避免加载到过期的 .pyc
    # Drop stale bytecode so an out-of-date .pyc is never imported
    find "$PROJECT_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

    local cmd
    if [[ "${MODE}" == "gunicorn" ]]; then
        cmd=("${PYTHON_BIN}" -m gunicorn -w "${WORKERS}" -b "${HOST}:${PORT}" wsgi:app)
    else
        cmd=("${PYTHON_BIN}" wsgi.py)
    fi

    # 后台启动，stdout/stderr 都进日志，记录 PID
    # Start in the background, redirect output to the log and record the PID
    nohup "${cmd[@]}" >> "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"

    sleep 2
    if is_running; then
        echo "启动成功! PID=$(cat "${PID_FILE}")"
        echo "访问地址: http://localhost:${PORT}"
        echo "日志文件: ${LOG_FILE}"
    else
        echo "启动失败，请查看日志: ${LOG_FILE}"
        rm -f "${PID_FILE}"
        exit 1
    fi
}

stop() {
    if ! is_running; then
        echo "ops-wiki 未运行"
        rm -f "${PID_FILE}"
        return 0
    fi
    local pid
    pid="$(cat "${PID_FILE}")"
    echo "正在停止 ops-wiki (PID ${pid}) ..."
    # 先发 SIGTERM 等待退出，超时再强杀
    # Try SIGTERM first, then force-kill if it does not exit in time
    kill "${pid}"
    for _ in $(seq 1 10); do
        kill -0 "${pid}" 2>/dev/null || break
        sleep 1
    done
    if kill -0 "${pid}" 2>/dev/null; then
        echo "进程未退出，强制结束"
        kill -9 "${pid}" || true
    fi
    rm -f "${PID_FILE}"
    echo "已停止"
}

status() {
    if is_running; then
        echo "ops-wiki 运行中 (PID $(cat "${PID_FILE}"))"
        echo "日志文件: ${LOG_FILE}"
    else
        echo "ops-wiki 未运行"
    fi
}

case "${1:-start}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
