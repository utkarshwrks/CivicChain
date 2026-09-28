# CivicChain — production image (API + built frontend on one port)
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --include=dev --ignore-scripts
COPY . .
RUN cd frontend && npx vite build

FROM node:20-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY backend ./backend
COPY deployments ./deployments
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/index.js"]
