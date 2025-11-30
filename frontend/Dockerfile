# Frontend multi-stage Dockerfile: build with Node, serve with nginx

# Build stage
FROM node:22-alpine AS build
WORKDIR /app

# Copy .env.build and load it
COPY .env.build .env.build
RUN set -a && . ./.env.build && set +a

ARG VITE_API_URL
ARG VITE_TS_INVID

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_TS_INVID=${VITE_TS_INVID}

COPY package*.json ./
RUN npm ci --omit=dev || npm install

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
