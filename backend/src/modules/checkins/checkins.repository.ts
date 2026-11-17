import { pool } from '../../db/pool.js';
import { resolveTrustedTenantForClientWrite } from '../tenancy/tenant-write-authority.js';

export type CheckInOwner = { accountId: string; clientId: string };

export const upsertDailyCheckIn = async (owner: CheckInOwner, input: {
  dateISO: string; mood: number; energy: number; sleepQuality: number;
}) => {
  const tenantId = await resolveTrustedTenantForClientWrite(owner, 'daily_checkin_upsert');
  const result = await pool.query(
    `insert into daily_checkins(user_id,client_id,tenant_id,checkin_date,mood,energy,sleep_quality,created_at)
     values($1,$2,$3,$4::timestamptz::date,$5,$6,$7,now())
     on conflict(user_id,checkin_date) do update set
       client_id=excluded.client_id,tenant_id=excluded.tenant_id,
       mood=excluded.mood,energy=excluded.energy,sleep_quality=excluded.sleep_quality
     returning id,user_id,client_id,checkin_date,mood,energy,sleep_quality,created_at`,
    [owner.accountId,owner.clientId,tenantId,input.dateISO,input.mood,input.energy,input.sleepQuality]
  );
  return result.rows[0];
};

export const listDailyCheckIns = async (owner: CheckInOwner, limit: number) => {
  const result = await pool.query(
    `select id,user_id,client_id,checkin_date,mood,energy,sleep_quality,created_at
       from daily_checkins where user_id=$1 and client_id=$2
      order by checkin_date desc limit $3`,
    [owner.accountId,owner.clientId,limit]
  );
  return result.rows;
};
