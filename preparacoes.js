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
      modo_preparo TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      empresa_id BIGINT NOT NULL REFERENCES empresas(id),
      unidade_id BIGINT NOT NULL REFERENCES unidades(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

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
  `);
}

export async function calcularCustoPreparacao(db, id, empresaId, unidadeId, visitados = new Set()) {
  const chave = Number(id);
  if (visitados.has(chave)) throw new Error("Foi detectado um ciclo entre preparações.");
  const prox = new Set(visitados); prox.add(chave);

  const p = await db.query(
    `SELECT id,nome,rendimento,unidade_rendimento
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
    custo_total:total,
    custo_unitario:rendimento>0?total/rendimento:0
  };
}

export async function listarPreparacoesComCusto(db, empresaId, unidadeId) {
  const {rows}=await db.query(
    `SELECT id,nome,categoria,rendimento,unidade_rendimento,modo_preparo,observacoes,ativo
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
    res.json({...rows[0],...custo,ingredientes:ing.rows,componentes:comp.rows});
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
          `UPDATE preparacoes SET nome=$1,categoria=$2,rendimento=$3,unidade_rendimento=$4,modo_preparo=$5,observacoes=$6,updated_at=NOW()
            WHERE id=$7 AND empresa_id=$8 AND unidade_id=$9 RETURNING id`,
          [nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",b.modo_preparo||"",b.observacoes||"",req.params.id,req.user.empresa_id,req.user.unidade_id]
        );
        if(!r.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Preparação não encontrada."})}
        id=r.rows[0].id;
        await c.query("DELETE FROM preparacao_ingredientes WHERE preparacao_id=$1",[id]);
        await c.query("DELETE FROM preparacao_componentes WHERE preparacao_id=$1",[id]);
      }else{
        const r=await c.query(
          `INSERT INTO preparacoes(nome,categoria,rendimento,unidade_rendimento,modo_preparo,observacoes,empresa_id,unidade_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",b.modo_preparo||"",b.observacoes||"",req.user.empresa_id,req.user.unidade_id]
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

  app.post("/api/preparacoes",asyncRoute((req,res)=>gravar(req,res,false)));
  app.put("/api/preparacoes/:id",asyncRoute((req,res)=>gravar(req,res,true)));

  app.delete("/api/preparacoes/:id",asyncRoute(async(req,res)=>{
    try{
      const r=await pool.query("DELETE FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 RETURNING id",[req.params.id,req.user.empresa_id,req.user.unidade_id]);
      if(!r.rows[0]) return res.status(404).json({error:"Preparação não encontrada."});
      res.status(204).end();
    }catch(e){
      if(e.code==="23503") return res.status(409).json({error:"Esta preparação está sendo utilizada em outra preparação ou ficha técnica."});
      throw e;
    }
  }));
}
