import { pool } from '../../db/pool.js';

export type NotificationPreferences = {
  all: boolean; hydration: boolean; nutrition: boolean; medication: boolean;
  consultation: boolean; followUp: boolean; subscription: boolean; account: boolean;
  general: boolean; version: number; updatedAt: string;
};

const map = (row: any): NotificationPreferences => ({
  all: row.master_enabled, hydration: row.hydration, nutrition: row.nutrition,
  medication: row.medication, consultation: row.consultation, followUp: row.follow_up,
  subscription: row.subscription, account: row.account_updates, general: row.general,
  version: Number(row.version), updatedAt: row.updated_at.toISOString()
});

export const getNotificationPreferences = async (userId: string) => {
  await pool.query('insert into notification_preferences(user_id) values($1) on conflict do nothing', [userId]);
  const result = await pool.query('select * from notification_preferences where user_id=$1', [userId]);
  return map(result.rows[0]);
};

export const updateNotificationPreferences = async (userId: string, expectedVersion: number | undefined, value: Omit<NotificationPreferences, 'version'|'updatedAt'>) => {
  await pool.query('insert into notification_preferences(user_id) values($1) on conflict do nothing', [userId]);
  const result = await pool.query(
    `update notification_preferences set master_enabled=$2,hydration=$3,nutrition=$4,medication=$5,
       consultation=$6,follow_up=$7,subscription=$8,account_updates=$9,general=$10,
       version=version+1,updated_at=now()
     where user_id=$1 and ($11::int is null or version=$11) returning *`,
    [userId,value.all,value.hydration,value.nutrition,value.medication,value.consultation,value.followUp,value.subscription,value.account,value.general,expectedVersion??null]
  );
  return result.rows[0] ? map(result.rows[0]) : null;
};

export type ConsultantConsentStatus = 'GRANTED'|'REVOKED'|'PENDING'|'NOT_REQUESTED';
const mapConsent = (row: any) => ({status: row?.status ?? 'NOT_REQUESTED', policyVersion: row?.policy_version ?? 'CONSULTANT_ACCESS_V1', source: row?.source ?? 'PROFILE', grantedAt: row?.granted_at?.toISOString?.() ?? null, revokedAt: row?.revoked_at?.toISOString?.() ?? null, version: Number(row?.version ?? 0), updatedAt: row?.updated_at?.toISOString?.() ?? null});
export const getConsultantConsent = async (userId: string) => mapConsent((await pool.query('select * from consultant_access_consents where user_id=$1',[userId])).rows[0]);
export const setConsultantConsent = async (userId:string,clientId:string,status:ConsultantConsentStatus,source:string,policyVersion:string) => {
  const result=await pool.query(`insert into consultant_access_consents(user_id,client_id,status,policy_version,source,granted_at,revoked_at)
    values($1,$2,$3,$4,$5,case when $3='GRANTED' then now() end,case when $3='REVOKED' then now() end)
    on conflict(user_id) do update set status=excluded.status,policy_version=excluded.policy_version,source=excluded.source,
    granted_at=case when excluded.status='GRANTED' then now() else consultant_access_consents.granted_at end,
    revoked_at=case when excluded.status='REVOKED' then now() else consultant_access_consents.revoked_at end,
    version=consultant_access_consents.version+1,updated_at=now() returning *`,[userId,clientId,status,policyVersion,source]);
  return mapConsent(result.rows[0]);
};
export const isConsultantConsentGranted = async(clientId:string) => Boolean((await pool.query(
  `select 1
     from consultant_access_consents consent
     join fiteatsy_clients client on client.id = consent.client_id
    where (client.id = $1 or client.fiteatsy_client_id = $1)
      and consent.status = 'GRANTED'`,
  [clientId]
)).rowCount);
