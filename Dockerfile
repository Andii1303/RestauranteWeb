# Dockerfile
#
# Imagen de Node para producir y ejecutar el backend.
# Etapas posibles: build (si se requiere transpilar) y runtime.
# Este proyecto usa ES Modules y no requiere build; instalamos deps y arrancamos.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src
COPY public ./public

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/server.js"]