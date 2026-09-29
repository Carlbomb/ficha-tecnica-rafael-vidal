/* MISEVO — Preparações / Sub-receitas — Fase 2 */

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

export async function initPreparacoes(pool) {
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

    CREATE TABLE IF NOT EXISTS ficha_preparacoes (
      id BIGSERIAL PRIMARY KEY,
      ficha_id BIGINT NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
      preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id),
      quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      observacoes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_preparacoes_tenant ON preparacoes(empresa_id,unidade_id);
    CREATE INDEX IF NOT EXISTS idx_prep_ing_prep ON preparacao_ingredientes(preparacao_id);
    CREATE INDEX IF NOT EXISTS idx_prep_comp_prep ON preparacao_componentes(preparacao_id);
    CREATE INDEX IF NOT EXISTS idx_prep_comp_comp ON preparacao_componentes(componente_id);
    CREATE INDEX IF NOT EXISTS idx_ficha_prep_ficha ON ficha_preparacoes(ficha_id);
    CREATE INDEX IF NOT EXISTS idx_ficha_prep_prep ON ficha_preparacoes(preparacao_id);
    ALTER TABLE ficha_preparacoes ADD COLUMN IF NOT EXISTS unidade TEXT;
  `);
}

export async function calcularCustoPreparacao(db, id, empresaId, unidadeId, visitados = new Set()) {
  const chave = Number(id);
  if (visitados.has(chave)) throw new Error("Foi detectado um ciclo entre preparações.");
  const prox = new Set(visitados); prox.add(chave);

  const p = await db.query(
    `SELECT id,nome,rendimento,unidade_rendimento,quantidade_porcoes
       FROM preparacoes
      WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE`,
    [id,empresaId,unidadeId]
  );
  if (!p.rows[0]) throw new Error(`Preparação ${id} não encontrada.`);

  const ins = await db.query(
    `SELECT COALESCE(SUM(pi.quantidade*i.preco_real),0)::numeric AS total
       FROM preparacao_ingredientes pi
       JOIN insumos i ON i.id=pi.insumo_id
      WHERE pi.preparacao_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3`,
    [id,empresaId,unidadeId]
  );
  let total=n(ins.rows[0]?.total);

  const comps=await db.query(
    `SELECT pc.componente_id,pc.quantidade
       FROM preparacao_componentes pc
       JOIN preparacoes p ON p.id=pc.componente_id
      WHERE pc.preparacao_id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE`,
    [id,empresaId,unidadeId]
  );
  for (const c of comps.rows) {
    const cc=await calcularCustoPreparacao(db,c.componente_id,empresaId,unidadeId,prox);
    total += n(c.quantidade)*cc.custo_unitario;
  }

  const rendimento=n(p.rows[0].rendimento);
  return {
    id:chave,
    nome:p.rows[0].nome,
    rendimento,
    unidade_rendimento:p.rows[0].unidade_rendimento,
    quantidade_porcoes:n(p.rows[0].quantidade_porcoes),
    custo_total:total,
    custo_unitario:rendimento>0?total/rendimento:0
  };
}

export async function listarPreparacoesComCusto(db, empresaId, unidadeId) {
  const {rows}=await db.query(
    `SELECT id,nome,categoria,rendimento,unidade_rendimento,quantidade_porcoes,peso_porcao,preco_venda_porcao,meta_cmv,modo_preparo,observacoes,ativo
       FROM preparacoes
      WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE
      ORDER BY nome`,
    [empresaId,unidadeId]
  );
  const saida=[];
  for(const p of rows){
    const c=await calcularCustoPreparacao(db,p.id,empresaId,unidadeId);
    saida.push({...p,custo_total:c.custo_total,custo_unitario:c.custo_unitario});
  }
  return saida;
}

async function criaCiclo(db, origem, destino, empresaId, unidadeId) {
  if(Number(origem)===Number(destino)) return true;
  const {rows}=await db.query(`
    WITH RECURSIVE arvore(id) AS (
      SELECT componente_id FROM preparacao_componentes WHERE preparacao_id=$1
      UNION
      SELECT pc.componente_id FROM preparacao_componentes pc JOIN arvore a ON pc.preparacao_id=a.id
    )
    SELECT 1 FROM arvore a
    JOIN preparacoes p ON p.id=a.id
    WHERE a.id=$2 AND p.empresa_id=$3 AND p.unidade_id=$4 LIMIT 1`,
    [destino,origem,empresaId,unidadeId]
  );
  return Boolean(rows[0]);
}

export function installPreparacoes(app,pool) {
  app.post("/api/preparacoes/migrar-fichas-legadas",asyncRoute(async(req,res)=>{
    res.status(410).json({
      error:"A migração de Fichas Técnicas legadas foi aposentada. O MISEVO utiliza somente o modelo atual.",
      codigo:"MIGRACAO_FICHAS_LEGADAS_APOSENTADA"
    });
  }));

  app.get("/api/preparacoes",asyncRoute(async(req,res)=>{
    const lista = await listarPreparacoesComCusto(pool,req.user.empresa_id,req.user.unidade_id);
    console.log("[MISEVO][preparacoes]", JSON.stringify({
      empresa_id:req.user.empresa_id,
      unidade_id:req.user.unidade_id,
      quantidade:lista.length,
      ids:lista.map(p=>Number(p.id))
    }));
    res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json(lista);
  }));

  app.post("/api/preparacoes/homologacao/cebola-refogada",asyncRoute(async(req,res)=>{
    const tenant = await pool.query(
      `SELECT e.nome AS empresa_nome, u.nome AS unidade_nome
         FROM empresas e JOIN unidades u ON u.empresa_id=e.id
        WHERE e.id=$1 AND u.id=$2`,
      [req.user.empresa_id,req.user.unidade_id]
    );
    const ctx=tenant.rows[0];
    if(ctx?.empresa_nome!=="MISEVO — Ambiente de Teste" || ctx?.unidade_nome!=="Cozinha de Homologação")
      return res.status(403).json({error:"A preparação de homologação só pode ser criada no ambiente de teste."});

    const ins=await pool.query(
      `SELECT id FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND LOWER(ingrediente)=LOWER('Cebola') AND ativo=TRUE ORDER BY id LIMIT 1`,
      [req.user.empresa_id,req.user.unidade_id]
    );
    if(!ins.rows[0]) return res.status(409).json({error:"O insumo Cebola não existe neste ambiente de homologação."});

    const existing=await pool.query(
      `SELECT id FROM preparacoes WHERE empresa_id=$1 AND unidade_id=$2 AND LOWER(nome)=LOWER('Cebola refogada teste') LIMIT 1`,
      [req.user.empresa_id,req.user.unidade_id]
    );
    let id=existing.rows[0]?.id;
    if(!id){
      const r=await pool.query(
        `INSERT INTO preparacoes(nome,categoria,rendimento,unidade_rendimento,modo_preparo,observacoes,empresa_id,unidade_id)
         VALUES('Cebola refogada teste','Pré-preparos',1,'KG','Refogar a cebola conforme padrão de homologação.','Preparação criada exclusivamente para teste de integração.', $1,$2) RETURNING id`,
        [req.user.empresa_id,req.user.unidade_id]
      );
      id=r.rows[0].id;
      await pool.query(
        `INSERT INTO preparacao_ingredientes(preparacao_id,insumo_id,quantidade,ordem,observacoes) VALUES($1,$2,0.9,0,'')`,
        [id,ins.rows[0].id]
      );
    }
    res.status(existing.rows[0]?200:201).json({id,nome:"Cebola refogada teste"});
  }));

  app.get("/api/preparacoes/:id",asyncRoute(async(req,res)=>{
    const {rows}=await pool.query(
      `SELECT * FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]
    );
    if(!rows[0]) return res.status(404).json({error:"Preparação não encontrada."});

    const ing=await pool.query(
      `SELECT pi.insumo_id,pi.quantidade,pi.ordem,pi.observacoes,i.ingrediente,i.unidade,i.preco_real
         FROM preparacao_ingredientes pi JOIN insumos i ON i.id=pi.insumo_id
        WHERE pi.preparacao_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3 ORDER BY pi.ordem,pi.id`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]
    );
    const comp=await pool.query(
      `SELECT pc.componente_id,pc.quantidade,pc.ordem,pc.observacoes,p.nome,p.unidade_rendimento
         FROM preparacao_componentes pc JOIN preparacoes p ON p.id=pc.componente_id
        WHERE pc.preparacao_id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 ORDER BY pc.ordem,pc.id`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]
    );
    const custo=await calcularCustoPreparacao(pool,req.params.id,req.user.empresa_id,req.user.unidade_id);
    const fichasUso=await pool.query(
      `SELECT f.id,f.nome_prato AS nome,fp.quantidade,fp.ordem
         FROM ficha_preparacoes fp
         JOIN fichas f ON f.id=fp.ficha_id
        WHERE fp.preparacao_id=$1 AND f.empresa_id=$2 AND f.unidade_id=$3
        ORDER BY f.nome_prato`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]
    );
    const preparacoesUso=await pool.query(
      `SELECT p.id,p.nome,pc.quantidade,pc.ordem
         FROM preparacao_componentes pc
         JOIN preparacoes p ON p.id=pc.preparacao_id
        WHERE pc.componente_id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE
        ORDER BY p.nome`,
      [req.params.id,req.user.empresa_id,req.user.unidade_id]
    );
    res.json({...rows[0],...custo,ingredientes:ing.rows,componentes:comp.rows,usado_em_fichas:fichasUso.rows,usado_em_preparacoes:preparacoesUso.rows});
  }));

  async function gravar(req,res,editando){
    const b=req.body||{}, nome=String(b.nome||"").trim();
    const ingredientes=Array.isArray(b.ingredientes)?b.ingredientes:[];
    const componentes=Array.isArray(b.componentes)?b.componentes:[];
    if(!nome) return res.status(400).json({error:"Informe o nome da preparação."});
    if(n(b.rendimento)<=0) return res.status(400).json({error:"O rendimento deve ser maior que zero."});
    if(!ingredientes.length&&!componentes.length) return res.status(400).json({error:"Adicione pelo menos um insumo ou uma preparação."});

    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      let id;
      if(editando){
        const r=await c.query(
          `UPDATE preparacoes SET nome=$1,categoria=$2,rendimento=$3,unidade_rendimento=$4,quantidade_porcoes=$5,peso_porcao=$6,preco_venda_porcao=$7,meta_cmv=$8,modo_preparo=$9,observacoes=$10,updated_at=NOW()
            WHERE id=$11 AND empresa_id=$12 AND unidade_id=$13 RETURNING id`,
          [nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",n(b.quantidade_porcoes)||null,n(b.peso_porcao)||null,n(b.preco_venda_porcao)||null,n(b.meta_cmv)||30,b.modo_preparo||"",b.observacoes||"",req.params.id,req.user.empresa_id,req.user.unidade_id]
        );
        if(!r.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Preparação não encontrada."})}
        id=r.rows[0].id;
        await c.query("DELETE FROM preparacao_ingredientes WHERE preparacao_id=$1",[id]);
        await c.query("DELETE FROM preparacao_componentes WHERE preparacao_id=$1",[id]);
      }else{
        const r=await c.query(
          `INSERT INTO preparacoes(nome,categoria,rendimento,unidade_rendimento,quantidade_porcoes,peso_porcao,preco_venda_porcao,meta_cmv,modo_preparo,observacoes,empresa_id,unidade_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",n(b.quantidade_porcoes)||null,n(b.peso_porcao)||null,n(b.preco_venda_porcao)||null,n(b.meta_cmv)||30,b.modo_preparo||"",b.observacoes||"",req.user.empresa_id,req.user.unidade_id]
        );
        id=r.rows[0].id;
      }

      for(let k=0;k<ingredientes.length;k++){
        const x=ingredientes[k],q=n(x.quantidade); if(!x.insumo_id||q<=0) continue;
        const ok=await c.query("SELECT id FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3",[x.insumo_id,req.user.empresa_id,req.user.unidade_id]);
        if(!ok.rows[0]) throw new Error(`Insumo ${x.insumo_id} não encontrado.`);
        await c.query("INSERT INTO preparacao_ingredientes(preparacao_id,insumo_id,quantidade,ordem,observacoes) VALUES($1,$2,$3,$4,$5)",[id,x.insumo_id,q,k,x.observacoes||""]);
      }

      for(let k=0;k<componentes.length;k++){
        const x=componentes[k],q=n(x.quantidade); if(!x.preparacao_id||q<=0) continue;
        const ok=await c.query("SELECT id FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE",[x.preparacao_id,req.user.empresa_id,req.user.unidade_id]);
        if(!ok.rows[0]) throw new Error(`Preparação ${x.preparacao_id} não encontrada.`);
        if(await criaCiclo(c,id,x.preparacao_id,req.user.empresa_id,req.user.unidade_id)) throw new Error("Essa combinação criaria um ciclo entre preparações.");
        await c.query("INSERT INTO preparacao_componentes(preparacao_id,componente_id,quantidade,ordem,observacoes) VALUES($1,$2,$3,$4,$5)",[id,x.preparacao_id,q,k,x.observacoes||""]);
      }

      await c.query("COMMIT");
      res.status(editando?200:201).json({id,message:editando?"Preparação atualizada com sucesso.":"Preparação criada com sucesso."});
    }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
  }

  app.post("/api/preparacoes/:id/vincular-insumo",asyncRoute(async(req,res)=>{
    const empresaId=req.user.empresa_id,unidadeId=req.user.unidade_id,id=Number(req.params.id);
    const custo=await calcularCustoPreparacao(pool,id,empresaId,unidadeId);
    const p=await pool.query(
      `SELECT id,nome,rendimento,unidade_rendimento,quantidade_porcoes
         FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE`,
      [id,empresaId,unidadeId]
    );
    if(!p.rows[0]) return res.status(404).json({error:"Produção não encontrada."});
    const prod=p.rows[0];
    const porcoes=n(prod.quantidade_porcoes);
    const temPorcoes=porcoes>0;
    // O insumo produzido deve refletir exatamente a mesma base exibida em
    // "Custo por porção": custo total da receita dividido pela quantidade de porções.
    // Sem porcionamento, mantém o custo por unidade de rendimento (KG/L/UN).
    const unidade=temPorcoes?"PORÇÃO":String(prod.unidade_rendimento||"UN").toUpperCase();
    const preco=temPorcoes?(n(custo.custo_total)/porcoes):n(custo.custo_unitario);
    if(!(preco>0)) return res.status(400).json({error:"Não foi possível calcular um custo válido para o insumo produzido."});
    const existente=await pool.query(
      `SELECT id FROM insumos WHERE producao_id=$1 AND empresa_id=$2 AND unidade_id=$3 LIMIT 1`,
      [id,empresaId,unidadeId]
    );
    let row;
    if(existente.rows[0]){
      const r=await pool.query(
        `UPDATE insumos SET ingrediente=$1,unidade=$2,peso_bruto=1,peso_liquido=1,fc=1,
          preco_compra=$3,preco_real=$3,fornecedor='Produção interna',grupo='PRODUÇÕES',
          observacoes='Custo sincronizado automaticamente com a produção.',ativo=TRUE,updated_at=NOW()
          WHERE id=$4 AND empresa_id=$5 AND unidade_id=$6 RETURNING id,id AS codigo,ingrediente,unidade,preco_real,grupo,producao_id`,
        [prod.nome,unidade,preco,existente.rows[0].id,empresaId,unidadeId]
      ); row=r.rows[0];
    }else{
      const r=await pool.query(
        `INSERT INTO insumos(ingrediente,unidade,peso_bruto,peso_liquido,fc,preco_compra,preco_real,fornecedor,ativo,observacoes,empresa_id,unidade_id,grupo,producao_id)
         VALUES($1,$2,1,1,1,$3,$3,'Produção interna',TRUE,'Custo sincronizado automaticamente com a produção.',$4,$5,'PRODUÇÕES',$6)
         RETURNING id,id AS codigo,ingrediente,unidade,preco_real,grupo,producao_id`,
        [prod.nome,unidade,preco,empresaId,unidadeId,id]
      ); row=r.rows[0];
    }
    res.status(existente.rows[0]?200:201).json(row);
  }));

  app.post("/api/preparacoes",asyncRoute((req,res)=>gravar(req,res,false)));
  app.patch("/api/preparacoes/lote/grupo",asyncRoute(async(req,res)=>{
    const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number).filter(Number.isInteger))];
    const categoria=String(req.body?.categoria||"").trim();
    if(!ids.length)return res.status(400).json({error:"Selecione pelo menos uma ficha técnica."});
    if(!categoria)return res.status(400).json({error:"Escolha o grupo de destino."});
    const {rows}=await pool.query(`UPDATE preparacoes SET categoria=$1,updated_at=NOW()
      WHERE id=ANY($2::bigint[]) AND empresa_id=$3 AND unidade_id=$4 RETURNING id,nome,categoria`,
      [categoria,ids,req.user.empresa_id,req.user.unidade_id]);
    res.json({ok:true,alteradas:rows.length,fichas:rows});
  }));

  app.delete("/api/preparacoes/lote",asyncRoute(async(req,res)=>{
    const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number).filter(Number.isInteger))];
    if(!ids.length)return res.status(400).json({error:"Selecione pelo menos uma ficha técnica."});
    const db=await pool.connect();try{
      await db.query("BEGIN");const removidas=[],arquivadas=[],mantidas=[];
      for(const id of ids){
        const p=await db.query(`SELECT id,nome FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE FOR UPDATE`,[id,req.user.empresa_id,req.user.unidade_id]);
        if(!p.rows[0])continue;
        const vinc=await db.query(`SELECT
          EXISTS(SELECT 1 FROM preparacao_componentes WHERE componente_id=$1) usado_componente,
          EXISTS(SELECT 1 FROM ficha_preparacoes WHERE preparacao_id=$1) usado_ficha,
          EXISTS(SELECT 1 FROM ordens_producao WHERE preparacao_id=$1) tem_producao,
          EXISTS(SELECT 1 FROM estoque_produzidos WHERE preparacao_id=$1) tem_estoque`,[id]);
        const v=vinc.rows[0]||{};
        if(v.usado_componente||v.usado_ficha){
          const motivos=[];if(v.usado_componente||v.usado_ficha)motivos.push("usada por outra ficha ativa");
          mantidas.push({id,nome:p.rows[0].nome,motivo:motivos.join(", ")});continue;
        }
        if(v.tem_producao||v.tem_estoque){
          await db.query("UPDATE preparacoes SET ativo=FALSE,updated_at=NOW() WHERE id=$1",[id]);
          arquivadas.push(id);continue;
        }
        await db.query("DELETE FROM preparacoes WHERE id=$1",[id]);removidas.push(id);
      }
      await db.query("COMMIT");
      res.json({ok:true,excluidas:removidas.length+arquivadas.length,ids:[...removidas,...arquivadas],removidas,arquivadas,mantidas});
    }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e}finally{db.release()}
  }));

  app.put("/api/preparacoes/:id",asyncRoute((req,res)=>gravar(req,res,true)));

  app.delete("/api/preparacoes/:id",asyncRoute(async(req,res)=>{
    const id=Number(req.params.id),empresaId=req.user.empresa_id,unidadeId=req.user.unidade_id;
    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      const p=await c.query("SELECT id,nome FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE FOR UPDATE",[id,empresaId,unidadeId]);
      if(!p.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Preparação não encontrada."});}

      const usosPrep=await c.query(`SELECT p.nome FROM preparacao_componentes pc JOIN preparacoes p ON p.id=pc.preparacao_id WHERE pc.componente_id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 AND p.ativo=TRUE ORDER BY p.nome`,[id,empresaId,unidadeId]);
      const usosFicha=await c.query(`SELECT f.nome_prato AS nome FROM ficha_preparacoes fp JOIN fichas f ON f.id=fp.ficha_id WHERE fp.preparacao_id=$1 AND f.empresa_id=$2 AND f.unidade_id=$3 ORDER BY f.nome_prato`,[id,empresaId,unidadeId]);
      const ins=await c.query("SELECT id,ingrediente FROM insumos WHERE producao_id=$1 AND empresa_id=$2 AND unidade_id=$3 LIMIT 1",[id,empresaId,unidadeId]);
      let usosInsumo=[];
      if(ins.rows[0]){
        const u=await c.query(`SELECT DISTINCT f.nome_prato AS nome FROM ingredientes i JOIN fichas f ON f.id=i.ficha_id WHERE i.insumo_id=$1 AND f.empresa_id=$2 AND f.unidade_id=$3 ORDER BY f.nome_prato`,[ins.rows[0].id,empresaId,unidadeId]);
        usosInsumo=u.rows;
      }
      const dependencias=[...usosPrep.rows.map(x=>`Preparação: ${x.nome}`),...usosFicha.rows.map(x=>`Ficha técnica: ${x.nome}`),...usosInsumo.map(x=>`Ficha técnica (insumo produzido): ${x.nome}`)];
      if(dependencias.length){await c.query("ROLLBACK");return res.status(409).json({error:"Não é possível excluir: esta produção está em uso.",dependencias});}

      if(ins.rows[0]) await c.query("DELETE FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3",[ins.rows[0].id,empresaId,unidadeId]);
      await c.query("DELETE FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3",[id,empresaId,unidadeId]);
      await c.query("COMMIT");
      res.json({message:"Produção e insumo produzido excluídos com segurança.",insumo_excluido:Boolean(ins.rows[0])});
    }catch(e){await c.query("ROLLBACK");if(e.code==="23503")return res.status(409).json({error:"Não é possível excluir porque existem vínculos ativos com esta produção."});throw e}finally{c.release()}
  }));
}
