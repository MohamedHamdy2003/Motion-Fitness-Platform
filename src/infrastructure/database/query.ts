import { DataSource, EntityManager } from 'typeorm';
/** PostgreSQL returns [rows, affectedCount] for UPDATE/DELETE through TypeORM. */
export async function query(
  connection: DataSource | EntityManager,
  statement: string,
  parameters?: unknown[],
): Promise<any[]> {
  const result = await connection.query(statement, parameters);
  return Array.isArray(result?.[0]) && typeof result?.[1] === 'number'
    ? result[0]
    : result;
}
