FROM node:20-bookworm-slim

WORKDIR /app

# Create data directory for SQLite (mounted as volume)
RUN mkdir -p /data && chown -R node:node /data

COPY package.json ./
RUN npm install --omit=dev

COPY server.js db.js ./

USER node

EXPOSE 3000

CMD ["node", "server.js"]
