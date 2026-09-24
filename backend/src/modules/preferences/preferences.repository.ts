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
