import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { EntitlementCode, PaymentOrderStatus, SubscriptionPlanDto, SubscriptionStatus } from './subscriptions.types.js';
import { calculateGstForPlan } from './gst.js';

type Queryable = Pick<PoolClient, 'query'>;

const toIso = (value: unknown) => (value == null ? null : new Date(String(value)).toISOString());
const parseBenefits = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapPlan = (row: Record<string, unknown>): SubscriptionPlanDto => ({
  id: String(row.id),
  code: String(row.code),
  name: String(row.name),
  description: String(row.description),
  durationDays: Number(row.duration_days),
  durationMonths: Number(row.duration_months),
  priceMinor: Number(row.price_minor),
  ...calculateGstForPlan(String(row.code), Number(row.price_minor)),
  currency: String(row.currency),
  isActive: Boolean(row.is_active),
  isFeatured: Boolean(row.is_featured),
  badge: row.badge == null ? null : String(row.badge),
  displayOrder: Number(row.display_order),
  benefits: parseBenefits(row.benefits),
  entitlements: String(row.entitlements ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) as EntitlementCode[]
});

export type PaymentOrderRecord = {
  id: string;
  userId: string;
  planId: string;
  provider: string;
  providerOrderId: string | null;
  amountMinor: number;
  baseAmountMinor: number;
  cgstRatePercent: number;
  cgstAmountMinor: number;
  sgstRatePercent: number;
  sgstAmountMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
  currency: string;
  status: PaymentOrderStatus;
  source: string | null;
  requiredEntitlement: string | null;
  returnDestination: string | null;
  idempotencyKey: string;
  createdAtISO: string;
  updatedAtISO: string;
};

const mapPaymentOrder = (row: Record<string, unknown>): PaymentOrderRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  planId: String(row.subscription_plan_id),
  provider: String(row.provider),
  providerOrderId: row.provider_order_id == null ? null : String(row.provider_order_id),
  amountMinor: Number(row.amount_minor),
  baseAmountMinor: Number(row.base_amount_minor ?? row.amount_minor),
  cgstRatePercent: Number(row.cgst_rate_percent ?? 0),
  cgstAmountMinor: Number(row.cgst_amount_minor ?? 0),
  sgstRatePercent: Number(row.sgst_rate_percent ?? 0),
  sgstAmountMinor: Number(row.sgst_amount_minor ?? 0),
  totalTaxMinor: Number(row.total_tax_minor ?? 0),
  totalAmountMinor: Number(row.total_amount_minor ?? row.amount_minor),
  currency: String(row.currency),
  status: String(row.status) as PaymentOrderStatus,
  source: row.source == null ? null : String(row.source),
  requiredEntitlement: row.required_entitlement == null ? null : String(row.required_entitlement),
  returnDestination: row.return_destination == null ? null : String(row.return_destination),
  idempotencyKey: String(row.idempotency_key),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString()
});

export type SubscriptionRecord = {
  id: string;
  userId: string;
  planId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  startsAtISO: string | null;
  expiresAtISO: string | null;
  amountPaidMinor: number;
  currency: string;
};

const mapSubscription = (row: Record<string, unknown>): SubscriptionRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  planId: String(row.plan_id),
  planCode: String(row.plan_code),
  planName: String(row.plan_name),
  status: String(row.status) as SubscriptionStatus,
  startsAtISO: toIso(row.starts_at),
  expiresAtISO: toIso(row.expires_at),
  amountPaidMinor: Number(row.amount_paid_minor),
  currency: String(row.currency)
});

export const listActiveSubscriptionPlans = async (db: Queryable = pool) => {
  const result = await db.query(
    `
      select
        plans.*,
        coalesce(string_agg(entitlements.entitlement_code, ',' order by entitlements.entitlement_code), '') as entitlements
      from subscription_plans plans
      left join plan_entitlements entitlements on entitlements.plan_id = plans.id
      where plans.is_active = true
      group by plans.id
      order by plans.display_order asc, plans.name asc
    `
  );
  return result.rows.map(mapPlan);
};

export const getActiveSubscriptionPlanById = async (planId: string, db: Queryable = pool) => {
  const result = await db.query(
    `
      select
        plans.*,
        coalesce(string_agg(entitlements.entitlement_code, ',' order by entitlements.entitlement_code), '') as entitlements
      from subscription_plans plans
      left join plan_entitlements entitlements on entitlements.plan_id = plans.id
      where plans.id = $1
        and plans.is_active = true
      group by plans.id
      limit 1
    `,
    [planId]
  );
  return result.rowCount === 0 ? null : mapPlan(result.rows[0]);
};

export const listActiveEntitlementsForUser = async (userId: string, db: Queryable = pool): Promise<EntitlementCode[]> => {
  const result = await db.query(
    `
      select distinct entitlements.entitlement_code
      from user_subscriptions subscriptions
      join plan_entitlements entitlements on entitlements.plan_id = subscriptions.plan_id
      where subscriptions.user_id = $1
        and subscriptions.status = 'ACTIVE'
        and subscriptions.revoked_at is null
        and subscriptions.starts_at <= now()
        and subscriptions.expires_at > now()
      order by entitlements.entitlement_code
    `,
    [userId]
  );
  return result.rows.map((row) => String(row.entitlement_code) as EntitlementCode);
};

export const getCurrentActiveSubscriptionForUser = async (userId: string, db: Queryable = pool) => {
  const result = await db.query(
    `
      select
        subscriptions.*,
        plans.code as plan_code,
        plans.name as plan_name
      from user_subscriptions subscriptions
      join subscription_plans plans on plans.id = subscriptions.plan_id
      where subscriptions.user_id = $1
        and subscriptions.status = 'ACTIVE'
        and subscriptions.revoked_at is null
        and subscriptions.starts_at <= now()
        and subscriptions.expires_at > now()
      order by subscriptions.expires_at desc
      limit 1
    `,
    [userId]
  );
  return result.rowCount === 0 ? null : mapSubscription(result.rows[0]);
};

export const findPaymentOrderByProviderOrderId = async (providerOrderId: string, db: Queryable = pool) => {
  const result = await db.query(
    `
      select *
      from payment_orders
      where provider = 'RAZORPAY'
        and provider_order_id = $1
      limit 1
    `,
    [providerOrderId]
  );
  return result.rowCount === 0 ? null : mapPaymentOrder(result.rows[0]);
};

export const createOrReusePaymentOrder = async (input: {
  userId: string;
  plan: SubscriptionPlanDto;
  source: string | null;
  requiredEntitlement: string | null;
  returnDestination: string | null;
  idempotencyKey: string;
}) => {
  const result = await pool.query(
    `
      insert into payment_orders (
        id,
        user_id,
        subscription_plan_id,
        provider,
        amount_minor,
        base_amount_minor,
        cgst_rate_percent,
        cgst_amount_minor,
        sgst_rate_percent,
        sgst_amount_minor,
        total_tax_minor,
        total_amount_minor,
        currency,
        status,
        source,
        required_entitlement,
        return_destination,
        idempotency_key,
        created_at,
        updated_at
      ) values ($1, $2, $3, 'RAZORPAY', $4, $5, $6, $7, $8, $9, $10, $11, $12, 'CREATED', $13, $14, $15, $16, now(), now())
      on conflict (user_id, idempotency_key) do update
      set updated_at = payment_orders.updated_at
      returning *
    `,
    [
      crypto.randomUUID(),
      input.userId,
      input.plan.id,
      input.plan.totalAmountMinor,
      input.plan.priceMinor,
      input.plan.cgstRatePercent,
      input.plan.cgstAmountMinor,
      input.plan.sgstRatePercent,
      input.plan.sgstAmountMinor,
      input.plan.totalTaxMinor,
      input.plan.totalAmountMinor,
      input.plan.currency,
      input.source,
      input.requiredEntitlement,
      input.returnDestination,
      input.idempotencyKey
    ]
  );
  return mapPaymentOrder(result.rows[0]);
};

export const attachProviderOrder = async (input: {
  paymentOrderId: string;
  providerOrderId: string;
  providerResponse: Record<string, unknown>;
}) => {
  const result = await pool.query(
    `
      update payment_orders
      set
        provider_order_id = coalesce(provider_order_id, $2),
        provider_response = case
          when provider_response = '{}'::jsonb then $3::jsonb
          else provider_response
        end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [input.paymentOrderId, input.providerOrderId, JSON.stringify(input.providerResponse)]
  );
  return mapPaymentOrder(result.rows[0]);
};

export const markPaymentOrderFailed = async (paymentOrderId: string) => {
  await pool.query(
    `
      update payment_orders
      set status = 'FAILED', updated_at = now()
      where id = $1
        and status <> 'PAID'
    `,
    [paymentOrderId]
  );
};

export const recordSubscriptionAuditEvent = async (input: {
  userId?: string | null;
  subscriptionId?: string | null;
  paymentOrderId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}, db: Queryable = pool) => {
  await db.query(
    `
      insert into subscription_audit_events (
        id,
        user_id,
        subscription_id,
        payment_order_id,
        event_type,
        metadata,
        created_at
      ) values ($1, $2, $3, $4, $5, $6::jsonb, now())
    `,
    [
      crypto.randomUUID(),
      input.userId ?? null,
      input.subscriptionId ?? null,
      input.paymentOrderId ?? null,
      input.eventType,
      JSON.stringify(input.metadata ?? {})
    ]
  );
};

export const activateSubscriptionFromPayment = async (input: {
  paymentOrder: PaymentOrderRecord;
  providerPaymentId: string;
  paymentStatus: string;
  paymentMethod?: string | null;
}) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const lockedOrderResult = await client.query(
      `
        select *
        from payment_orders
        where id = $1
        for update
      `,
      [input.paymentOrder.id]
    );
    if (lockedOrderResult.rowCount === 0) {
      throw new Error('Payment order not found.');
    }
    const lockedOrder = mapPaymentOrder(lockedOrderResult.rows[0]);

    if (lockedOrder.status === 'PAID') {
      const existingSubscription = await getCurrentActiveSubscriptionForUser(lockedOrder.userId, client);
      await client.query('commit');
      return existingSubscription;
    }

    const plan = await getActiveSubscriptionPlanById(lockedOrder.planId, client);
    if (!plan) {
      throw new Error('Subscription plan is inactive or missing.');
    }

    const nowValue = new Date();
    const currentActive = await getCurrentActiveSubscriptionForUser(lockedOrder.userId, client);
    const startsAt = currentActive?.expiresAtISO && new Date(currentActive.expiresAtISO) > nowValue
      ? new Date(currentActive.expiresAtISO)
      : nowValue;
    const expiresAt = new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    const subscriptionId = crypto.randomUUID();

    await client.query(
      `
        insert into user_subscriptions (
          id,
          user_id,
          plan_id,
          status,
          starts_at,
          expires_at,
          payment_provider,
          provider_order_id,
          provider_payment_id,
          payment_order_id,
          amount_paid_minor,
          base_amount_minor,
          cgst_rate_percent,
          cgst_amount_minor,
          sgst_rate_percent,
          sgst_amount_minor,
          total_tax_minor,
          total_amount_minor,
          currency,
          created_at,
          updated_at
        ) values ($1, $2, $3, 'ACTIVE', $4, $5, 'RAZORPAY', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
        on conflict (payment_provider, provider_payment_id) where provider_payment_id is not null do nothing
      `,
      [
        subscriptionId,
        lockedOrder.userId,
        lockedOrder.planId,
        startsAt.toISOString(),
        expiresAt.toISOString(),
        lockedOrder.providerOrderId,
        input.providerPaymentId,
        lockedOrder.id,
        lockedOrder.amountMinor,
        lockedOrder.baseAmountMinor,
        lockedOrder.cgstRatePercent,
        lockedOrder.cgstAmountMinor,
        lockedOrder.sgstRatePercent,
        lockedOrder.sgstAmountMinor,
        lockedOrder.totalTaxMinor,
        lockedOrder.totalAmountMinor,
        lockedOrder.currency
      ]
    );

    await client.query(
      `
        insert into payment_transactions (
          id,
          user_id,
          payment_order_id,
          subscription_id,
          provider,
          provider_order_id,
          provider_payment_id,
          amount_minor,
          base_amount_minor,
          cgst_rate_percent,
          cgst_amount_minor,
          sgst_rate_percent,
          sgst_amount_minor,
          total_tax_minor,
          total_amount_minor,
          currency,
          status,
          payment_method,
          verified_at,
          captured_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, 'RAZORPAY', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now(), now(), now())
        on conflict (provider, provider_payment_id) where provider_payment_id is not null do nothing
      `,
      [
        crypto.randomUUID(),
        lockedOrder.userId,
        lockedOrder.id,
        subscriptionId,
        lockedOrder.providerOrderId,
        input.providerPaymentId,
        lockedOrder.amountMinor,
        lockedOrder.baseAmountMinor,
        lockedOrder.cgstRatePercent,
        lockedOrder.cgstAmountMinor,
        lockedOrder.sgstRatePercent,
        lockedOrder.sgstAmountMinor,
        lockedOrder.totalTaxMinor,
        lockedOrder.totalAmountMinor,
        lockedOrder.currency,
        input.paymentStatus,
        input.paymentMethod ?? null
      ]
    );

    await client.query(
      `
        update payment_orders
        set status = 'PAID', updated_at = now()
        where id = $1
      `,
      [lockedOrder.id]
    );

    await recordSubscriptionAuditEvent(
      {
        userId: lockedOrder.userId,
        subscriptionId,
        paymentOrderId: lockedOrder.id,
        eventType: 'SUBSCRIPTION_ACTIVATED',
        metadata: {
          provider: 'RAZORPAY',
          planCode: plan.code,
          paymentStatus: input.paymentStatus
        }
      },
      client
    );

    await client.query('commit');
    return getCurrentActiveSubscriptionForUser(lockedOrder.userId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const recordWebhookEvent = async (input: {
  providerEventId: string | null;
  eventType: string;
  payloadHash: string;
}) => {
  const result = await pool.query(
    `
      insert into payment_webhook_events (
        id,
        provider,
        provider_event_id,
        event_type,
        payload_hash,
        processing_status,
        received_at
      ) values ($1, 'RAZORPAY', $2, $3, $4, 'PROCESSING', now())
      on conflict do nothing
      returning *
    `,
    [crypto.randomUUID(), input.providerEventId, input.eventType, input.payloadHash]
  );
  return (result.rowCount ?? 0) > 0;
};

export const markWebhookEventProcessed = async (payloadHash: string) => {
  await pool.query(
    `
      update payment_webhook_events
      set processing_status = 'PROCESSED', processed_at = now()
      where provider = 'RAZORPAY'
        and payload_hash = $1
    `,
    [payloadHash]
  );
};

export const markWebhookEventFailed = async (payloadHash: string, errorMessage: string) => {
  await pool.query(
    `
      update payment_webhook_events
      set processing_status = 'FAILED', processed_at = now(), error_message = $2
      where provider = 'RAZORPAY'
        and payload_hash = $1
    `,
    [payloadHash, errorMessage.slice(0, 1000)]
  );
};

export const listPaymentHistoryForUser = async (userId: string) => {
  const result = await pool.query(
    `
      select
        transactions.created_at,
        transactions.amount_minor,
        transactions.base_amount_minor,
        transactions.cgst_rate_percent,
        transactions.cgst_amount_minor,
        transactions.sgst_rate_percent,
        transactions.sgst_amount_minor,
        transactions.total_tax_minor,
        transactions.total_amount_minor,
        transactions.currency,
        transactions.status,
        transactions.provider_payment_id,
        plans.name as plan_name
      from payment_transactions transactions
      join payment_orders orders on orders.id = transactions.payment_order_id
      join subscription_plans plans on plans.id = orders.subscription_plan_id
      where transactions.user_id = $1
      order by transactions.created_at desc
      limit 50
    `,
    [userId]
  );
  return result.rows.map((row) => ({
    dateISO: new Date(String(row.created_at)).toISOString(),
    planName: String(row.plan_name),
    amountMinor: Number(row.amount_minor),
    priceBreakup: {
      baseAmountMinor: Number(row.base_amount_minor ?? row.amount_minor),
      cgstRatePercent: Number(row.cgst_rate_percent ?? 0),
      cgstAmountMinor: Number(row.cgst_amount_minor ?? 0),
      sgstRatePercent: Number(row.sgst_rate_percent ?? 0),
      sgstAmountMinor: Number(row.sgst_amount_minor ?? 0),
      totalTaxMinor: Number(row.total_tax_minor ?? 0),
      totalAmountMinor: Number(row.total_amount_minor ?? row.amount_minor)
    },
    currency: String(row.currency),
    status: String(row.status),
    paymentReference: row.provider_payment_id == null ? null : String(row.provider_payment_id)
  }));
};
