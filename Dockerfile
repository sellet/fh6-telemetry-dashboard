# syntax=docker/dockerfile:1

# --- build stage: compile the client bundle and the server ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# 1. Copia as configurações do projeto
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js ./

# 2. Copia as pastas de código-fonte originais para o contêiner
COPY shared ./shared
COPY src ./src

# 3. Copia o script atualizador para dentro do contêiner
COPY update-fh6-cars.mjs ./

# 4. Executa o script (ele vai ler a pasta shared copiada e reescrever o carLookup.ts com os dados novos)
RUN node update-fh6-cars.mjs

# 5. Compila o projeto TypeScript com a lista de carros já atualizada
RUN npm run build

# --- runtime stage: slim image with production dependencies only ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 8080/tcp
EXPOSE 20440/udp
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "dist/server/index.js"]