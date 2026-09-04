FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.catalogue-import.json ./
COPY scripts ./scripts
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx ./dist/catalogue-import/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx
COPY --from=build /app/dist/db/migrations ./dist/catalogue-import/src/db/migrations

EXPOSE 8080
CMD ["npm", "start"]
