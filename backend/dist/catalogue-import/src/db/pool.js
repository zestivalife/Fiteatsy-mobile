import { Pool } from 'pg';
import { env } from '../config/env.js';
let sharedPool = null;
export const getPool = () => {
    if (!sharedPool) {
        sharedPool = new Pool({
            connectionString: env.databaseUrl
        });
    }
    return sharedPool;
};
export const pool = new Proxy({}, {
    get(_target, property, receiver) {
        const currentPool = getPool();
        const value = Reflect.get(currentPool, property, receiver);
        return typeof value === 'function' ? value.bind(currentPool) : value;
    }
});
export const checkDatabaseReadiness = async () => {
    const result = await getPool().query('select 1 as ok');
    return Number(result.rows[0]?.ok ?? 0) === 1;
};
export const closePool = async () => {
    if (!sharedPool)
        return;
    const current = sharedPool;
    sharedPool = null;
    await current.end();
};
