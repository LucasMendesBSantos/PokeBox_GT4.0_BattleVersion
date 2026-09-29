const { Pool, types } = require('pg');

// Por padrão o pg devolve BIGINT e NUMERIC como texto. Nossos ids cabem num
// Number e os multiplicadores (NUMERIC(4, 3)) precisam ser número para as contas.
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.NUMERIC, Number);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Roda fn dentro de BEGIN/COMMIT; qualquer erro desfaz tudo.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function transacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

module.exports = { pool, transacao };
