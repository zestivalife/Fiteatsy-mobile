FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY packages/health-intelligence ./packages/health-intelligence
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

COPY backend/tsconfig.json backend/tsconfig.catalogue-import.json ./
COPY backend/build-info.json ./build-info.json
COPY backend/scripts ./scripts
COPY backend/src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app/backend
ENV NODE_ENV=production

COPY backend/package*.json ./
COPY --from=build /app/packages /app/packages
COPY --from=build /app/backend/build-info.json ./build-info.json
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/src/modules/nutrition/food-curation/data ./dist/modules/nutrition/food-curation/data
COPY --from=build /app/backend/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx ./dist/catalogue-import/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx
COPY --from=build /app/backend/dist/db/migrations ./dist/catalogue-import/src/db/migrations

EXPOSE 8080
CMD ["npm", "start"]
