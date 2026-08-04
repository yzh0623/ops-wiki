#!/usr/bin/env bash
#
# ops-wiki 一键启动脚本
# 用法:
#   ./run.sh start    启动服务（后台运行）
#   ./run.sh stop     停止服务
#   ./run.sh restart  重启服务
#   ./run.sh status   查看运行状态
#
set -euo pipefail

# ---- 路径与运行参数 ----
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# conda 环境名称和路径（可根据实际情况改动）
CONDA_ENV="ops"
CONDA_BASE="${HOME}/Documents/anaconda3"
PYTHON_BIN="${CONDA_BASE}/envs/${CONDA_ENV}/bin/python"

# conda 初始化（用于激活环境）
source "${CONDA_BASE}/etc/profile.d/conda.sh"

# 日志目录（可根据实际情况改动）
LOG_DIR="/Users/yuanzhenhui/Documents/document_file/tmp/ops-wiki"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/ops-wiki.log"
PID_FILE="${LOG_DIR}/ops-wiki.pid"

HOST="0.0.0.0"
PORT="5100"

# 启动模式: dev=Flask 内置服务器, gunicorn=生产（需安装 gunicorn）
MODE="${OPS_WIKI_MODE:-dev}"

# ---- 工具函数 ----
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
    find "$PROJECT_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

    local cmd
    if [[ "${MODE}" == "gunicorn" ]]; then
        cmd=("${PYTHON_BIN}" -m gunicorn -w 4 -b "${HOST}:${PORT}" wsgi:app)
    else
        cmd=("${PYTHON_BIN}" wsgi.py)
    fi

    # 后台启动，stdout/stderr 都进日志，记录 PID
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
