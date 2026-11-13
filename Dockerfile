# Veroniks: один контейнер — API, собранный фронт и бот (webhook).
FROM node:22-bookworm-slim

WORKDIR /app

# зависимости (кэшируются, пока не меняются package*.json)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY scripts/package.json scripts/
RUN npm ci --no-audit --no-fund

# исходники и сборка фронта
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/veroniks.db \
    BOT_MODE=webhook

# база SQLite — на постоянном диске (на Render/Railway подключается к /data)
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8787
CMD ["npm", "start"]
