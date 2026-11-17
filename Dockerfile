# syntax=docker/dockerfile:1
# Imagem da API. Troque a base se o cluster exigir um registro interno ou imagens UBI
# (ex.: --build-arg NODE_IMAGE=registry.access.redhat.com/ubi9/nodejs-22-minimal).
ARG NODE_IMAGE=docker.io/library/node:22-alpine

# ---- build: instala tudo, empacota o servidor e depois remove as dependências de desenvolvimento ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: só o servidor empacotado e as dependências de produção ----
FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# OpenShift (SCC "restricted") roda o contêiner com um UID aleatório e GID 0: o grupo 0 precisa ter o mesmo acesso do dono.
RUN chgrp -R 0 /app && chmod -R g=u /app
USER 1001
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
