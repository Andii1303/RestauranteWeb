FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY src ./src
COPY public ./public
EXPOSE 4000
CMD ["npm","start"]