/*
  MISEVO — Multiempresa Fase 1
  Fundação de Empresa / Unidade e migração segura dos dados existentes.
*/

export async function initCoreTenancy(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let empresa = await client.query(`SELECT id FROM empresas ORDER BY id LIMIT 1`);
    let empresaId;

    if (!empresa.rows[0]) {
      const criada = await client.query(
        `INSERT INTO empresas (nome,nome_fantasia)
         VALUES ($1,$1) RETURNING id`,
        ["Padaria Rafael Vidal"]
      );
      empresaId = criada.rows[0].id;
    } else {
      empresaId = empresa.rows[0].id;
    }

    let unidade = await client.query(
      `SELECT id FROM unidades WHERE empresa_id=$1 ORDER BY id LIMIT 1`,
      [empresaId]
    );

    if (!unidade.rows[0]) {
      await client.query(
        `INSERT INTO unidades (empresa_id,nome,codigo)
         VALUES ($1,$2,$3)`,
        [empresaId, "Unidade Principal", "MATRIZ"]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function migrateOperationalTenancy(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const empresa = await client.query(`SELECT id FROM empresas ORDER BY id LIMIT 1`);
    if (!empresa.rows[0]) throw new Error("Empresa inicial não encontrada.");
    const empresaId = empresa.rows[0].id;

    const unidade = await client.query(
      `SELECT id FROM unidades WHERE empresa_id=$1 ORDER BY id LIMIT 1`,
      [empresaId]
    );
    if (!unidade.rows[0]) throw new Error("Unidade inicial não encontrada.");
    const unidadeId = unidade.rows[0].id;

    await client.query(
      `UPDATE insumos SET empresa_id=$1 WHERE empresa_id IS NULL`,
      [empresaId]
    );
    await client.query(
      `UPDATE insumos SET unidade_id=$1 WHERE unidade_id IS NULL`,
      [unidadeId]
    );

    await client.query("COMMIT");
    console.log("MISEVO multiempresa: dados existentes vinculados à empresa/unidade inicial.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
