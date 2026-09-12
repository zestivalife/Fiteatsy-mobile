import { closePool } from '../db/pool.js';
import { refreshFoodExplorerProjection } from '../modules/nutrition/common-food-consultant.service.js';

try {
  const result=await refreshFoodExplorerProjection();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await closePool();
}
