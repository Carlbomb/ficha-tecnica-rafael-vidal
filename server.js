import express from "express";
import pg from "pg";
import { installAuth } from "./auth.js";
import { initCoreTenancy, migrateOperationalTenancy } from "./multitenancy.js";
import { initPreparacoes, installPreparacoes, calcularCustoPreparacao, listarPreparacoesComCusto } from "./preparacoes.js";
import { initCategorias, installCategorias } from "./categorias.js";
import { initEstoque, installEstoque } from "./estoque.js";
import { initProducao, installProducao } from "./producao.js";
import { initOperacao, installOperacao } from "./operacao.js";
import { initOperacaoCompleta, installOperacaoCompleta } from "./operacao-completa.js";
import { initTenantAdmin, installTenantAdmin } from "./tenant-admin.js";
import { installImportacao } from "./importacao.js";
import { migrateProducaoSchema, migrateOperacaoCompletaSchema, migrateEstoqueSchema } from "./migrations.js";

const { Pool } = pg;

const app = express();

const port =
  Number(
    process.env.PORT ||
    3000
  );

const pool =
  new Pool({
    connectionString:
      process.env.DATABASE_URL,

    ssl:
      process.env.DATABASE_URL
        ?.includes(
          "railway.internal"
        )
        ? false
        : {
            rejectUnauthorized:
              false
          }
  });

app.use(
  express.json({
    limit: "16mb"
  })
);

app.use((req,res,next)=>{
  if(req.path==="/" || req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css")){
    res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma","no-cache");
    res.set("Expires","0");
  }
  next();
});

app.use(
  express.static(
    "public",
    { etag: true, maxAge: 0 }
  )
);

// Fundação multiempresa precisa existir antes da autenticação.
await initCoreTenancy(pool);

// Login, sessões e permissões
await installAuth(app, pool);

// Preparações / Sub-receitas
installPreparacoes(app, pool);
installCategorias(app, pool);
installEstoque(app, pool);
installProducao(app, pool);
installOperacao(app, pool);
installOperacaoCompleta(app, pool);
installTenantAdmin(app, pool);
installImportacao(app, pool);

const n = value => {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
};

const asyncRoute =
  fn =>
  (
    req,
    res,
    next
  ) =>
    Promise
      .resolve(
        fn(
          req,
          res,
          next
        )
      )
      .catch(next);

/* =========================================================
   BANCO DE DADOS
========================================================= */

const schema = `

CREATE TABLE IF NOT EXISTS insumos (
  id BIGSERIAL PRIMARY KEY,

  ingrediente TEXT NOT NULL,

  unidade TEXT NOT NULL
    DEFAULT 'KG',

  peso_bruto NUMERIC(14,4)
    NOT NULL DEFAULT 1,

  peso_liquido NUMERIC(14,4)
    NOT NULL DEFAULT 1,

  fc NUMERIC(14,4)
    NOT NULL DEFAULT 1,

  preco_compra NUMERIC(14,4)
    NOT NULL DEFAULT 0,

  preco_real NUMERIC(14,4)
    NOT NULL DEFAULT 0,

  fornecedor TEXT DEFAULT '',

  data_cotacao DATE,

  ativo BOOLEAN NOT NULL
    DEFAULT TRUE,

  observacoes TEXT DEFAULT '',

  created_at TIMESTAMPTZ
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ
    DEFAULT NOW()
);

-- Tabelas legadas fichas/ingredientes não são mais criadas pelo schema ativo.
-- Bancos existentes preservam seus registros históricos até a aposentadoria física controlada.

CREATE INDEX IF NOT EXISTS
  idx_insumos_ingrediente
  ON insumos(ingrediente);

`;

async function init() {
  await pool.query(
    schema
  );

  // Vincula os dados operacionais existentes à empresa/unidade inicial.
  await migrateOperationalTenancy(pool);

  // Estrutura de Preparações / Sub-receitas
  await initPreparacoes(pool);
  await initCategorias(pool);
  await migrateEstoqueSchema(pool);
  await initEstoque(pool);
  await migrateProducaoSchema(pool);
  await initProducao(pool);
  await initOperacao(pool);
  await migrateOperacaoCompletaSchema(pool);
  await initOperacaoCompleta(pool);


  await initTenantAdmin(pool);

  console.log(
    "Banco de dados pronto"
  );
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",

  asyncRoute(
    async (_, res) => {

      await pool.query(
        "SELECT 1"
      );

      res.json({
        ok: true,

        database: true,

        sistema:
          "MISEVO"
      });
    }
  )
);

/* =========================================================
   BANCO DE DADOS / INSUMOS
========================================================= */

app.get(
  "/api/insumos",

  asyncRoute(
    async (req, res) => {

      const { rows } =
        await pool.query(`
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
          WHERE empresa_id = $1
            AND unidade_id = $2
          ORDER BY id
        `, [req.user.empresa_id, req.user.unidade_id]);

      res.json(
        rows
      );
    }
  )
);

app.get(
  "/api/insumos/:id",

  asyncRoute(
    async (
      req,
      res
    ) => {

      const { rows } =
        await pool.query(
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
            AND empresa_id = $2
            AND unidade_id = $3
          `,
          [
            req.params.id,
            req.user.empresa_id,
            req.user.unidade_id
          ]
        );

      if (!rows[0]) {
        return res
          .status(404)
          .json({
            error:
              "Insumo não encontrado."
          });
      }

      res.json(
        rows[0]
      );
    }
  )
);

/* =========================================================
   NOVO INSUMO

   FC =
   PESO BRUTO / PESO LÍQUIDO

   PREÇO REAL =
   PREÇO COMPRA * FC
========================================================= */

app.post(
  "/api/insumos",

  asyncRoute(
    async (
      req,
      res
    ) => {

      const b =
        req.body;

      const ingrediente =
        String(
          b.ingrediente ||
          ""
        ).trim();

      if (!ingrediente) {
        return res
          .status(400)
          .json({
            error:
              "Informe o ingrediente."
          });
      }

      const unidade =
        String(
          b.unidade ||
          "KG"
        ).toUpperCase();

      const pesoBruto =
        n(
          b.peso_bruto
        );

      const pesoLiquido =
        n(
          b.peso_liquido
        );

      if (
        pesoBruto <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "O peso bruto deve ser maior que zero."
          });
      }

      if (
        pesoLiquido <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "O peso líquido deve ser maior que zero."
          });
      }

      const fc =
        pesoBruto /
        pesoLiquido;

      const precoCompra =
        n(
          b.preco_compra
        );

      const precoReal =
        precoCompra *
        fc;

      const fornecedor =
        String(
          b.fornecedor ||
          ""
        ).trim();

      const dataCotacao =
        b.data_cotacao ||
        null;

      const observacoes =
        String(
          b.observacoes ||
          ""
        ).trim();

      const ativo =
        b.ativo !== false;
            const { rows } =
        await pool.query(
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
            observacoes,
            empresa_id,
            unidade_id
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,$11,
            $12,$13
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
            fornecedor,
            dataCotacao,
            ativo,
            observacoes,
            req.user.empresa_id,
            req.user.unidade_id
          ]
        );

      res
        .status(201)
        .json(
          rows[0]
        );
    }
  )
);

/* =========================================================
   EDITAR INSUMO
========================================================= */

app.put(
  "/api/insumos/:id",

  asyncRoute(
    async (
      req,
      res
    ) => {

      const b =
        req.body;

      const ingrediente =
        String(
          b.ingrediente ||
          ""
        ).trim();

      if (!ingrediente) {
        return res
          .status(400)
          .json({
            error:
              "Informe o ingrediente."
          });
      }

      const unidade =
        String(
          b.unidade ||
          "KG"
        ).toUpperCase();

      const pesoBruto =
        n(
          b.peso_bruto
        );

      const pesoLiquido =
        n(
          b.peso_liquido
        );

      if (
        pesoBruto <= 0 ||
        pesoLiquido <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "Peso bruto e peso líquido devem ser maiores que zero."
          });
      }

      const fc =
        pesoBruto /
        pesoLiquido;

      const precoCompra =
        n(
          b.preco_compra
        );

      const precoReal =
        precoCompra *
        fc;

      const { rows } =
        await pool.query(
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
            AND empresa_id = $13
            AND unidade_id = $14

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
            b.fornecedor ||
              "",
            b.data_cotacao ||
              null,
            b.ativo !== false,
            b.observacoes ||
              "",
            req.params.id,
            req.user.empresa_id,
            req.user.unidade_id
          ]
        );

      if (!rows[0]) {
        return res
          .status(404)
          .json({
            error:
              "Insumo não encontrado."
          });
      }

      res.json(
        rows[0]
      );
    }
  )
);

/* =========================================================
   EXCLUIR INSUMO
========================================================= */

app.delete(
  "/api/insumos/:id",

  asyncRoute(
    async (
      req,
      res
    ) => {

      try {

        const result =
          await pool.query(
            `
            DELETE FROM insumos
            WHERE id = $1
              AND empresa_id = $2
              AND unidade_id = $3
            `,
            [
              req.params.id,
              req.user.empresa_id,
              req.user.unidade_id
            ]
          );

        if (
          !result.rowCount
        ) {
          return res
            .status(404)
            .json({
              error:
                "Insumo não encontrado."
            });
        }

        res
          .status(204)
          .end();

      } catch (e) {

        if (
          e.code ===
          "23503"
        ) {
          return res
            .status(409)
            .json({
              error:
                "Este insumo está sendo utilizado em uma ficha técnica."
            });
        }

        throw e;
      }
    }
  )
);

/* =========================================================
   CÁLCULO DA FICHA TÉCNICA

   A ficha sempre consulta os valores
   ATUAIS do Banco de Dados.

   CUSTO TOTAL =
   soma de quantidade × preço real

   CMV ATUAL =
   custo por porção / preço de venda × 100

   PREÇO SUGERIDO =
   custo por porção / (meta CMV / 100)
========================================================= */

function fichaLegadaSomenteLeitura(req,res){
  return res.status(410).json({
    error:"Esta rota de Ficha Técnica foi aposentada. Use o modelo atual de Fichas Técnicas.",
    codigo:"FICHA_LEGADA_SOMENTE_LEITURA"
  });
}

// Rotas legadas permanecem apenas como resposta 410; não consultam mais tabelas antigas.
app.get("/api/fichas", fichaLegadaSomenteLeitura);
app.get("/api/fichas/:id", fichaLegadaSomenteLeitura);

// Modelo legado somente leitura: novas operações devem usar /api/preparacoes.

/* =========================================================
   CRIAR FICHA COMPLETA
========================================================= */

app.post("/api/fichas", fichaLegadaSomenteLeitura);

/* =========================================================
   EDITAR FICHA COMPLETA

   A alteração também utiliza transação.

   Caso alguma etapa falhe,
   a ficha anterior permanece intacta.
========================================================= */

app.put("/api/fichas/:id", fichaLegadaSomenteLeitura);

/* =========================================================
   AÇÕES EM LOTE — FICHAS TÉCNICAS
========================================================= */
app.patch("/api/fichas/lote/grupo", fichaLegadaSomenteLeitura);

app.delete("/api/fichas/lote", fichaLegadaSomenteLeitura);

/* =========================================================
   EXCLUIR FICHA
========================================================= */

app.delete("/api/fichas/:id", fichaLegadaSomenteLeitura);

/* =========================================================
   CMV / RESUMO GERAL
========================================================= */

app.get(
  "/api/cmv",

  asyncRoute(
    async (
      req,
      res
    ) => {

      const fichas = await listarPreparacoesComCusto(
        pool,
        req.user.empresa_id,
        req.user.unidade_id
      );

      const normalizadas = fichas.map(ficha => {
        const porcoes = n(ficha.quantidade_porcoes);
        const custoTotal = n(ficha.custo_total);
        const custoPorcao = porcoes > 0 ? custoTotal / porcoes : 0;
        const precoVenda = n(ficha.preco_venda_porcao);
        const meta = n(ficha.meta_cmv);
        const cmvPercentual = precoVenda > 0 && custoPorcao > 0
          ? (custoPorcao / precoVenda) * 100
          : 0;

        return {
          ...ficha,
          nome_prato: ficha.nome,
          porcoes,
          preco_venda: precoVenda,
          custo_por_porcao: custoPorcao,
          cmv_percentual: cmvPercentual,
          preco_meta: porcoes > 0 && meta > 0
            ? custoPorcao / (meta / 100)
            : 0
        };
      });

      const validas = normalizadas.filter(
        ficha => n(ficha.cmv_percentual) > 0
      );

      const cmvMedio = validas.length
        ? validas.reduce((soma, ficha) => soma + n(ficha.cmv_percentual), 0) / validas.length
        : 0;

      res.json({
        total_fichas: normalizadas.length,
        cmv_medio: cmvMedio,
        fichas: normalizadas
      });
    }
  )
);

/* =========================================================
   ESTATÍSTICAS DO PAINEL
========================================================= */

app.get(
  "/api/dashboard",

  asyncRoute(
    async (
      req,
      res
    ) => {

      const insumos =
        await pool.query(
          `
          SELECT
            COUNT(*)::integer
            AS total
          FROM insumos
          WHERE
            ativo = TRUE
            AND empresa_id = $1
            AND unidade_id = $2
          `,
          [req.user.empresa_id, req.user.unidade_id]
        );

      // A tela atual de Fichas Técnicas usa preparacoes como fonte oficial.
      // O modelo legado "fichas" permanece apenas para compatibilidade/histórico.
      const fichas =
        await pool.query(
          `
          SELECT
            COUNT(*)::integer
            AS total
          FROM preparacoes
          WHERE
            ativo = TRUE
            AND empresa_id = $1
            AND unidade_id = $2
          `,
          [req.user.empresa_id, req.user.unidade_id]
        );

      const custos = await listarPreparacoesComCusto(
        pool,
        req.user.empresa_id,
        req.user.unidade_id
      );

      const comCmv = custos
        .map(ficha => {
          const porcoes = n(ficha.quantidade_porcoes);
          const custoPorcao = porcoes > 0 ? n(ficha.custo_total) / porcoes : 0;
          const precoVenda = n(ficha.preco_venda_porcao);
          return precoVenda > 0 && custoPorcao > 0
            ? (custoPorcao / precoVenda) * 100
            : 0;
        })
        .filter(cmv => cmv > 0);

      const cmvMedio = comCmv.length
        ? comCmv.reduce((soma, cmv) => soma + cmv, 0) / comCmv.length
        : 0;

      res.json({
        insumos:
          insumos
            .rows[0]
            .total,

        fichas:
          fichas
            .rows[0]
            .total,

        cmv_medio:
          cmvMedio
      });
    }
  )
);

/* =========================================================
   ROTAS DE API INEXISTENTES
========================================================= */

app.use(
  "/api",

  (
    req,
    res
  ) => {

    res
      .status(404)
      .json({
        error:
          "Rota da API não encontrada."
      });
  }
);

/* =========================================================
   TRATAMENTO DE ERROS
========================================================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      err
    );

    res
      .status(500)
      .json({
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
  .then(
    () => {

      app.listen(
        port,
        "0.0.0.0",
        () => {

          console.log(
            `MISEVO rodando na porta ${port}`
          );

        }
      );

    }
  )
  .catch(
    error => {

      console.error(
        "Falha ao iniciar o banco de dados:",
        error
      );

      process.exit(
        1
      );
    }
  );
