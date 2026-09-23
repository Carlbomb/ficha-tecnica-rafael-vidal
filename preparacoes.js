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
    CREATE INDEX IF NOT EXISTS idx_preparacoes_tenant ON preparacoes(empresa_id,unidade_id);
    CREATE INDEX IF NOT EXISTS idx_prep_ing_prep ON preparacao_ingredientes(preparacao_id);
  `);
}

const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const n=v=>Number.isFinite(Number(v))?Number(v):0;

export function installPreparacoes(app,pool) {
  const selectBase=`
    SELECT p.*,
      COALESCE(SUM(pi.quantidade*i.preco_real),0)::numeric AS custo_total,
      CASE WHEN p.rendimento>0 THEN (COALESCE(SUM(pi.quantidade*i.preco_real),0)/p.rendimento)::numeric ELSE 0 END AS custo_unitario
    FROM preparacoes p
    LEFT JOIN preparacao_ingredientes pi ON pi.preparacao_id=p.id
    LEFT JOIN insumos i ON i.id=pi.insumo_id AND i.empresa_id=p.empresa_id AND i.unidade_id=p.unidade_id`;

  app.get("/api/preparacoes",asyncRoute(async(req,res)=>{
    const {rows}=await pool.query(selectBase+` WHERE p.empresa_id=$1 AND p.unidade_id=$2 AND p.ativo=TRUE GROUP BY p.id ORDER BY p.nome`,[req.user.empresa_id,req.user.unidade_id]);res.json(rows);
  }));

  app.get("/api/preparacoes/:id",asyncRoute(async(req,res)=>{
    const {rows}=await pool.query(selectBase+` WHERE p.id=$1 AND p.empresa_id=$2 AND p.unidade_id=$3 GROUP BY p.id`,[req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!rows[0])return res.status(404).json({error:"Preparação não encontrada."});
    const ing=await pool.query(`SELECT pi.insumo_id,pi.quantidade,pi.ordem,pi.observacoes,i.ingrediente,i.unidade,i.preco_real FROM preparacao_ingredientes pi JOIN insumos i ON i.id=pi.insumo_id WHERE pi.preparacao_id=$1 AND i.empresa_id=$2 AND i.unidade_id=$3 ORDER BY pi.ordem,pi.id`,[req.params.id,req.user.empresa_id,req.user.unidade_id]);
    res.json({...rows[0],ingredientes:ing.rows});
  }));

  async function gravar(req,res,editando){
    const b=req.body||{}, nome=String(b.nome||"").trim(), itens=Array.isArray(b.ingredientes)?b.ingredientes:[];
    if(!nome)return res.status(400).json({error:"Informe o nome da preparação."});
    if(n(b.rendimento)<=0)return res.status(400).json({error:"O rendimento deve ser maior que zero."});
    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      let id;
      if(editando){
        const r=await c.query(`UPDATE preparacoes SET nome=$1,categoria=$2,rendimento=$3,unidade_rendimento=$4,modo_preparo=$5,observacoes=$6,updated_at=NOW() WHERE id=$7 AND empresa_id=$8 AND unidade_id=$9 RETURNING id`,[nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",b.modo_preparo||"",b.observacoes||"",req.params.id,req.user.empresa_id,req.user.unidade_id]);
        if(!r.rows[0]){await c.query("ROLLBACK");return res.status(404).json({error:"Preparação não encontrada."})} id=r.rows[0].id;
        await c.query("DELETE FROM preparacao_ingredientes WHERE preparacao_id=$1",[id]);
      } else {
        const r=await c.query(`INSERT INTO preparacoes(nome,categoria,rendimento,unidade_rendimento,modo_preparo,observacoes,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[nome,b.categoria||"Outros",n(b.rendimento),b.unidade_rendimento||"KG",b.modo_preparo||"",b.observacoes||"",req.user.empresa_id,req.user.unidade_id]); id=r.rows[0].id;
      }
      for(let k=0;k<itens.length;k++){
        const x=itens[k],q=n(x.quantidade);
        if(!x.insumo_id||q<=0)continue;
        const ok=await c.query("SELECT id FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3",[x.insumo_id,req.user.empresa_id,req.user.unidade_id]);
        if(!ok.rows[0])throw new Error(`Insumo ${x.insumo_id} não encontrado.`);
        await c.query("INSERT INTO preparacao_ingredientes(preparacao_id,insumo_id,quantidade,ordem,observacoes) VALUES($1,$2,$3,$4,$5)",[id,x.insumo_id,q,k,x.observacoes||""]);
      }
      await c.query("COMMIT");res.status(editando?200:201).json({id,message:editando?"Preparação atualizada com sucesso.":"Preparação criada com sucesso."});
    }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
  }

  app.post("/api/preparacoes",asyncRoute((req,res)=>gravar(req,res,false)));
  app.put("/api/preparacoes/:id",asyncRoute((req,res)=>gravar(req,res,true)));
  app.delete("/api/preparacoes/:id",asyncRoute(async(req,res)=>{
    const r=await pool.query("DELETE FROM preparacoes WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 RETURNING id",[req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!r.rows[0])return res.status(404).json({error:"Preparação não encontrada."});res.status(204).end();
  }));
}