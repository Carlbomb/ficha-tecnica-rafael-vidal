import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway.internal")
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const n = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* =========================================================
   BANCO DE DADOS
========================================================= */

const schema = `

CREATE TABLE IF NOT EXISTS insumos (
  id BIGSERIAL PRIMARY KEY,
  ingrediente TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'KG',
  peso_bruto NUMERIC(14,4) NOT NULL DEFAULT 1,
  peso_liquido NUMERIC(14,4) NOT NULL DEFAULT 1,
  fc NUMERIC(14,4) NOT NULL DEFAULT 1,
  preco_compra NUMERIC(14,4) NOT NULL DEFAULT 0,
  preco_real NUMERIC(14,4) NOT NULL DEFAULT 0,
  fornecedor TEXT DEFAULT '',
  data_cotacao DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fichas (
  id BIGSERIAL PRIMARY KEY,
  nome_prato TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Outros',
  rendimento_kg NUMERIC(14,4) NOT NULL DEFAULT 0,
  porcoes NUMERIC(14,2) NOT NULL DEFAULT 1,
  preco_venda NUMERIC(14,4) NOT NULL DEFAULT 0,
  modo_preparo TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ativa',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredientes (
  id BIGSERIAL PRIMARY KEY,
  ficha_id BIGINT NOT NULL
    REFERENCES fichas(id) ON DELETE CASCADE,

  insumo_id BIGINT NOT NULL
    REFERENCES insumos(id),

  quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'KG',
  ordem INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_ingrediente
  ON insumos(ingrediente);

CREATE INDEX IF NOT EXISTS idx_ingredientes_ficha
  ON ingredientes(ficha_id);

CREATE INDEX IF NOT EXISTS idx_ingredientes_insumo
  ON ingredientes(insumo_id);

`;

async function init() {
  await pool.query(schema);
  console.log("Banco de dados pronto");
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  asyncRoute(async (_, res) => {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      database: true,
      sistema: "Ficha Técnica Rafael Vidal"
    });
  })
);

/* =========================================================
   BANCO DE DADOS / INSUMOS
========================================================= */

app.get(
  "/api/insumos",
  asyncRoute(async (_, res) => {
    const { rows } = await pool.query(`
      SELECT
        id AS codigo,
        id,
        ingrediente,
        unidade,
        peso_bruto,
        peso_liquido,
        fc,
        preco_compra,
        preco_real,
        fornecedor,
        data_cotacao,
        ativo,
        observacoes
      FROM insumos
      ORDER BY id
    `);

    res.json(rows);
  })
);

app.get(
  "/api/insumos/:id",
  asyncRoute(async (req, res) => {
    const { rows } = await pool.query(
      `
      SELECT
        id AS codigo,
        id,
        ingrediente,
        unidade,
        peso_bruto,
        peso_liquido,
        fc,
        preco_compra,
        preco_real,
        fornecedor,
        data_cotacao,
        ativo,
        observacoes
      FROM insumos
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Insumo não encontrado."
      });
    }

    res.json(rows[0]);
  })
);

/* =========================================================
   NOVO INSUMO

   FC = PESO BRUTO / PESO LÍQUIDO
   PREÇO REAL = PREÇO COMPRA * FC
========================================================= */

app.post(
  "/api/insumos",
  asyncRoute(async (req, res) => {
    const b = req.body;

    const ingrediente =
      String(b.ingrediente || "").trim();

    if (!ingrediente) {
      return res.status(400).json({
        error: "Informe o ingrediente."
      });
    }

    const unidade =
      String(b.unidade || "KG").toUpperCase();

    const pesoBruto = n(b.peso_bruto);
    const pesoLiquido = n(b.peso_liquido);

    if (pesoBruto <= 0) {
      return res.status(400).json({
        error: "O peso bruto deve ser maior que zero."
      });
    }

    if (pesoLiquido <= 0) {
      return res.status(400).json({
        error: "O peso líquido deve ser maior que zero."
      });
    }

    const fc =
      pesoBruto / pesoLiquido;

    const precoCompra =
      n(b.preco_compra);

    const precoReal =
      precoCompra * fc;

    const { rows } = await pool.query(
      `
      INSERT INTO insumos (
        ingrediente,
        unidade,
        peso_bruto,
        peso_liquido,
        fc,
        preco_compra,
        preco_real,
        fornecedor,
        data_cotacao,
        ativo,
        observacoes
      )
      VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11
      )
      RETURNING
        id AS codigo,
        *
      `,
      [
        ingrediente,
        unidade,
        pesoBruto,
        pesoLiquido,
        fc,
        precoCompra,
        precoReal,
        b.fornecedor || "",
        b.data_cotacao || null,
        b.ativo !== false,
        b.observacoes || ""
      ]
    );

    res.status(201).json(rows[0]);
  })
);

/* =========================================================
   EDITAR INSUMO
========================================================= */

app.put(
  "/api/insumos/:id",
  asyncRoute(async (req, res) => {
    const b = req.body;

    const ingrediente =
      String(b.ingrediente || "").trim();

    if (!ingrediente) {
      return res.status(400).json({
        error: "Informe o ingrediente."
      });
    }

    const unidade =
      String(b.unidade || "KG").toUpperCase();

    const pesoBruto = n(b.peso_bruto);
    const pesoLiquido = n(b.peso_liquido);

    if (pesoBruto <= 0 || pesoLiquido <= 0) {
      return res.status(400).json({
        error:
          "Peso bruto e peso líquido devem ser maiores que zero."
      });
    }

    const fc =
      pesoBruto / pesoLiquido;

    const precoCompra =
      n(b.preco_compra);

    const precoReal =
      precoCompra * fc;

    const { rows } = await pool.query(
      `
      UPDATE insumos
      SET
        ingrediente = $1,
        unidade = $2,
        peso_bruto = $3,
        peso_liquido = $4,
        fc = $5,
        preco_compra = $6,
        preco_real = $7,
        fornecedor = $8,
        data_cotacao = $9,
        ativo = $10,
        observacoes = $11,
        updated_at = NOW()
      WHERE id = $12

      RETURNING
        id AS codigo,
        *
      `,
      [
        ingrediente,
        unidade,
        pesoBruto,
        pesoLiquido,
        fc,
        precoCompra,
        precoReal,
        b.fornecedor || "",
        b.data_cotacao || null,
        b.ativo !== false,
        b.observacoes || "",
        req.params.id
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Insumo não encontrado."
      });
    }

    res.json(rows[0]);
  })
);

/* =========================================================
   EXCLUIR INSUMO
========================================================= */

app.delete(
  "/api/insumos/:id",
  asyncRoute(async (req, res) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM insumos
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Insumo não encontrado."
        });
      }

      res.status(204).end();

    } catch (e) {

      if (e.code === "23503") {
        return res.status(409).json({
          error:
            "Este insumo está sendo utilizado em uma ficha técnica."
        });
      }

      throw e;
    }
  })
);

/* =========================================================
   CÁLCULO DA FICHA TÉCNICA

   A ficha sempre consulta os valores ATUAIS
   existentes no Banco de Dados.

   Isso reproduz a lógica das fórmulas da planilha.
========================================================= */

const fichaSelect = `

SELECT
  f.*,

  COALESCE(
    SUM(
      i.quantidade * ins.preco_real
    ),
    0
  )::numeric AS custo_total,

  CASE
    WHEN f.porcoes > 0 THEN

      (
        COALESCE(
          SUM(
            i.quantidade * ins.preco_real
          ),
          0
        )

        / f.porcoes
      )::numeric

    ELSE 0
  END AS custo_por_porcao,

  CASE
    WHEN
      f.porcoes > 0
      AND f.preco_venda > 0
    THEN

      (
        (
          COALESCE(
            SUM(
              i.quantidade * ins.preco_real
            ),
            0
          )

          / f.porcoes
        )

        / f.preco_venda

        * 100
      )::numeric

    ELSE 0
  END AS cmv_percentual,

  CASE
    WHEN f.porcoes > 0
    THEN
      (
        f.rendimento_kg
        / f.porcoes
      )::numeric
    ELSE 0
  END AS peso_por_porcao,

  CASE
    WHEN f.porcoes > 0
    THEN
      (
        (
          COALESCE(
            SUM(
              i.quantidade * ins.preco_real
            ),
            0
          )

          / f.porcoes
        )

        / 0.30
      )::numeric
    ELSE 0
  END AS preco_meta_30

FROM fichas f

LEFT JOIN ingredientes i
  ON i.ficha_id = f.id

LEFT JOIN insumos ins
  ON ins.id = i.insumo_id

`;

/* =========================================================
   LISTAR FICHAS TÉCNICAS
========================================================= */

app.get(
  "/api/fichas",
  asyncRoute(async (_, res) => {
    const { rows } = await pool.query(
      fichaSelect +
      `
      GROUP BY f.id
      ORDER BY f.nome_prato
      `
    );

    res.json(rows);
  })
);

/* =========================================================
   FIM DA PARTE 1

   A PARTE 2 COMEÇA COM:
   GET /api/fichas/:id
========================================================= */
/* =========================================================
   DETALHE DA FICHA TÉCNICA
========================================================= */

app.get(
  "/api/fichas/:id",
  asyncRoute(async (req, res) => {

    const { rows } = await pool.query(
      fichaSelect +
      `
      WHERE f.id = $1
      GROUP BY f.id
      `,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Ficha técnica não encontrada."
      });
    }

    const ingredientes = await pool.query(
      `
      SELECT
        i.id,
        i.ficha_id,
        i.insumo_id,

        ins.id AS codigo,
        ins.ingrediente,

        i.quantidade AS peso_liquido,

        ins.unidade,
        ins.fc,

        (
          i.quantidade * ins.fc
        )::numeric AS peso_bruto,

        ins.preco_compra,
        ins.preco_real,

        (
          i.quantidade * ins.preco_real
        )::numeric AS custo_insumo,

        i.ordem,
        i.observacoes

      FROM ingredientes i

      JOIN insumos ins
        ON ins.id = i.insumo_id

      WHERE i.ficha_id = $1

      ORDER BY
        i.ordem,
        i.id
      `,
      [req.params.id]
    );

    res.json({
      ...rows[0],
      ingredientes: ingredientes.rows
    });
  })
);

/* =========================================================
   CRIAR FICHA COMPLETA

   Cabeçalho + ingredientes são gravados
   dentro da mesma transação.
========================================================= */

app.post(
  "/api/fichas",
  asyncRoute(async (req, res) => {

    const b = req.body;

    const nome =
      String(b.nome_prato || "").trim();

    const itens =
      Array.isArray(b.ingredientes)
        ? b.ingredientes
        : [];

    if (!nome) {
      return res.status(400).json({
        error: "Informe o nome do prato."
      });
    }

    const porcoes =
      n(b.porcoes) || 1;

    if (porcoes <= 0) {
      return res.status(400).json({
        error:
          "A quantidade de porções deve ser maior que zero."
      });
    }

    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");

      const ficha = await client.query(
        `
        INSERT INTO fichas (
          nome_prato,
          categoria,
          rendimento_kg,
          porcoes,
          preco_venda,
          modo_preparo,
          observacoes,
          status,
          ativo
        )

        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9
        )

        RETURNING *
        `,
        [
          nome,
          b.categoria || "Outros",
          n(b.rendimento_kg),
          porcoes,
          n(b.preco_venda),
          b.modo_preparo || "",
          b.observacoes || "",
          b.status || "Ativa",
          b.ativo !== false
        ]
      );

      const novaFicha =
        ficha.rows[0];

      for (
        let ordem = 0;
        ordem < itens.length;
        ordem++
      ) {

        const item =
          itens[ordem];

        if (
          !item.insumo_id ||
          n(
            item.peso_liquido ??
            item.quantidade
          ) <= 0
        ) {
          continue;
        }

        const quantidade =
          n(
            item.peso_liquido ??
            item.quantidade
          );

        /*
          A unidade vem do próprio Banco de Dados.
          Isso evita divergência entre a ficha
          e o cadastro do insumo.
        */

        const insumo =
          await client.query(
            `
            SELECT unidade
            FROM insumos
            WHERE id = $1
            `,
            [item.insumo_id]
          );

        if (!insumo.rows[0]) {
          throw new Error(
            `Insumo ${item.insumo_id} não encontrado.`
          );
        }

        await client.query(
          `
          INSERT INTO ingredientes (
            ficha_id,
            insumo_id,
            quantidade,
            unidade,
            ordem,
            observacoes
          )

          VALUES (
            $1,$2,$3,$4,$5,$6
          )
          `,
          [
            novaFicha.id,
            item.insumo_id,
            quantidade,
            insumo.rows[0].unidade,
            ordem,
            item.observacoes || ""
          ]
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        id: novaFicha.id,
        message:
          "Ficha técnica criada com sucesso."
      });

    } catch (e) {

      await client.query("ROLLBACK");

      throw e;

    } finally {

      client.release();
    }
  })
);

/* =========================================================
   EDITAR FICHA COMPLETA

   Também é transacional:
   se ocorrer um erro, a ficha anterior permanece intacta.
========================================================= */

app.put(
  "/api/fichas/:id",
  asyncRoute(async (req, res) => {

    const b = req.body;

    const nome =
      String(b.nome_prato || "").trim();

    const itens =
      Array.isArray(b.ingredientes)
        ? b.ingredientes
        : [];

    if (!nome) {
      return res.status(400).json({
        error: "Informe o nome do prato."
      });
    }

    const porcoes =
      n(b.porcoes) || 1;

    if (porcoes <= 0) {
      return res.status(400).json({
        error:
          "A quantidade de porções deve ser maior que zero."
      });
    }

    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");

      const ficha =
        await client.query(
          `
          UPDATE fichas

          SET
            nome_prato = $1,
            categoria = $2,
            rendimento_kg = $3,
            porcoes = $4,
            preco_venda = $5,
            modo_preparo = $6,
            observacoes = $7,
            status = $8,
            ativo = $9,
            updated_at = NOW()

          WHERE id = $10

          RETURNING *
          `,
          [
            nome,
            b.categoria || "Outros",
            n(b.rendimento_kg),
            porcoes,
            n(b.preco_venda),
            b.modo_preparo || "",
            b.observacoes || "",
            b.status || "Ativa",
            b.ativo !== false,
            req.params.id
          ]
        );

      if (!ficha.rows[0]) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Ficha técnica não encontrada."
        });
      }

      /*
        Só removemos os ingredientes antigos
        dentro da transação.

        Se qualquer inserção abaixo falhar,
        ROLLBACK restaura os ingredientes anteriores.
      */

      await client.query(
        `
        DELETE FROM ingredientes
        WHERE ficha_id = $1
        `,
        [req.params.id]
      );

      for (
        let ordem = 0;
        ordem < itens.length;
        ordem++
      ) {

        const item =
          itens[ordem];

        const quantidade =
          n(
            item.peso_liquido ??
            item.quantidade
          );

        if (
          !item.insumo_id ||
          quantidade <= 0
        ) {
          continue;
        }

        const insumo =
          await client.query(
            `
            SELECT unidade
            FROM insumos
            WHERE id = $1
            `,
            [item.insumo_id]
          );

        if (!insumo.rows[0]) {
          throw new Error(
            `Insumo ${item.insumo_id} não encontrado.`
          );
        }

        await client.query(
          `
          INSERT INTO ingredientes (
            ficha_id,
            insumo_id,
            quantidade,
            unidade,
            ordem,
            observacoes
          )

          VALUES (
            $1,$2,$3,$4,$5,$6
          )
          `,
          [
            req.params.id,
            item.insumo_id,
            quantidade,
            insumo.rows[0].unidade,
            ordem,
            item.observacoes || ""
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      res.json({
        id: Number(req.params.id),
        message:
          "Ficha técnica atualizada com sucesso."
      });

    } catch (e) {

      await client.query(
        "ROLLBACK"
      );

      throw e;

    } finally {

      client.release();
    }
  })
);

/* =========================================================
   EXCLUIR FICHA
========================================================= */

app.delete(
  "/api/fichas/:id",
  asyncRoute(async (req, res) => {

    const result =
      await pool.query(
        `
        DELETE FROM fichas
        WHERE id = $1
        `,
        [req.params.id]
      );

    if (!result.rowCount) {
      return res.status(404).json({
        error:
          "Ficha técnica não encontrada."
      });
    }

    res.status(204).end();
  })
);

/* =========================================================
   CMV / RESUMO GERAL
========================================================= */

app.get(
  "/api/cmv",
  asyncRoute(async (_, res) => {

    const fichas =
      await pool.query(
        fichaSelect +
        `
        GROUP BY f.id
        ORDER BY f.nome_prato
        `
      );

    const validas =
      fichas.rows.filter(
        f =>
          n(f.preco_venda) > 0 &&
          n(f.cmv_percentual) > 0
      );

    const cmvMedio =
      validas.length
        ? validas.reduce(
            (total, f) =>
              total +
              n(f.cmv_percentual),
            0
          ) / validas.length
        : 0;

    res.json({
      total_fichas:
        fichas.rows.length,

      cmv_medio:
        cmvMedio,

      meta_cmv:
        30,

      fichas:
        fichas.rows
    });
  })
);

/* =========================================================
   ESTATÍSTICAS DO PAINEL
========================================================= */

app.get(
  "/api/dashboard",
  asyncRoute(async (_, res) => {

    const insumos =
      await pool.query(
        `
        SELECT COUNT(*)::integer AS total
        FROM insumos
        WHERE ativo = TRUE
        `
      );

    const fichas =
      await pool.query(
        `
        SELECT COUNT(*)::integer AS total
        FROM fichas
        WHERE ativo = TRUE
        `
      );

    const custos =
      await pool.query(
        fichaSelect +
        `
        WHERE f.ativo = TRUE
        GROUP BY f.id
        `
      );

    const comCmv =
      custos.rows.filter(
        f =>
          n(f.preco_venda) > 0 &&
          n(f.cmv_percentual) > 0
      );

    const cmvMedio =
      comCmv.length
        ? comCmv.reduce(
            (soma, ficha) =>
              soma +
              n(ficha.cmv_percentual),
            0
          ) / comCmv.length
        : 0;

    res.json({
      insumos:
        insumos.rows[0].total,

      fichas:
        fichas.rows[0].total,

      cmv_medio:
        cmvMedio
    });
  })
);

/* =========================================================
   TRATAMENTO DE ROTAS DE API INEXISTENTES
========================================================= */

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({
      error:
        "Rota da API não encontrada."
    });
  }
);

/* =========================================================
   TRATAMENTO DE ERROS
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(err);

    res.status(500).json({
      error:
        "Erro interno do servidor.",

      detail:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : err.message
    });
  }
);

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

init()
  .then(() => {

    app.listen(
      port,
      "0.0.0.0",
      () => {

        console.log(
          `Ficha Técnica Rafael Vidal rodando na porta ${port}`
        );

      }
    );

  })
  .catch(error => {

    console.error(
      "Falha ao iniciar o banco de dados:",
      error
    );

    process.exit(1);
  });
