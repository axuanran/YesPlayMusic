FROM node:22-alpine AS build
ENV VUE_APP_NETEASE_API_URL=/api
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package.json yarn.lock ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN corepack enable && WORKERS_CI=1 yarn install --frozen-lockfile --ignore-engines
COPY . .
RUN yarn build

FROM node:22-alpine AS app

WORKDIR /app

RUN apk add --no-cache nginx

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --ignore-engines --production --ignore-scripts

COPY --from=build /app/dist /usr/share/nginx/html
COPY admin ./admin
COPY server ./server
COPY docker/nginx.conf.example /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /usr/local/bin/yesplaymusic-docker-entrypoint

ENV NODE_ENV=production \
    VUE_APP_NETEASE_API_URL=/api \
    YPM_RESOLVER_STORAGE_DIR=/data/resolver-storage \
    NETEASE_API_PORT=10754

EXPOSE 80
VOLUME ["/data"]

RUN chmod +x /usr/local/bin/yesplaymusic-docker-entrypoint

CMD ["yesplaymusic-docker-entrypoint"]
