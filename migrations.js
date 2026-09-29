/* Central de migrations incrementais do MISEVO. */
export async function migrateProducaoSchema(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS misevo_migrations(chave TEXT PRIMARY KEY,executed_at TIMESTAMPTZ DEFAULT NOW());
    DO $do$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM misevo_migrations WHERE chave='producao_status_concluida_20260929') THEN
        ALTER TABLE ordens_producao DROP CONSTRAINT IF EXISTS ordens_producao_status_check;
        UPDATE ordens_producao SET status='concluida' WHERE status='finalizada';
        ALTER TABLE ordens_producao ADD CONSTRAINT ordens_producao_status_check CHECK(status IN ('planejada','cancelada','anulada','em_producao','concluida'));
        INSERT INTO misevo_migrations(chave) VALUES('producao_status_concluida_20260929');
      END IF;
    END
    $do$;
  `);
  await pool.query(`ALTER TABLE ordens_producao ALTER COLUMN preparacao_id DROP NOT NULL; ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS ficha_id BIGINT; ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS item_nome TEXT;`);
  // ficha_id permanece apenas como identificador histórico.
  // As FKs legadas serão removidas somente após validação funcional completa.

  // Novas OPs já gravam item_nome. Registros sem snapshot recebem um identificador estável,
  // sem consultar a tabela legada.
  await pool.query(`UPDATE ordens_producao o
    SET item_nome=COALESCE(
      (SELECT p.nome FROM preparacoes p WHERE p.id=o.preparacao_id),
      'Produção #'||o.id
    )
    WHERE o.item_nome IS NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordens_producao(
      id BIGSERIAL PRIMARY KEY,
      preparacao_id BIGINT REFERENCES preparacoes(id) ON DELETE RESTRICT,
      ficha_id BIGINT,
      quantidade_planejada NUMERIC(14,4) NOT NULL,
      rendimento_real NUMERIC(14,4),
      unidade TEXT NOT NULL DEFAULT 'KG',
      status TEXT NOT NULL DEFAULT 'planejada' CHECK(status IN ('planejada','cancelada','anulada','em_producao','concluida')),
      custo_teorico NUMERIC(14,4) NOT NULL DEFAULT 0,
      custo_real NUMERIC(14,4),
      observacoes TEXT NOT NULL DEFAULT '',
      usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id BIGINT NOT NULL,
      unidade_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finalizada_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ordens_producao_tenant ON ordens_producao(empresa_id,unidade_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS producao_consumos(
      id BIGSERIAL PRIMARY KEY,
      ordem_id BIGINT NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
      insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
      quantidade_teorica NUMERIC(14,4) NOT NULL,
      quantidade_real NUMERIC(14,4),
      custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_producao_consumos_ordem ON producao_consumos(ordem_id);\n    ALTER TABLE producao_consumos ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT FALSE;\n    ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS estoque_baixado BOOLEAN NOT NULL DEFAULT FALSE;\n    ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS ordem_producao_id BIGINT REFERENCES ordens_producao(id) ON DELETE SET NULL;\n    CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_mov_op_insumo_saida ON estoque_movimentacoes(ordem_producao_id,insumo_id) WHERE ordem_producao_id IS NOT NULL AND tipo='saida';
    CREATE TABLE IF NOT EXISTS estoque_produzidos(
      id BIGSERIAL PRIMARY KEY,
      ordem_producao_id BIGINT REFERENCES ordens_producao(id) ON DELETE SET NULL,
      ficha_id BIGINT,
      preparacao_id BIGINT REFERENCES preparacoes(id) ON DELETE RESTRICT,
      nome TEXT NOT NULL,
      unidade TEXT NOT NULL DEFAULT 'KG',
      tipo TEXT NOT NULL CHECK(tipo IN ('producao','consumo','ajuste','estorno')),
      quantidade NUMERIC(14,4) NOT NULL,
      saldo_anterior NUMERIC(14,4) NOT NULL,
      saldo_novo NUMERIC(14,4) NOT NULL,
      custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
      usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id BIGINT NOT NULL,
      unidade_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((ficha_id IS NOT NULL)::int + (preparacao_id IS NOT NULL)::int = 1)
    );
    CREATE INDEX IF NOT EXISTS idx_estoque_produzidos_tenant ON estoque_produzidos(empresa_id,unidade_id,created_at DESC);
    ALTER TABLE estoque_produzidos ADD COLUMN IF NOT EXISTS origem_legada TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_produzidos_origem_legada
      ON estoque_produzidos(origem_legada) WHERE origem_legada IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_produzidos_op_entrada ON estoque_produzidos(ordem_producao_id) WHERE ordem_producao_id IS NOT NULL AND tipo='producao';
    CREATE TABLE IF NOT EXISTS producao_componentes(
      id BIGSERIAL PRIMARY KEY,
      ordem_id BIGINT NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
      preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id) ON DELETE RESTRICT,
      quantidade_teorica NUMERIC(14,4) NOT NULL,
      quantidade_real NUMERIC(14,4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_producao_componentes_ordem ON producao_componentes(ordem_id);
  `);
}


export async function migrateOperacaoCompletaSchema(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS etiqueta_registros(
      id BIGSERIAL PRIMARY KEY,
      insumo_id BIGINT REFERENCES insumos(id) ON DELETE SET NULL,
      item_nome TEXT NOT NULL,
      producao DATE NOT NULL,
      validade DATE NOT NULL,
      responsavel TEXT DEFAULT '',
      quantidade INTEGER NOT NULL DEFAULT 1,
      usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id BIGINT NOT NULL,
      unidade_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_etiqueta_registros_tenant_validade ON etiqueta_registros(empresa_id,unidade_id,validade,created_at DESC);
    ALTER TABLE perdas ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
    ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS misevo_migrations(chave TEXT PRIMARY KEY,executed_at TIMESTAMPTZ DEFAULT NOW());
  `);
}

export async function migrateEstoqueSchema(pool){
  await pool.query(`
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC(14,4) NOT NULL DEFAULT 0;
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS estoque_maximo NUMERIC(14,4) NOT NULL DEFAULT 0;
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS local_estoque TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS estoque_movimentacoes(
      id BIGSERIAL PRIMARY KEY,
      insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida','perda','ajuste')),
      quantidade NUMERIC(14,4) NOT NULL,
      saldo_anterior NUMERIC(14,4) NOT NULL,
      saldo_novo NUMERIC(14,4) NOT NULL,
      motivo TEXT NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id BIGINT NOT NULL,
      unidade_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_tenant ON estoque_movimentacoes(empresa_id,unidade_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_insumo ON estoque_movimentacoes(insumo_id,created_at DESC);
  `);
  await pool.query(`
    ALTER TABLE insumos
    ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'Outros';
  `);

}

export async function migratePreparacoesSchema(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preparacoes (
      id BIGSERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Outros',
      rendimento NUMERIC(14,4) NOT NULL DEFAULT 1,
      unidade_rendimento TEXT NOT NULL DEFAULT 'KG',
      quantidade_porcoes NUMERIC(14,3),
      peso_porcao NUMERIC(14,3),
      preco_venda_porcao NUMERIC(14,2),
      meta_cmv NUMERIC(7,3) NOT NULL DEFAULT 30,
      modo_preparo TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      empresa_id BIGINT NOT NULL REFERENCES empresas(id),
      unidade_id BIGINT NOT NULL REFERENCES unidades(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE preparacoes ADD COLUMN IF NOT EXISTS quantidade_porcoes NUMERIC(14,3);
    ALTER TABLE preparacoes ADD COLUMN IF NOT EXISTS peso_porcao NUMERIC(14,3);
    ALTER TABLE preparacoes ADD COLUMN IF NOT EXISTS preco_venda_porcao NUMERIC(14,2);
    ALTER TABLE preparacoes ADD COLUMN IF NOT EXISTS meta_cmv NUMERIC(7,3) NOT NULL DEFAULT 30;
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS producao_id BIGINT REFERENCES preparacoes(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_insumo_producao_tenant
      ON insumos(producao_id,empresa_id,unidade_id) WHERE producao_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS preparacao_ingredientes (
      id BIGSERIAL PRIMARY KEY,
      preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id) ON DELETE CASCADE,
      insumo_id BIGINT NOT NULL REFERENCES insumos(id),
      quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      observacoes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS preparacao_componentes (
      id BIGSERIAL PRIMARY KEY,
      preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id) ON DELETE CASCADE,
      componente_id BIGINT NOT NULL REFERENCES preparacoes(id),
      quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      observacoes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT prep_componente_diferente CHECK (preparacao_id <> componente_id)
    );

    CREATE INDEX IF NOT EXISTS idx_preparacoes_tenant ON preparacoes(empresa_id,unidade_id);
    CREATE INDEX IF NOT EXISTS idx_prep_ing_prep ON preparacao_ingredientes(preparacao_id);
    CREATE INDEX IF NOT EXISTS idx_prep_comp_prep ON preparacao_componentes(preparacao_id);
    CREATE INDEX IF NOT EXISTS idx_prep_comp_comp ON preparacao_componentes(componente_id);
  `);
}

export async function migrateOperacaoSchema(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS fornecedores (
  id BIGSERIAL PRIMARY KEY, nome TEXT NOT NULL, contato TEXT DEFAULT '', email TEXT DEFAULT '', telefone TEXT DEFAULT '',
  observacoes TEXT DEFAULT '', ativo BOOLEAN NOT NULL DEFAULT TRUE, empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant ON fornecedores(empresa_id,unidade_id,nome);
 CREATE TABLE IF NOT EXISTS compras (
  id BIGSERIAL PRIMARY KEY, fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL, numero_documento TEXT DEFAULT '',
  data_compra DATE DEFAULT CURRENT_DATE, total NUMERIC(14,4) NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT DEFAULT '', empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS compra_itens (
  id BIGSERIAL PRIMARY KEY, compra_id BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  insumo_id BIGINT REFERENCES insumos(id) ON DELETE SET NULL, descricao TEXT NOT NULL, quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
  unidade TEXT DEFAULT 'KG', preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0, total NUMERIC(14,4) NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS historico_precos (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL, preco_unitario NUMERIC(14,4) NOT NULL,
  data_preco DATE DEFAULT CURRENT_DATE, compra_id BIGINT REFERENCES compras(id) ON DELETE SET NULL,
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS inventarios (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  quantidade_contada NUMERIC(14,4) NOT NULL DEFAULT 0, data_contagem TIMESTAMPTZ DEFAULT NOW(), responsavel TEXT DEFAULT '',
  observacoes TEXT DEFAULT '', empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS perdas (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  quantidade NUMERIC(14,4) NOT NULL, motivo TEXT DEFAULT '', custo NUMERIC(14,4) NOT NULL DEFAULT 0,
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS documentos_operacionais (
  id BIGSERIAL PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'outro', nome TEXT NOT NULL, emissor TEXT DEFAULT '', referencia TEXT DEFAULT '',
  emissao DATE, validade DATE, status TEXT NOT NULL DEFAULT 'valido', observacoes TEXT DEFAULT '',
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
 );`);
}
