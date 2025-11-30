# Backend Dockerfile - Node 22 (Alpine)
FROM node:22-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy app sources
COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
