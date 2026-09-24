import { randomUUID } from 'node:crypto';
import { consultantAccessSqlPredicate } from '../consultant-access/consultant-access.repository.js';
import { pool } from '../../db/pool.js';

export const CLIENT_OPERATION_TYPES = ['CONSULTATION', 'TASK', 'FOLLOW_UP', 'GOAL', 'NOTE'] as const;
export type ClientOperationType = typeof CLIENT_OPERATION_TYPES[number];

export type ClientOperationInput = {
  operationType: ClientOperationType;
  title: string;
  detail?: string | null;
  status?: string;
  priority?: string;
  dueAt?: string | null;
  scheduledAt?: string | null;
  metadata?: Record<string, unknown>;
};

const mapOperation = (row: Record<string, unknown>) => ({
  id: row.id,
  operationType: row.operation_type,
  title: row.title,
  detail: row.detail,
  status: row.status,
  priority: row.priority,
  dueAt: row.due_at,
  scheduledAt: row.scheduled_at,
  completedAt: row.completed_at,
  metadata: row.metadata,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.public_client_id ? { clientId: row.public_client_id } : {}),
  ...(row.client_name ? { clientName: row.client_name } : {}),
});

export const resolveInternalClientId = async (publicClientId: string) => {
  const result = await pool.query<{ id: string }>(
    `select id from fiteatsy_clients where fiteatsy_client_id = $1 and lower(coalesce(status, '')) = 'active' and deleted_at is null`,
    [publicClientId],
  );
  return result.rows[0]?.id ?? null;
};

export const listClientOperations = async (clientId: string, type?: ClientOperationType) => {
  const result = await pool.query(
    `select * from consultant_client_operations
     where client_id = $1 and deleted_at is null and ($2::text is null or operation_type = $2)
     order by coalesce(scheduled_at, due_at, updated_at) desc, created_at desc`,
    [clientId, type ?? null],
  );
  return result.rows.map(mapOperation);
};

export const listConsultantOperations = async (consultantId: string, type?: ClientOperationType) => {
  const result = await pool.query(
    `select operation.*, client.fiteatsy_client_id as public_client_id, account.name as client_name
       from consultant_client_operations operation
       join fiteatsy_clients client on client.id = operation.client_id
       join users account on account.id = client.account_user_id
       join consultant_client_assignments assignment
         on assignment.client_user_id = client.account_user_id
        and assignment.consultant_user_id = $1
        and assignment.product = 'FITEATSY'
        and assignment.professional_type = 'CONSULTANT'
        and assignment.status = 'active'
        and (assignment.ends_at is null or assignment.ends_at > now())
       join consultant_access_consents consent
         on ${consultantAccessSqlPredicate('assignment', 'consent')}
      where operation.deleted_at is null
        and client.deleted_at is null
        and lower(coalesce(client.status, '')) = 'active'
        and ($2::text is null or operation.operation_type = $2)
      order by coalesce(operation.scheduled_at, operation.due_at, operation.updated_at) desc,
               operation.created_at desc`,
    [consultantId, type ?? null],
  );
  return result.rows.map(mapOperation);
};

export const createClientOperation = async (clientId: string, actorId: string, input: ClientOperationInput, idempotencyKey: string) => {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const previous = await db.query<{ operation_id: string }>(
      'select operation_id from consultant_client_operation_idempotency where actor_id = $1 and idempotency_key = $2',
      [actorId, idempotencyKey],
    );
    if (previous.rows[0]) {
      const existing = await db.query('select * from consultant_client_operations where id = $1', [previous.rows[0].operation_id]);
      await db.query('commit');
      return { operation: mapOperation(existing.rows[0]), replayed: true };
    }
    const id = randomUUID();
    const inserted = await db.query(
      `insert into consultant_client_operations
       (id, client_id, operation_type, title, detail, status, priority, due_at, scheduled_at, metadata, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11) returning *`,
      [id, clientId, input.operationType, input.title, input.detail ?? null, input.status ?? 'OPEN', input.priority ?? 'NORMAL', input.dueAt ?? null, input.scheduledAt ?? null, JSON.stringify(input.metadata ?? {}), actorId],
    );
    await db.query(
      'insert into consultant_client_operation_idempotency(actor_id,idempotency_key,operation_id) values ($1,$2,$3)',
      [actorId, idempotencyKey, id],
    );
    await db.query(
      `insert into consultant_client_operation_audit(id,operation_id,client_id,actor_id,action,after_state)
       values ($1,$2,$3,$4,'CREATED',$5::jsonb)`,
      [randomUUID(), id, clientId, actorId, JSON.stringify(mapOperation(inserted.rows[0]))],
    );
    await db.query('commit');
    return { operation: mapOperation(inserted.rows[0]), replayed: false };
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
};

export const updateClientOperation = async (clientId: string, operationId: string, actorId: string, expectedVersion: number, patch: Partial<ClientOperationInput>) => {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const current = await db.query('select * from consultant_client_operations where id=$1 and client_id=$2 and deleted_at is null for update', [operationId, clientId]);
    if (!current.rows[0]) { await db.query('rollback'); return { kind: 'not_found' as const }; }
    if (Number(current.rows[0].version) !== expectedVersion) { await db.query('rollback'); return { kind: 'conflict' as const, current: mapOperation(current.rows[0]) }; }
    const nextStatus = patch.status ?? current.rows[0].status;
    const updated = await db.query(
      `update consultant_client_operations set
       title=coalesce($3,title), detail=coalesce($4,detail), status=$5, priority=coalesce($6,priority),
       due_at=coalesce($7,due_at), scheduled_at=coalesce($8,scheduled_at), metadata=coalesce($9::jsonb,metadata),
       completed_at=case when $5='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
       updated_by=$10, version=version+1, updated_at=now()
       where id=$1 and client_id=$2 returning *`,
      [operationId, clientId, patch.title ?? null, patch.detail ?? null, nextStatus, patch.priority ?? null, patch.dueAt ?? null, patch.scheduledAt ?? null, patch.metadata ? JSON.stringify(patch.metadata) : null, actorId],
    );
    await db.query(
      `insert into consultant_client_operation_audit(id,operation_id,client_id,actor_id,action,before_state,after_state)
       values ($1,$2,$3,$4,'UPDATED',$5::jsonb,$6::jsonb)`,
      [randomUUID(), operationId, clientId, actorId, JSON.stringify(mapOperation(current.rows[0])), JSON.stringify(mapOperation(updated.rows[0]))],
    );
    await db.query('commit');
    return { kind: 'updated' as const, operation: mapOperation(updated.rows[0]) };
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { db.release(); }
};

export const listClientOperationAudit = async (clientId: string, limit = 100) => {
  const result = await pool.query(
    `select id,operation_id,actor_id,action,before_state,after_state,event_time
     from consultant_client_operation_audit where client_id=$1 order by event_time desc limit $2`,
    [clientId, limit],
  );
  return result.rows;
};

export const getConsultantAvailability = async (consultantId: string) => {
  const result = await pool.query('select * from consultant_availability where consultant_id=$1', [consultantId]);
  const row = result.rows[0];
  return row ? { timezone: row.timezone, schedule: row.schedule, unavailableDates: row.unavailable_dates, version: row.version, updatedAt: row.updated_at } : null;
};

export const upsertConsultantAvailability = async (consultantId: string, timezone: string, schedule: unknown[], unavailableDates: string[], expectedVersion?: number) => {
  const result = await pool.query(
    `insert into consultant_availability(consultant_id,timezone,schedule,unavailable_dates)
     values ($1,$2,$3::jsonb,$4::jsonb)
     on conflict (consultant_id) do update set timezone=excluded.timezone,schedule=excluded.schedule,
       unavailable_dates=excluded.unavailable_dates,version=consultant_availability.version+1,updated_at=now()
     where $5::integer is null or consultant_availability.version=$5 returning *`,
    [consultantId, timezone, JSON.stringify(schedule), JSON.stringify(unavailableDates), expectedVersion ?? null],
  );
  if (!result.rows[0]) return null;
  return getConsultantAvailability(consultantId);
};
