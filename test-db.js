import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const result = await sql`SELECT 1 as ok`;
console.log(result);