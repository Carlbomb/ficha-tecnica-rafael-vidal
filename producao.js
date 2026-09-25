/* MISEVO — Produção integrada ao Estoque — Fase 1 */
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};

async function saldoInsumo(db,id,empresaId,unidadeId){
  const {rows}=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo
    FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$2 AND unidade_id=$3`,[id,empresaId,unidadeId]);
  return n(rows[0]?.saldo);
}

export async function initProducao(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ordens_producao(
      id BIGSERIAL PRIMARY KEY,
      preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id) ON DELETE RESTRICT,
      quantidade_planejada NUMERIC(14,4) NOT NULL,
      rendimento_real NUMERIC(14,4),
      unidade TEXT NOT NULL DEFAULT 'KG',
      status TEXT NOT NULL DEFAULT 'planejada' CHECK(status IN ('planejada','finalizada','cancelada')),
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
    CREATE INDEX IF NOT EXISTS idx_producao_consumos_ordem ON producao_consumos(ordem_id);
  `);
}

export function installProducao(app,pool){
  app.get("/api/producao/ordens",async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT o.*,p.nome preparacao_nome
      FROM ordens_producao o JOIN preparacoes p ON p.id=o.preparacao_id
      WHERE o.empresa_id=$1 AND o.unidade_id=$2 ORDER BY o.created_at DESC LIMIT 200`,
      [req.user.empresa_id,req.user.unidade_id]);res.json(rows);
  }catch(e){next(e)}});

  app.post("/api/producao/planejar",async(req,res,next)=>{
    const c=await pool.connect();
    try{
      const preparacaoId=Number(req.body.preparacao_id),quantidade=n(req.body.quantidade);
      if(!preparacaoId||quantidade<=0)return res.status(400).json({error:"Informe a preparação e a quantidade a produzir."});
      await c.query("BEGIN");
      const p=await c.query(`SELECT id,nome,rendimento,unidade_rendimento FROM preparacoes
        WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE FOR UPDATE`,
        [preparacaoId,req.user.empresa_id,req.user.unidade_id]);
      if(!p.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Preparação não encontrada."})}
      const rendimento=n(p.rows[0].rendimento);
      if(rendimento<=0){await c.query("ROLLBACK");return res.status(400).json({error:"A preparação não possui rendimento válido."})}
      const fator=quantidade/rendimento;
      const ing=await c.query(`WITH RECURSIVE arvore(preparacao_id,fator,caminho) AS (
          SELECT $1::bigint,$4::numeric,ARRAY[$1::bigint]
          UNION ALL
          SELECT pc.componente_id,a.fator*pc.quantidade/NULLIF(p.rendimento,0),a.caminho||pc.componente_id
          FROM arvore a JOIN preparacao_componentes pc ON pc.preparacao_id=a.preparacao_id
          JOIN preparacoes p ON p.id=pc.componente_id AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE
          WHERE NOT pc.componente_id=ANY(a.caminho)
        )
        SELECT pi.insumo_id,SUM(pi.quantidade*a.fator)::numeric quantidade,i.ingrediente,i.unidade,i.preco_real
        FROM arvore a JOIN preparacao_ingredientes pi ON pi.preparacao_id=a.preparacao_id
        JOIN insumos i ON i.id=pi.insumo_id AND i.empresa_id=$2 AND i.unidade_id=$3
        GROUP BY pi.insumo_id,i.ingrediente,i.unidade,i.preco_real ORDER BY i.ingrediente`,
        [preparacaoId,req.user.empresa_id,req.user.unidade_id,fator]);
      let custo=0;const itens=[];
      for(const x of ing.rows){
        const necessaria=n(x.quantidade),disponivel=await saldoInsumo(c,x.insumo_id,req.user.empresa_id,req.user.unidade_id);
        custo+=necessaria*n(x.preco_real);
        itens.push({...x,quantidade_necessaria:necessaria,saldo_disponivel:disponivel,falta:Math.max(0,necessaria-disponivel)});
      }
      const op=await c.query(`INSERT INTO ordens_producao(preparacao_id,quantidade_planejada,unidade,custo_teorico,observacoes,usuario_id,empresa_id,unidade_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [preparacaoId,quantidade,p.rows[0].unidade_rendimento,custo,String(req.body.observacoes||"").trim(),req.user.id,req.user.empresa_id,req.user.unidade_id]);
      for(const x of itens)await c.query(`INSERT INTO producao_consumos(ordem_id,insumo_id,quantidade_teorica,custo_unitario)
        VALUES($1,$2,$3,$4)`,[op.rows[0].id,x.insumo_id,x.quantidade_necessaria,n(x.preco_real)]);
      await c.query("COMMIT");
      res.status(201).json({...op.rows[0],preparacao_nome:p.rows[0].nome,itens,estoque_suficiente:itens.every(x=>x.falta<=0)});
    }catch(e){await c.query("ROLLBACK");next(e)}finally{c.release()}
  });

  app.post("/api/producao/ordens/:id/finalizar",async(req,res,next)=>{
    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      const o=await c.query(`SELECT * FROM ordens_producao WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 FOR UPDATE`,
        [req.params.id,req.user.empresa_id,req.user.unidade_id]);
      if(!o.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Ordem de produção não encontrada."})}
      if(o.rows[0].status!=="planejada"){await c.query("ROLLBACK");return res.status(409).json({error:"Esta ordem não está aberta."})}
      const consumos=await c.query(`SELECT pc.*,i.ingrediente,i.unidade FROM producao_consumos pc JOIN insumos i ON i.id=pc.insumo_id WHERE pc.ordem_id=$1 ORDER BY pc.id`,[req.params.id]);
      let custoReal=0;
      for(const x of consumos.rows){
        const qtd=n(x.quantidade_teorica),anterior=await saldoInsumo(c,x.insumo_id,req.user.empresa_id,req.user.unidade_id);
        if(anterior<qtd){await c.query("ROLLBACK");return res.status(409).json({error:`Estoque insuficiente de ${x.ingrediente}. Necessário: ${qtd} ${x.unidade}; disponível: ${anterior} ${x.unidade}.`})}
        const novo=anterior-qtd;
        await c.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id)
          VALUES($1,'saida',$2,$3,$4,$5,$6,$7,$8,$9)`,
          [x.insumo_id,-qtd,anterior,novo,`Produção OP #${req.params.id}`,"Baixa automática pela produção",req.user.id,req.user.empresa_id,req.user.unidade_id]);
        await c.query("UPDATE producao_consumos SET quantidade_real=$1 WHERE id=$2",[qtd,x.id]);
        custoReal+=qtd*n(x.custo_unitario);
      }
      const rendimentoReal=n(req.body.rendimento_real)||n(o.rows[0].quantidade_planejada);
      const {rows}=await c.query(`UPDATE ordens_producao SET status='finalizada',rendimento_real=$1,custo_real=$2,finalizada_at=NOW()
        WHERE id=$3 RETURNING *`,[rendimentoReal,custoReal,req.params.id]);
      const custoUnitario=rendimentoReal>0?custoReal/rendimentoReal:0;
      await c.query(`INSERT INTO estoque_preparacoes(preparacao_id,quantidade,tipo,referencia,custo_unitario,usuario_id,empresa_id,unidade_id)
        VALUES($1,$2,'producao',$3,$4,$5,$6,$7)`,[o.rows[0].preparacao_id,rendimentoReal,`OP #${req.params.id}`,custoUnitario,req.user.id,req.user.empresa_id,req.user.unidade_id]);
      await c.query("COMMIT");res.json({...rows[0],entrada_estoque:true,custo_unitario:custoUnitario});
    }catch(e){await c.query("ROLLBACK");next(e)}finally{c.release()}
  });
}
