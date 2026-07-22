# syntax=docker/dockerfile:1.7

# Build React app
FROM node:20-alpine AS build

WORKDIR /app

ARG REACT_APP_API_URL
ARG REACT_APP_SOCKET_URL
ARG GIT_SHA

ENV REACT_APP_API_URL=${REACT_APP_API_URL} \
    REACT_APP_SOCKET_URL=${REACT_APP_SOCKET_URL} \
    GIT_SHA=${GIT_SHA}

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci --no-audit --no-fund --prefer-offline

COPY . .

RUN npm run build

# Serve with nginx
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
