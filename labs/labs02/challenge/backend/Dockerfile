FROM node:20-bookworm-slim

WORKDIR /app

RUN mkdir -p /data && chown -R node:node /data

COPY package.json ./
RUN npm install --omit=dev

COPY . ./

USER node

EXPOSE 3000

CMD ["node", "server.js"]
