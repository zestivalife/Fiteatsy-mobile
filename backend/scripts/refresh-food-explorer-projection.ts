import { closePool } from '../src/db/pool.js';
import { refreshFoodExplorerProjection } from '../src/modules/nutrition/common-food-consultant.service.js';

try {
  const result=await refreshFoodExplorerProjection();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await closePool();
}
