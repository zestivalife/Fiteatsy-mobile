import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import type { HealthCalculationType, HealthMetrics } from './health-calculations.service.js';

const CALCULATION_TYPE_TO_DB: Record<HealthCalculationType, string> = {
  bmi: 'bmi',
  bmr: 'bmr',
  tdee: 'tdee',
  targetHeartRate: 'target_heart_rate',
  bodyFat: 'body_fat',
  oneRepMax: 'one_rep_max'
};

const calculationRows = (metrics: HealthMetrics) =>
  Object.entries(metrics).map(([type, metric]) => ({
    type: CALCULATION_TYPE_TO_DB[type as HealthCalculationType],
    metric
  }));

export const persistHealthCalculations = async (owner: ClientOwnershipContext, metrics: HealthMetrics) => {
  const rows = calculationRows(metrics);
  if (rows.length === 0) return [];

  const values: unknown[] = [];
  const placeholders = rows.map(({ type, metric }, index) => {
    const offset = index * 12;
    const calculatedValues = metric.status === 'AVAILABLE' ? metric.values ?? { value: metric.value } : {};
    values.push(
      `hcalc_${crypto.randomUUID()}`,
      owner.accountId,
      owner.clientId,
      type,
      metric.status,
      metric.status === 'AVAILABLE' ? metric.value : null,
      metric.unit,
      metric.category,
      JSON.stringify(metric.inputSnapshot),
      JSON.stringify(calculatedValues),
      metric.formulaVersion,
      metric.status === 'NOT_AVAILABLE' ? metric.reason : null
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, $${offset + 10}::jsonb, $${offset + 11}, $${offset + 12})`;
  });

  const result = await pool.query(
    `
      insert into health_calculations (
        id, user_id, client_id, calculation_type, status, value, unit, category,
        input_snapshot, calculated_values, formula_version, reason
      )
      values ${placeholders.join(', ')}
      returning id, calculation_type, status
    `,
    values
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    calculationType: String(row.calculation_type),
    status: String(row.status)
  }));
};
