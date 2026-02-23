import mysql from "mysql2/promise";

export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'market_partner',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export async function query(sql: string, params: any[]) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

export default pool;
