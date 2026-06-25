FROM node:20.20.2-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY package.json .npmrc ./

# Do not use a package-lock generated on another/private registry.
# Install from the public npm registry inside the image, then verify imports properly.
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
  && node --input-type=module -e "await import('express'); await import('helmet'); await import('qrcode'); console.log('dependencies ok')" \
  && npm cache clean --force

COPY server.js ./
COPY ech-updater-data ./ech-updater-data
COPY public ./public

RUN mkdir -p /app/data \
  && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
