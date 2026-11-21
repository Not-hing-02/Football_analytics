import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const envFile = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const pool = new pg.Pool({
    host: process.env.DB_HOST || process.env.PGHOST,
    port: process.env.DB_PORT || process.env.PGPORT,
    user: process.env.DB_USER || process.env.PGUSER,
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
    database: process.env.DB_NAME || process.env.PGDATABASE,
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});

export default pool;
