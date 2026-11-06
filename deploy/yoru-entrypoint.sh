#!/bin/sh
# Запуск контейнера Yoru: от root только выставляем владельца папки data (её часто создаёт сам Docker
# от root), затем сервер работает от пользователя node.
set -e
DATA_DIR="${DATA_DIR:-/app/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  chmod 700 "$DATA_DIR"
  exec su-exec node "$@"
fi
exec "$@"
