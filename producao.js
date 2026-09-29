/* MISEVO — Produção integrada ao Estoque — Fase 1 */
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
// Estoque operacional em KG: precisão de 1 g, igual ao valor exibido à equipe.
const qEstoque=v=>Math.round((n(v)+Number.EPSILON)*1000)/1000;

async function saldoInsumo(db,id,empresaId,unidadeId){
  const {rows}=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo
    FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$2 AND unidade_id=$3`,[id,empresaId,unidadeId]);
  return n(rows[0]?.saldo);
}

async function saldoProduzido(db,{fichaId=null,preparacaoId=null,empresaId,unidadeId}){
  const {rows}=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo FROM estoque_produzidos
    WHERE empresa_id=$1 AND unidade_id=$2 AND ficha_id IS NOT DISTINCT FROM $3 AND preparacao_id IS NOT DISTINCT FROM $4`,
    [empresaId,unidadeId,fichaId,preparacaoId]);
  return qEstoque(rows[0]?.saldo);
}

async function consumirPreparacaoProduzida(db,{preparacaoId,quantidade,ordemId,usuarioId,empresaId,unidadeId}){
  const pedido=qEstoque(quantidade); if(pedido<=0)return {consumido:0,falta:0};
  const meta=await db.query(`SELECT id,nome,unidade_rendimento FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE`,
    [preparacaoId,empresaId,unidadeId]);
  if(!meta.rows[0])return {consumido:0,falta:pedido};
  const anterior=await saldoProduzido(db,{preparacaoId,empresaId,unidadeId});
  const consumido=qEstoque(Math.min(Math.max(anterior,0),pedido));
  if(consumido>0){
    await db.query(`INSERT INTO estoque_produzidos(ordem_producao_id,preparacao_id,nome,unidade,tipo,quantidade,saldo_anterior,saldo_novo,custo_unitario,usuario_id,empresa_id,unidade_id)
      VALUES($1,$2,$3,$4,'consumo',$5,$6,$7,0,$8,$9,$10)`,
      [ordemId,preparacaoId,meta.rows[0].nome,meta.rows[0].unidade_rendimento,-consumido,anterior,qEstoque(anterior-consumido),usuarioId,empresaId,unidadeId]);
  }
  return {consumido,falta:qEstoque(pedido-consumido)};
}

export async function initProducao(pool){
  await pool.query(`ALTER TABLE ordens_producao DROP CONSTRAINT IF EXISTS ordens_producao_status_check; ALTER TABLE ordens_producao ADD CONSTRAINT ordens_producao_status_check CHECK(status IN ('planejada','finalizada','cancelada','anulada','em_producao','concluida'));`);
  await pool.query(`ALTER TABLE ordens_producao ALTER COLUMN preparacao_id DROP NOT NULL; ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS ficha_id BIGINT; ALTER TABLE ordens_producao ADD COLUMN IF NOT EXISTS item_nome TEXT;`);
  // ficha_id permanece apenas como identificador histórico, sem FK para a tabela legada.
  await pool.query(`DO $ DECLARE r record; BEGIN
    FOR r IN SELECT conname FROM pg_constraint
      WHERE conrelid='ordens_producao'::regclass AND contype='f'
        AND confrelid=to_regclass('fichas')
    LOOP EXECUTE format('ALTER TABLE ordens_producao DROP CONSTRAINT %I',r.conname); END LOOP;
    IF to_regclass('estoque_produzidos') IS NOT NULL THEN
      FOR r IN SELECT conname FROM pg_constraint
        WHERE conrelid='estoque_produzidos'::regclass AND contype='f'
          AND confrelid=to_regclass('fichas')
      LOOP EXECUTE format('ALTER TABLE estoque_produzidos DROP CONSTRAINT %I',r.conname); END LOOP;
    END IF;
  END $;`);
  // Snapshot histórico: preserva o nome da OP para que leituras futuras não dependam da tabela fichas.
  await pool.query(`UPDATE ordens_producao o
    SET item_nome=COALESCE(
      (SELECT p.nome FROM preparacoes p WHERE p.id=o.preparacao_id),
      (SELECT f.nome_prato FROM fichas f WHERE f.id=o.ficha_id),
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
      status TEXT NOT NULL DEFAULT 'planejada' CHECK(status IN ('planejada','finalizada','cancelada','anulada','em_producao','concluida')),
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
      ficha_id BIGINT REFERENCES fichas(id) ON DELETE RESTRICT,
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

export function installProducao(app,pool){
  app.get("/api/producao/ordens",async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT o.*,p.nome preparacao_nome,o.item_nome ficha_nome,COALESCE(o.item_nome,p.nome,'Produção #'||o.id) item_nome
      FROM ordens_producao o LEFT JOIN preparacoes p ON p.id=o.preparacao_id
      WHERE o.empresa_id=$1 AND o.unidade_id=$2 ORDER BY o.created_at DESC LIMIT 200`,
      [req.user.empresa_id,req.user.unidade_id]);res.json(rows);
  }catch(e){next(e)}});

  app.get("/api/producao/ordens/:id/separacao",async(req,res,next)=>{try{
    const ordem=await pool.query(`SELECT o.id,o.status,o.quantidade_planejada,o.unidade,COALESCE(o.item_nome,p.nome,'Produção #'||o.id) item_nome
      FROM ordens_producao o LEFT JOIN preparacoes p ON p.id=o.preparacao_id
      WHERE o.id=$1 AND o.empresa_id=$2 AND o.unidade_id=$3`,[req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!ordem.rows[0])return res.status(404).json({error:"Ordem não encontrada."});
    const {rows}=await pool.query(`SELECT pc.id,pc.insumo_id,pc.quantidade_teorica,pc.separado,i.ingrediente,i.unidade,
      COALESCE((SELECT SUM(m.quantidade) FROM estoque_movimentacoes m WHERE m.insumo_id=i.id AND m.empresa_id=$2 AND m.unidade_id=$3),0)::numeric saldo_disponivel
      FROM producao_consumos pc JOIN insumos i ON i.id=pc.insumo_id
      WHERE pc.ordem_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3 ORDER BY i.ingrediente`,[req.params.id,req.user.empresa_id,req.user.unidade_id]);
    res.json({ordem:ordem.rows[0],insumos:rows});
  }catch(e){next(e)}});

  app.patch("/api/producao/ordens/:id/separacao/:consumoId",async(req,res,next)=>{try{
    const {rows}=await pool.query(`UPDATE producao_consumos pc SET separado=$1
      FROM ordens_producao o WHERE pc.id=$2 AND pc.ordem_id=$3 AND o.id=pc.ordem_id
      AND o.empresa_id=$4 AND o.unidade_id=$5 AND o.status IN ('planejada','em_producao') RETURNING pc.*`,
      [req.body?.separado===true,req.params.consumoId,req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!rows[0])return res.status(404).json({error:"Item de separação não encontrado."});res.json(rows[0]);
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
      const op=await c.query(`INSERT INTO ordens_producao(preparacao_id,item_nome,quantidade_planejada,unidade,custo_teorico,observacoes,usuario_id,empresa_id,unidade_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [preparacaoId,p.rows[0].nome,quantidade,p.rows[0].unidade_rendimento,custo,String(req.body.observacoes||"").trim(),req.user.id,req.user.empresa_id,req.user.unidade_id]);
      for(const x of itens)await c.query(`INSERT INTO producao_consumos(ordem_id,insumo_id,quantidade_teorica,custo_unitario)
        VALUES($1,$2,$3,$4)`,[op.rows[0].id,x.insumo_id,x.quantidade_necessaria,n(x.preco_real)]);
      await c.query("COMMIT");
      res.status(201).json({...op.rows[0],preparacao_nome:p.rows[0].nome,itens,estoque_suficiente:itens.every(x=>x.falta<=0)});
    }catch(e){await c.query("ROLLBACK");next(e)}finally{c.release()}
  });


  app.post("/api/producao/planejar-fichas",async(req,res,next)=>{
    try{
      const solicitados=Array.isArray(req.body?.fichas)?req.body.fichas:[];
      const diretas=Array.isArray(req.body?.preparacoes)?req.body.preparacoes:[];
      if(solicitados.length)return res.status(410).json({error:"O planejamento por ficha legada foi aposentado. Use as Fichas Técnicas atuais.",codigo:"PRODUCAO_FICHA_LEGADA_APOSENTADA"});
      if(!diretas.length)return res.status(400).json({error:"Adicione pelo menos uma Ficha Técnica."});
      const pratos=[],preparacoes=new Map(),insumos=new Map();
      const addInsumo=(x,q)=>{
        const id=Number(x.insumo_id||x.id),atual=insumos.get(id)||{insumo_id:id,ingrediente:x.ingrediente,unidade:x.unidade,quantidade:0};
        atual.quantidade+=q;insumos.set(id,atual);
      };
      const addPrep=async(id,q,caminho=new Set())=>{
        id=Number(id);if(caminho.has(id))throw new Error("Foi detectado um ciclo entre preparações.");
        const p=await pool.query(`SELECT id,nome,rendimento,unidade_rendimento FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE`,[id,req.user.empresa_id,req.user.unidade_id]);
        if(!p.rows[0])throw new Error(`Preparação ${id} não encontrada.`);
        const prep=p.rows[0];
        const baseRows=await pool.query(`SELECT pi.quantidade,i.unidade FROM preparacao_ingredientes pi JOIN insumos i ON i.id=pi.insumo_id WHERE pi.preparacao_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3`,[id,req.user.empresa_id,req.user.unidade_id]);
        const compRows=await pool.query(`SELECT pc.quantidade,p2.unidade_rendimento unidade FROM preparacao_componentes pc JOIN preparacoes p2 ON p2.id=pc.componente_id WHERE pc.preparacao_id=$1 AND p2.empresa_id=$2 AND p2.unidade_id=$3 AND p2.ativo=TRUE`,[id,req.user.empresa_id,req.user.unidade_id]);
        const unidadeBase=String(prep.unidade_rendimento||"").toUpperCase();
        const todos=[...baseRows.rows,...compRows.rows],compativeis=todos.filter(x=>String(x.unidade||"").toUpperCase()===unidadeBase);
        const somaCompativeis=compativeis.reduce((s,x)=>s+n(x.quantidade),0);
        const r=todos.length>0&&compativeis.length===todos.length&&somaCompativeis>0?somaCompativeis:n(prep.rendimento);
        if(r<=0)throw new Error(`A preparação "${prep.nome}" não possui rendimento válido.`);
        const a=preparacoes.get(id)||{preparacao_id:id,nome:prep.nome,unidade:prep.unidade_rendimento,quantidade:0};a.quantidade+=q;preparacoes.set(id,a);
        const fator=q/r,prox=new Set(caminho);prox.add(id);
        const ing=await pool.query(`SELECT pi.insumo_id,pi.quantidade,i.ingrediente,i.unidade FROM preparacao_ingredientes pi JOIN insumos i ON i.id=pi.insumo_id WHERE pi.preparacao_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3`,[id,req.user.empresa_id,req.user.unidade_id]);
        for(const x of ing.rows)addInsumo(x,n(x.quantidade)*fator);
        const comps=await pool.query(`SELECT pc.componente_id,pc.quantidade FROM preparacao_componentes pc JOIN preparacoes p ON p.id=pc.componente_id WHERE pc.preparacao_id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE`,[id,req.user.empresa_id,req.user.unidade_id]);
        for(const x of comps.rows)await addPrep(x.componente_id,n(x.quantidade)*fator,prox);
      };
      for(const s of diretas){const id=Number(s.preparacao_id),q=n(s.quantidade);if(id&&q>0)await addPrep(id,q)}
      res.json({pratos,preparacoes:[...preparacoes.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")),insumos:[...insumos.values()].sort((a,b)=>a.ingrediente.localeCompare(b.ingrediente,"pt-BR"))});
    }catch(e){next(e)}
  });

  app.post("/api/producao/salvar-planejamento",async(req,res,next)=>{
    const db=await pool.connect();
    try{
      const itens=Array.isArray(req.body?.itens)?req.body.itens:[];
      if(!itens.length)return res.status(400).json({error:"Não há itens para salvar."});
      await db.query("BEGIN");
      const ids=[];
      for(const x of itens){
        if(x.tipo==="ficha")throw Object.assign(new Error("O planejamento por ficha legada foi aposentado. Use as Fichas Técnicas atuais."),{statusCode:410,code:"PRODUCAO_FICHA_LEGADA_APOSENTADA"});
        if(x.tipo!=="preparacao")continue;
        const id=Number(x.preparacao_id),q=n(x.quantidade);
        if(!id||q<=0)continue;
        const p=await db.query(`SELECT id,nome,rendimento,unidade_rendimento FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE`,[id,req.user.empresa_id,req.user.unidade_id]);
        if(!p.rows[0])throw new Error("Preparação não encontrada.");
        const r=n(p.rows[0].rendimento);if(r<=0)throw new Error(`A preparação "${p.rows[0].nome}" não possui rendimento válido.`);
        const fator=q/r;
        const ing=await db.query(`WITH RECURSIVE arvore(preparacao_id,fator,caminho) AS (
          SELECT $1::bigint,$4::numeric,ARRAY[$1::bigint]
          UNION ALL
          SELECT pc.componente_id,a.fator*pc.quantidade/NULLIF(pp.rendimento,0),a.caminho||pc.componente_id
          FROM arvore a JOIN preparacao_componentes pc ON pc.preparacao_id=a.preparacao_id
          JOIN preparacoes pp ON pp.id=pc.componente_id AND pp.empresa_id=$2 AND pp.unidade_id=$3 AND pp.ativo=TRUE
          WHERE NOT pc.componente_id=ANY(a.caminho))
          SELECT pi.insumo_id,SUM(pi.quantidade*a.fator)::numeric quantidade,i.preco_real
          FROM arvore a JOIN preparacao_ingredientes pi ON pi.preparacao_id=a.preparacao_id
          JOIN insumos i ON i.id=pi.insumo_id AND i.empresa_id=$2 AND i.unidade_id=$3
          GROUP BY pi.insumo_id,i.preco_real`,[id,req.user.empresa_id,req.user.unidade_id,fator]);
        let custo=0;for(const z of ing.rows)custo+=n(z.quantidade)*n(z.preco_real);
        const op=await db.query(`INSERT INTO ordens_producao(preparacao_id,item_nome,quantidade_planejada,unidade,custo_teorico,observacoes,usuario_id,empresa_id,unidade_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[id,p.rows[0].nome,q,p.rows[0].unidade_rendimento,custo,"Planejamento por fichas/preparações",req.user.id,req.user.empresa_id,req.user.unidade_id]);
        for(const z of ing.rows)await db.query(`INSERT INTO producao_consumos(ordem_id,insumo_id,quantidade_teorica,custo_unitario) VALUES($1,$2,$3,$4)`,[op.rows[0].id,z.insumo_id,z.quantidade,n(z.preco_real)]);
        ids.push(Number(op.rows[0].id));
      }
      if(!ids.length){await db.query("ROLLBACK");return res.status(400).json({error:"Nenhuma preparação válida para salvar."})}
      await db.query("COMMIT");res.status(201).json({ok:true,ordens:ids});
    }catch(e){await db.query("ROLLBACK").catch(()=>{});next(e)}finally{db.release()}
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
  app.post("/api/producao/ordens/:id/anular",async(req,res,next)=>{
    const db=await pool.connect();
    try{
      await db.query("BEGIN");
      const q=await db.query(`SELECT * FROM ordens_producao WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 FOR UPDATE`,
        [req.params.id,req.user.empresa_id,req.user.unidade_id]);
      const ordem=q.rows[0];
      if(!ordem){await db.query("ROLLBACK");return res.status(404).json({error:"Ordem de produção não encontrada."})}
      if(ordem.status==="anulada"){await db.query("ROLLBACK");return res.status(409).json({error:"Esta produção já foi excluída."})}
      if(ordem.status==="concluida" && ordem.estoque_baixado){
        const entrada=await db.query(`SELECT * FROM estoque_produzidos WHERE ordem_producao_id=$1 AND tipo='producao' FOR UPDATE`,[ordem.id]);
        if(entrada.rows[0]){
          const e=entrada.rows[0];
          const s=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo FROM estoque_produzidos
            WHERE empresa_id=$1 AND unidade_id=$2 AND ficha_id IS NOT DISTINCT FROM $3 AND preparacao_id IS NOT DISTINCT FROM $4`,
            [req.user.empresa_id,req.user.unidade_id,e.ficha_id,e.preparacao_id]);
          const atual=qEstoque(s.rows[0]?.saldo),qtd=qEstoque(e.quantidade);
          if(atual<qtd){await db.query("ROLLBACK");return res.status(409).json({error:"Não é possível excluir: parte do item produzido já foi consumida do estoque."})}
          await db.query(`INSERT INTO estoque_produzidos(ficha_id,preparacao_id,nome,unidade,tipo,quantidade,saldo_anterior,saldo_novo,custo_unitario,usuario_id,empresa_id,unidade_id)
            VALUES($1,$2,$3,$4,'estorno',$5,$6,$7,0,$8,$9,$10)`,
            [e.ficha_id,e.preparacao_id,e.nome,e.unidade,-qtd,atual,qEstoque(atual-qtd),req.user.id,req.user.empresa_id,req.user.unidade_id]);
        }
        const consumos=await db.query(`SELECT pc.*,i.ingrediente FROM producao_consumos pc JOIN insumos i ON i.id=pc.insumo_id WHERE pc.ordem_id=$1`,[ordem.id]);
        for(const x of consumos.rows){
          const qtd=qEstoque(n(x.quantidade_real)||n(x.quantidade_teorica)); if(qtd<=0)continue;
          const anterior=await saldoInsumo(db,x.insumo_id,req.user.empresa_id,req.user.unidade_id);
          await db.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id,ordem_producao_id)
            VALUES($1,'entrada',$2,$3,$4,$5,$6,$7,$8,$9,NULL)`,
            [x.insumo_id,qtd,anterior,anterior+qtd,`Estorno OP #${ordem.id}`,"Estorno automático por exclusão da produção",req.user.id,req.user.empresa_id,req.user.unidade_id]);
        }
      }
      if(ordem.status==="finalizada"){
        const consumos=await db.query(`SELECT pc.*,i.ingrediente FROM producao_consumos pc JOIN insumos i ON i.id=pc.insumo_id WHERE pc.ordem_id=$1`,[ordem.id]);
        const produzido=n(ordem.rendimento_real)||n(ordem.quantidade_planejada);
        const ep=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo FROM estoque_preparacoes WHERE preparacao_id=$1 AND empresa_id=$2 AND unidade_id=$3`,
          [ordem.preparacao_id,req.user.empresa_id,req.user.unidade_id]);
        if(n(ep.rows[0]?.saldo)<produzido){await db.query("ROLLBACK");return res.status(409).json({error:"Não é possível excluir: a preparação produzida já foi consumida."})}
        for(const x of consumos.rows){
          const qtd=qEstoque(n(x.quantidade_real)||n(x.quantidade_teorica)); if(qtd<=0)continue;
          const anterior=await saldoInsumo(db,x.insumo_id,req.user.empresa_id,req.user.unidade_id);
          await db.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id)
            VALUES($1,'entrada',$2,$3,$4,$5,$6,$7,$8,$9)`,
            [x.insumo_id,qtd,anterior,anterior+qtd,`Estorno OP #${ordem.id}`,"Estorno automático por exclusão da produção",req.user.id,req.user.empresa_id,req.user.unidade_id]);
        }
        await db.query(`INSERT INTO estoque_preparacoes(preparacao_id,quantidade,tipo,referencia,custo_unitario,usuario_id,empresa_id,unidade_id)
          VALUES($1,$2,'estorno',$3,0,$4,$5,$6)`,
          [ordem.preparacao_id,-produzido,`Estorno OP #${ordem.id}`,req.user.id,req.user.empresa_id,req.user.unidade_id]);
      }
      await db.query(`UPDATE ordens_producao SET status='anulada',observacoes=CONCAT(observacoes,CASE WHEN observacoes='' THEN '' ELSE E'\\n' END,'Excluída pelo usuário') WHERE id=$1`,[ordem.id]);
      await db.query("COMMIT");
      res.json({ok:true,id:Number(ordem.id)});
    }catch(e){await db.query("ROLLBACK").catch(()=>{});next(e)}finally{db.release()}
  });

  app.post("/api/producao/ordens/:id/iniciar",async(req,res,next)=>{try{
    const {rows}=await pool.query(`UPDATE ordens_producao SET status='em_producao' WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND status='planejada' RETURNING *`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!rows[0])return res.status(409).json({error:"A ordem não está disponível para iniciar."});
    res.json(rows[0]);
  }catch(e){next(e)}});

  app.post("/api/producao/ordens/:id/concluir",async(req,res,next)=>{
    const db=await pool.connect();
    try{
      const real=n(req.body?.rendimento_real);
      if(real<=0)return res.status(400).json({error:"Informe a quantidade realmente produzida."});
      await db.query("BEGIN");
      const q=await db.query(`SELECT * FROM ordens_producao WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 FOR UPDATE`,
        [req.params.id,req.user.empresa_id,req.user.unidade_id]);
      const ordem=q.rows[0];
      if(!ordem){await db.query("ROLLBACK");return res.status(404).json({error:"Ordem de produção não encontrada."})}
      if(ordem.estoque_baixado){await db.query("ROLLBACK");return res.status(409).json({error:"O estoque desta produção já foi baixado. A operação não foi repetida."})}
      if(ordem.status!=="em_producao"){await db.query("ROLLBACK");return res.status(409).json({error:"A ordem precisa estar Em produção antes de ser concluída."})}
      const consumos=await db.query(`SELECT pc.*,i.ingrediente,i.unidade FROM producao_consumos pc JOIN insumos i ON i.id=pc.insumo_id WHERE pc.ordem_id=$1 ORDER BY pc.id`,[ordem.id]);
      const componentes=await db.query(`SELECT pc.*,p.nome,p.rendimento FROM producao_componentes pc JOIN preparacoes p ON p.id=pc.preparacao_id WHERE pc.ordem_id=$1 ORDER BY pc.id`,[ordem.id]);
      let custoReal=0; const alertas=[]; const extras=new Map();
      for(const comp of componentes.rows){
        const uso=await consumirPreparacaoProduzida(db,{preparacaoId:comp.preparacao_id,quantidade:comp.quantidade_teorica,ordemId:ordem.id,usuarioId:req.user.id,empresaId:req.user.empresa_id,unidadeId:req.user.unidade_id});
        await db.query("UPDATE producao_componentes SET quantidade_real=$1 WHERE id=$2",[uso.consumido,comp.id]);
        if(uso.falta>0){
          const fator=uso.falta/(n(comp.rendimento)||1);
          const base=await db.query(`WITH RECURSIVE arvore(preparacao_id,fator,caminho) AS (
            SELECT $1::bigint,$4::numeric,ARRAY[$1::bigint]
            UNION ALL SELECT pc.componente_id,a.fator*pc.quantidade/NULLIF(p.rendimento,0),a.caminho||pc.componente_id
            FROM arvore a JOIN preparacao_componentes pc ON pc.preparacao_id=a.preparacao_id
            JOIN preparacoes p ON p.id=pc.componente_id AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE
            WHERE NOT pc.componente_id=ANY(a.caminho))
            SELECT pi.insumo_id,SUM(pi.quantidade*a.fator)::numeric quantidade,i.ingrediente,i.unidade,i.preco_real
            FROM arvore a JOIN preparacao_ingredientes pi ON pi.preparacao_id=a.preparacao_id
            JOIN insumos i ON i.id=pi.insumo_id AND i.empresa_id=$2 AND i.unidade_id=$3
            GROUP BY pi.insumo_id,i.ingrediente,i.unidade,i.preco_real`,[comp.preparacao_id,req.user.empresa_id,req.user.unidade_id,fator]);
          for(const z of base.rows){const k=Number(z.insumo_id),a=extras.get(k)||{...z,quantidade:0};a.quantidade+=n(z.quantidade);extras.set(k,a)}
        }
      }
      for(const z of extras.values()){
        const qtd=qEstoque(z.quantidade);if(qtd<=0)continue;
        const anterior=await saldoInsumo(db,z.insumo_id,req.user.empresa_id,req.user.unidade_id),novo=qEstoque(anterior-qtd);
        if(novo<0)alertas.push({insumo_id:Number(z.insumo_id),ingrediente:z.ingrediente,necessario:qtd,disponivel:anterior,saldo_novo:novo,unidade:z.unidade});
        await db.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id,ordem_producao_id)
          VALUES($1,'saida',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[z.insumo_id,-qtd,anterior,novo,`Produção OP #${ordem.id}`,"Complemento automático: preparação sem saldo suficiente",req.user.id,req.user.empresa_id,req.user.unidade_id,ordem.id]);
        custoReal+=qtd*n(z.preco_real);
      }
      for(const x of consumos.rows){
        const qtd=qEstoque(n(x.quantidade_real)||n(x.quantidade_teorica)); if(qtd<=0)continue;
        const anterior=await saldoInsumo(db,x.insumo_id,req.user.empresa_id,req.user.unidade_id);
        const novo=anterior-qtd;
        if(novo<0)alertas.push({insumo_id:Number(x.insumo_id),ingrediente:x.ingrediente,necessario:qtd,disponivel:anterior,saldo_novo:novo,unidade:x.unidade});
        await db.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id,ordem_producao_id)
          VALUES($1,'saida',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [x.insumo_id,-qtd,anterior,novo,`Produção OP #${ordem.id}`,"Baixa automática pela conclusão da produção",req.user.id,req.user.empresa_id,req.user.unidade_id,ordem.id]);
        await db.query("UPDATE producao_consumos SET quantidade_real=$1 WHERE id=$2",[qtd,x.id]);
        custoReal+=qtd*n(x.custo_unitario);
      }
      const {rows}=await db.query(`UPDATE ordens_producao SET status='concluida',rendimento_real=$1,custo_real=$2,finalizada_at=NOW(),estoque_baixado=TRUE WHERE id=$3 RETURNING *`,
        [real,custoReal,ordem.id]);
      const item=await db.query(`SELECT o.ficha_id,o.preparacao_id,o.unidade,COALESCE(o.item_nome,p.nome,'Produção #'||o.id) nome
        FROM ordens_producao o LEFT JOIN preparacoes p ON p.id=o.preparacao_id WHERE o.id=$1`,[ordem.id]);
      const prod=item.rows[0], produzido=qEstoque(real), custoUnit=produzido>0?custoReal/produzido:0;
      if(prod && produzido>0){
        const s=await db.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo FROM estoque_produzidos
          WHERE empresa_id=$1 AND unidade_id=$2 AND ficha_id IS NOT DISTINCT FROM $3 AND preparacao_id IS NOT DISTINCT FROM $4`,
          [req.user.empresa_id,req.user.unidade_id,prod.ficha_id,prod.preparacao_id]);
        const anterior=qEstoque(s.rows[0]?.saldo),novo=qEstoque(anterior+produzido);
        await db.query(`INSERT INTO estoque_produzidos(ordem_producao_id,ficha_id,preparacao_id,nome,unidade,tipo,quantidade,saldo_anterior,saldo_novo,custo_unitario,usuario_id,empresa_id,unidade_id)
          VALUES($1,$2,$3,$4,$5,'producao',$6,$7,$8,$9,$10,$11,$12)`,
          [ordem.id,prod.ficha_id,prod.preparacao_id,prod.nome,prod.unidade,produzido,anterior,novo,custoUnit,req.user.id,req.user.empresa_id,req.user.unidade_id]);
      }
      await db.query("COMMIT");
      res.json({...rows[0],estoque_baixado:true,entrada_produzido:true,alertas_estoque:alertas});
    }catch(e){await db.query("ROLLBACK").catch(()=>{});next(e)}finally{db.release()}
  });

  app.get("/api/producao/estoque-produzidos",async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT x.ficha_id,x.preparacao_id,MAX(x.nome) nome,MAX(x.unidade) unidade,
      SUM(x.quantidade)::numeric saldo_atual,
      (ARRAY_AGG(x.custo_unitario ORDER BY x.created_at DESC) FILTER(WHERE x.tipo='producao'))[1]::numeric custo_unitario
      FROM estoque_produzidos x WHERE x.empresa_id=$1 AND x.unidade_id=$2
      GROUP BY x.ficha_id,x.preparacao_id HAVING SUM(x.quantidade)<>0 ORDER BY MAX(x.nome)`,
      [req.user.empresa_id,req.user.unidade_id]);res.json(rows);
  }catch(e){next(e)}});

  app.get("/api/producao/estoque-produzidos/movimentacoes",async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT e.*,u.nome usuario_nome FROM estoque_produzidos e LEFT JOIN usuarios u ON u.id=e.usuario_id
      WHERE e.empresa_id=$1 AND e.unidade_id=$2 ORDER BY e.created_at DESC LIMIT 500`,
      [req.user.empresa_id,req.user.unidade_id]);res.json(rows);
  }catch(e){next(e)}});

  app.post("/api/producao/ordens/:id/status",async(req,res,next)=>{try{
    const novo=String(req.body?.status||"");
    if(!["planejada","em_producao","concluida"].includes(novo))return res.status(400).json({error:"Status inválido."});
    const {rows}=await pool.query(`UPDATE ordens_producao SET status=$1 WHERE id=$2 AND empresa_id=$3 AND unidade_id=$4 AND status NOT IN ('anulada','cancelada') RETURNING *`,
      [novo,req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!rows[0])return res.status(404).json({error:"Tarefa não encontrada."});
    res.json(rows[0]);
  }catch(e){next(e)}});

}
