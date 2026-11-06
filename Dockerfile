FROM node:22-alpine AS build
WORKDIR /app
COPY package.json vite.config.mjs index.html admin.html ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY server.js ./
COPY public ./public
COPY --from=build /app/dist ./dist
COPY deploy/yoru-entrypoint.sh /usr/local/bin/yoru-entrypoint.sh
RUN chmod +x /usr/local/bin/yoru-entrypoint.sh && mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5366 DATA_DIR=/app/data
EXPOSE 5366
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:5366/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# entrypoint чинит права на data (том с хоста) и запускает сервер от пользователя node
ENTRYPOINT ["/usr/local/bin/yoru-entrypoint.sh"]
CMD ["node", "server.js"]
