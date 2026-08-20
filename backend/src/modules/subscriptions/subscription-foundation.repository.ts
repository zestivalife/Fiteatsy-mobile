import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { calculateGstForPlan } from './gst.js';

type Queryable = Pick<PoolClient, 'query'>;

export type FoundationEntitlement = {
  code: string;
  valueType: 'BOOLEAN' | 'LIMIT' | 'ENUM';
  booleanValue: boolean | null;
  limitValue: number | null;
  enumValue: string | null;
};

const parseBenefits = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const mapPlan = (row: Record<string, unknown>) => ({
  id: String(row.id),
  code: String(row.code),
  name: String(row.name),
  description: String(row.description),
  priceMinor: Number(row.price_minor),
  ...calculateGstForPlan(String(row.code), Number(row.price_minor)),
  currency: String(row.currency),
  durationDays: Number(row.duration_days),
  durationMonths: Number(row.duration_months),
  dailyCostMinor: Math.ceil(Number(row.price_minor) / Number(row.duration_days)),
  isActive: Boolean(row.is_active),
  developmentOnly: !['WELLNESS_TRACKING_6M', 'WELLNESS_TRACKING_12M'].includes(String(row.code)),
  recommended: Boolean(row.is_featured),
  badge: row.badge == null ? null : String(row.badge),
  displayOrder: Number(row.display_order),
  version: {
    id: String(row.version_id),
    number: Number(row.version_number),
    effectiveFromISO: new Date(String(row.effective_from)).toISOString(),
    effectiveToISO: row.effective_to == null ? null : new Date(String(row.effective_to)).toISOString(),
    termsText: String(row.terms_text)
  },
  benefits: parseBenefits(row.benefits),
  entitlements: Array.isArray(row.entitlements) ? row.entitlements.map((item) => String((item as { code?: unknown }).code ?? '')) : [],
  entitlementValues: Array.isArray(row.entitlements) ? row.entitlements : []
});

const planQuery = `
  select
    plans.id,
    plans.code,
    plans.name,
    plans.description,
    plans.is_active,
    plans.is_featured,
    plans.badge,
    plans.display_order,
    versions.id as version_id,
    versions.version_number,
    versions.price_minor,
    versions.currency,
    versions.duration_days,
    versions.duration_months,
    versions.benefits,
    versions.terms_text,
    versions.effective_from,
    versions.effective_to,
    coalesce(jsonb_agg(jsonb_build_object(
      'code', version_entitlements.entitlement_code,
      'valueType', registry.value_type,
      'booleanValue', version_entitlements.boolean_value,
      'limitValue', version_entitlements.limit_value,
      'enumValue', version_entitlements.enum_value
    ) order by version_entitlements.entitlement_code) filter (where version_entitlements.entitlement_code is not null), '[]'::jsonb) as entitlements
  from subscription_plans plans
  join subscription_plan_versions versions on versions.plan_id = plans.id and versions.effective_to is null
  left join subscription_plan_version_entitlements version_entitlements on version_entitlements.plan_version_id = versions.id
  left join subscription_entitlement_registry registry on registry.code = version_entitlements.entitlement_code
`;

export const listFoundationPlans = async (db: Queryable = pool) => {
  const result = await db.query(`${planQuery} where plans.is_active = true group by plans.id, versions.id order by plans.display_order asc, plans.name asc`);
  return result.rows.map(mapPlan);
};

export const getFoundationPlan = async (planId: string, db: Queryable = pool) => {
  const result = await db.query(`${planQuery} where plans.id = $1 and plans.is_active = true group by plans.id, versions.id limit 1`, [planId]);
  return result.rowCount ? mapPlan(result.rows[0]) : null;
};

const mapSubscription = (row: Record<string, unknown>) => ({
  id: String(row.id),
  planId: String(row.plan_id),
  planVersionId: row.plan_version_id == null ? null : String(row.plan_version_id),
  planCode: String(row.plan_code_snapshot ?? row.plan_code),
  planName: String(row.plan_name_snapshot ?? row.plan_name),
  status: String(row.status),
  startsAtISO: row.starts_at == null ? null : new Date(String(row.starts_at)).toISOString(),
  expiresAtISO: row.expires_at == null ? null : new Date(String(row.expires_at)).toISOString(),
  durationDays: Number(row.duration_days_snapshot ?? 0),
  amountMinor: Number(row.amount_paid_minor),
  currency: String(row.currency),
  autoRenew: Boolean(row.auto_renew)
});

export const getLatestSubscription = async (userId: string, db: Queryable = pool) => {
  const result = await db.query(`
    select subscriptions.*, plans.code as plan_code, plans.name as plan_name
    from user_subscriptions subscriptions
    join subscription_plans plans on plans.id = subscriptions.plan_id
    where subscriptions.user_id = $1
    order by subscriptions.created_at desc
    limit 1
  `, [userId]);
  return result.rowCount ? mapSubscription(result.rows[0]) : null;
};

export const getLatestPaymentState = async (userId: string, db: Queryable = pool) => {
  const result = await db.query(`
    select status
    from payment_orders
    where user_id = $1
      and status in ('CREATED', 'ATTEMPTED', 'FAILED')
    order by updated_at desc
    limit 1
  `, [userId]);
  return result.rowCount ? String(result.rows[0].status) : null;
};

export const listSubscriptionHistory = async (userId: string, db: Queryable = pool) => {
  const result = await db.query(`
    select subscriptions.*, plans.code as plan_code, plans.name as plan_name
    from user_subscriptions subscriptions
    join subscription_plans plans on plans.id = subscriptions.plan_id
    where subscriptions.user_id = $1
    order by subscriptions.created_at desc
    limit 50
  `, [userId]);
  return result.rows.map(mapSubscription);
};

export const listEffectiveEntitlements = async (userId: string, db: Queryable = pool) => {
  const result = await db.query(`
    select registry.code, registry.value_type, version_entitlements.boolean_value, version_entitlements.limit_value, version_entitlements.enum_value
    from user_subscriptions subscriptions
    join subscription_plan_versions versions on versions.id = subscriptions.plan_version_id
    join subscription_plan_version_entitlements version_entitlements on version_entitlements.plan_version_id = versions.id
    join subscription_entitlement_registry registry on registry.code = version_entitlements.entitlement_code
    where subscriptions.user_id = $1
      and subscriptions.status in ('ACTIVE', 'CANCELLED')
      and subscriptions.starts_at <= now()
      and subscriptions.expires_at > now()
      and subscriptions.revoked_at is null
  `, [userId]);
  return result.rows.map((row) => ({
    code: String(row.code),
    valueType: String(row.value_type) as FoundationEntitlement['valueType'],
    booleanValue: row.boolean_value == null ? null : Boolean(row.boolean_value),
    limitValue: row.limit_value == null ? null : Number(row.limit_value),
    enumValue: row.enum_value == null ? null : String(row.enum_value)
  }));
};

export const recordFoundationEvent = async (input: { userId: string; subscriptionId?: string | null; eventType: string; metadata?: Record<string, unknown> }, db: Queryable = pool) => {
  await db.query(`insert into subscription_events (id, user_id, user_subscription_id, event_type, metadata) values ($1, $2, $3, $4, $5::jsonb)`, [
    crypto.randomUUID(), input.userId, input.subscriptionId ?? null, input.eventType, JSON.stringify(input.metadata ?? {})
  ]);
};
