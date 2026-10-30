FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json backend/tsconfig.catalogue-import.json ./
COPY backend/scripts ./scripts
COPY backend/src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/modules/nutrition/food-curation/data ./dist/modules/nutrition/food-curation/data
COPY --from=build /app/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx ./dist/catalogue-import/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx
COPY --from=build /app/dist/db/migrations ./dist/catalogue-import/src/db/migrations

RUN test -f ./dist/server.js \
  && test -f ./dist/db/migrations/0068_fiteatsy_client_tenant_integrity.sql \
  && test -f ./dist/db/migrations/0071_assignable_fiteatsy_identity_backfill.sql \
  && test -f ./dist/catalogue-import/src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx \
  && test -d ./dist/modules/nutrition/food-curation/data

EXPOSE 8080
CMD ["npm", "start"]
