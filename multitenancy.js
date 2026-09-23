/*
  MISEVO — Multiempresa Fase 1
  Fundação de Empresa / Unidade e migração segura dos dados existentes.
*/

export async function initCoreTenancy(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id BIGSERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        nome_fantasia TEXT DEFAULT '',
        documento TEXT DEFAULT '',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS unidades (
        id BIGSERIAL PRIMARY KEY,
        empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
        nome TEXT NOT NULL,
        codigo TEXT DEFAULT '',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_unidades_empresa ON unidades(empresa_id);
    `);

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

    await client.query(`
      ALTER TABLE insumos ADD COLUMN IF NOT EXISTS empresa_id BIGINT;
      ALTER TABLE insumos ADD COLUMN IF NOT EXISTS unidade_id BIGINT;
      ALTER TABLE fichas ADD COLUMN IF NOT EXISTS empresa_id BIGINT;
      ALTER TABLE fichas ADD COLUMN IF NOT EXISTS unidade_id BIGINT;
    `);

    await client.query(
      `UPDATE insumos SET empresa_id=$1 WHERE empresa_id IS NULL`,
      [empresaId]
    );
    await client.query(
      `UPDATE insumos SET unidade_id=$1 WHERE unidade_id IS NULL`,
      [unidadeId]
    );
    await client.query(
      `UPDATE fichas SET empresa_id=$1 WHERE empresa_id IS NULL`,
      [empresaId]
    );
    await client.query(
      `UPDATE fichas SET unidade_id=$1 WHERE unidade_id IS NULL`,
      [unidadeId]
    );

    // FKs adicionadas de forma idempotente.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_insumos_empresa') THEN
          ALTER TABLE insumos ADD CONSTRAINT fk_insumos_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_insumos_unidade') THEN
          ALTER TABLE insumos ADD CONSTRAINT fk_insumos_unidade
            FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_fichas_empresa') THEN
          ALTER TABLE fichas ADD CONSTRAINT fk_fichas_empresa
            FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_fichas_unidade') THEN
          ALTER TABLE fichas ADD CONSTRAINT fk_fichas_unidade
            FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_insumos_empresa_unidade
        ON insumos(empresa_id,unidade_id);
      CREATE INDEX IF NOT EXISTS idx_fichas_empresa_unidade
        ON fichas(empresa_id,unidade_id);
    `);

    await client.query("COMMIT");
    console.log("MISEVO multiempresa: dados existentes vinculados à empresa/unidade inicial.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
