const ar=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const t=req=>[req.user.empresa_id,req.user.unidade_id];

export async function initOperacaoCompleta(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS estoque_preparacoes(
  id BIGSERIAL PRIMARY KEY, preparacao_id BIGINT NOT NULL REFERENCES preparacoes(id) ON DELETE CASCADE,
  quantidade NUMERIC(14,4) NOT NULL, tipo TEXT NOT NULL, referencia TEXT DEFAULT '', custo_unitario NUMERIC(14,4) DEFAULT 0,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL, empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_estprep_tenant ON estoque_preparacoes(empresa_id,unidade_id,preparacao_id);
 ALTER TABLE perdas ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
 ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
 CREATE TABLE IF NOT EXISTS misevo_migrations(chave TEXT PRIMARY KEY,executed_at TIMESTAMPTZ DEFAULT NOW());
 `);
 const done=(await pool.query("SELECT 1 FROM misevo_migrations WHERE chave='homologacao_v1'")).rows[0];
 if(!done){
  const db=await pool.connect();try{await db.query("BEGIN");
   const e=(await db.query(`INSERT INTO empresas(nome,nome_fantasia,ativo) VALUES($1,$2,TRUE) RETURNING id`,["MISEVO — Ambiente de Teste","MISEVO Teste"])).rows[0];
   const u=(await db.query(`INSERT INTO unidades(empresa_id,nome,codigo,ativo) VALUES($1,$2,$3,TRUE) RETURNING id`,[e.id,"Cozinha de Homologação","TESTE"])).rows[0];
   const itens=[["Cebola","KG",1,.9,6],["Cenoura","KG",1,.85,7],["Manteiga","KG",1,1,45],["Caldo Base","L",1,1,12],["Sal","KG",1,1,4]];
   for(const [nome,un,pb,pl,preco] of itens){const fc=pb/pl;await db.query(`INSERT INTO insumos(ingrediente,unidade,peso_bruto,peso_liquido,fc,preco_compra,preco_real,fornecedor,ativo,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7,'',TRUE,$8,$9)`,[nome,un,pb,pl,fc,preco,preco*fc,e.id,u.id])}
   await db.query(`INSERT INTO fornecedores(nome,contato,email,telefone,observacoes,ativo,empresa_id,unidade_id) VALUES($1,'','','','Fornecedor exclusivo para homologação',TRUE,$2,$3)`,["Fornecedor Homologação MISEVO",e.id,u.id]);
   await db.query("INSERT INTO misevo_migrations(chave) VALUES('homologacao_v1')");
   await db.query("COMMIT");console.log("MISEVO homologação: ambiente isolado criado.",e.id,u.id);
  }catch(err){await db.query("ROLLBACK");throw err}finally{db.release()}
 }
}

// One-time homologation cleanup requested by the platform owner.
const resetDone=(await pool.query("SELECT 1 FROM misevo_migrations WHERE chave='homologacao_reset_20260925_01'")).rows[0];
if(!resetDone){
 const db=await pool.connect();try{await db.query("BEGIN");
  const e=(await db.query("SELECT id FROM empresas WHERE nome=$1",["MISEVO — Ambiente de Teste"])).rows[0];
  if(e){const u=(await db.query("SELECT id FROM unidades WHERE empresa_id=$1 AND nome=$2",[e.id,"Cozinha de Homologação"])).rows[0];
   if(u){
    await db.query("DELETE FROM estoque_preparacoes WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM producao_consumos WHERE ordem_id IN (SELECT id FROM ordens_producao WHERE empresa_id=$1 AND unidade_id=$2)",[e.id,u.id]);
    await db.query("DELETE FROM ordens_producao WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM perdas WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM inventarios WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM estoque_movimentacoes WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM historico_precos WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
    await db.query("DELETE FROM compra_itens WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id=$1 AND unidade_id=$2)",[e.id,u.id]);
    await db.query("DELETE FROM compras WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
   }
  }
  await db.query("INSERT INTO misevo_migrations(chave) VALUES('homologacao_reset_20260925_01')");
  await db.query("COMMIT");console.log("MISEVO homologação: reset transacional concluído.");
 }catch(err){await db.query("ROLLBACK");throw err}finally{db.release()}
}

export function installOperacaoCompleta(app,pool){
 app.post("/api/plataforma/homologacao/reset",async(req,res,next)=>{const db=await pool.connect();try{
  if(req.user?.plataforma_admin!==true||String(req.user?.email||"").trim().toLowerCase()!=="charlcooking@gmail.com")return res.status(403).json({error:"Acesso restrito."});
  const e=(await db.query("SELECT id FROM empresas WHERE nome=$1",["MISEVO — Ambiente de Teste"])).rows[0];
  if(!e)return res.status(404).json({error:"Ambiente de homologação não encontrado."});
  const u=(await db.query("SELECT id FROM unidades WHERE empresa_id=$1 AND nome=$2",[e.id,"Cozinha de Homologação"])).rows[0];
  if(!u)return res.status(404).json({error:"Unidade de homologação não encontrada."});
  await db.query("BEGIN");
  await db.query("DELETE FROM estoque_preparacoes WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM producao_consumos WHERE ordem_id IN (SELECT id FROM ordens_producao WHERE empresa_id=$1 AND unidade_id=$2)",[e.id,u.id]);
  await db.query("DELETE FROM ordens_producao WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM perdas WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM inventarios WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM estoque_movimentacoes WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM historico_precos WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("DELETE FROM compra_itens WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id=$1 AND unidade_id=$2)",[e.id,u.id]);
  await db.query("DELETE FROM compras WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
  await db.query("COMMIT");
  res.json({ok:true,empresa_id:e.id,unidade_id:u.id});
 }catch(err){await db.query("ROLLBACK").catch(()=>{});next(err)}finally{db.release()}});
 app.get("/api/plataforma/homologacao/auditoria",async(req,res,next)=>{try{
  if(req.user?.plataforma_admin!==true)return res.status(403).json({error:"Acesso restrito."});
  const e=(await pool.query("SELECT id,nome FROM empresas WHERE nome=$1",["MISEVO — Ambiente de Teste"])).rows[0];
  if(!e)return res.status(404).json({error:"Ambiente de homologação não encontrado."});
  const u=(await pool.query("SELECT id,nome FROM unidades WHERE empresa_id=$1 AND nome=$2",[e.id,"Cozinha de Homologação"])).rows[0];
  const ins=(await pool.query("SELECT id,ingrediente,unidade,fc,preco_compra,preco_real FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 ORDER BY ingrediente",[e.id,u.id])).rows;
  const forn=(await pool.query("SELECT id,nome FROM fornecedores WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id])).rows;
  const counts={};for(const [k,t] of Object.entries({compras:"compras",movimentos:"estoque_movimentacoes",perdas:"perdas",inventarios:"inventarios",ordens:"ordens_producao",estoque_preparacoes:"estoque_preparacoes"})){counts[k]=Number((await pool.query(`SELECT COUNT(*)::int n FROM ${t} WHERE empresa_id=$1 AND unidade_id=$2`,[e.id,u.id])).rows[0].n)}
  res.json({empresa:e,unidade:u,insumos:ins,fornecedores:forn,counts})
 }catch(e){next(e)}});

 app.get("/api/estoque/preparacoes",ar(async(req,res)=>{
  const {rows}=await pool.query(`SELECT p.id,p.nome,p.unidade_rendimento,COALESCE(SUM(e.quantidade),0)::numeric saldo,
   COALESCE((SELECT e2.custo_unitario FROM estoque_preparacoes e2 WHERE e2.preparacao_id=p.id AND e2.empresa_id=$1 AND e2.unidade_id=$2 ORDER BY e2.created_at DESC,e2.id DESC LIMIT 1),0)::numeric custo_unitario
   FROM preparacoes p LEFT JOIN estoque_preparacoes e ON e.preparacao_id=p.id AND e.empresa_id=$1 AND e.unidade_id=$2
   WHERE p.empresa_id=$1 AND p.unidade_id=$2 AND p.ativo=TRUE GROUP BY p.id ORDER BY p.nome`,t(req));res.json(rows)
 }));
 app.post("/api/producao/ordens/:id/cancelar",ar(async(req,res)=>{
  const {rows}=await pool.query(`UPDATE ordens_producao SET status='cancelada',observacoes=CONCAT(observacoes,CASE WHEN observacoes='' THEN '' ELSE E'\\n' END,$1)
   WHERE id=$2 AND empresa_id=$3 AND unidade_id=$4 AND status='planejada' RETURNING *`,
   [String(req.body?.motivo||"Cancelada pelo usuário"),req.params.id,...t(req)]);
  if(!rows[0])return res.status(409).json({error:"Ordem inexistente ou já encerrada."});res.json(rows[0])
 }));
 app.post("/api/producao/ordens/:id/entrada-preparacao",ar(async(req,res)=>{
  const c=await pool.connect();try{await c.query("BEGIN");
   const o=(await c.query(`SELECT * FROM ordens_producao WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND status='finalizada' FOR UPDATE`,[req.params.id,...t(req)])).rows[0];
   if(!o){await c.query("ROLLBACK");return res.status(404).json({error:"Produção finalizada não encontrada."})}
   const ja=(await c.query("SELECT 1 FROM estoque_preparacoes WHERE referencia=$1 AND empresa_id=$2 AND unidade_id=$3",["OP #"+o.id,...t(req)])).rows[0];
   if(ja){await c.query("ROLLBACK");return res.status(409).json({error:"Esta produção já entrou no estoque."})}
   const qtd=n(o.rendimento_real)||n(o.quantidade_planejada),cu=qtd>0?n(o.custo_real)/qtd:0;
   await c.query(`INSERT INTO estoque_preparacoes(preparacao_id,quantidade,tipo,referencia,custo_unitario,usuario_id,empresa_id,unidade_id)
    VALUES($1,$2,'producao',$3,$4,$5,$6,$7)`,[o.preparacao_id,qtd,"OP #"+o.id,cu,req.user.id,...t(req)]);
   await c.query("COMMIT");res.json({ok:true,quantidade:qtd,custo_unitario:cu})
  }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
 }));
 app.put("/api/fornecedores/:id",ar(async(req,res)=>{const b=req.body||{};const {rows}=await pool.query(`UPDATE fornecedores SET nome=$1,contato=$2,email=$3,telefone=$4,observacoes=$5,ativo=$6,updated_at=NOW()
  WHERE id=$7 AND empresa_id=$8 AND unidade_id=$9 RETURNING *`,[String(b.nome||"").trim(),b.contato||"",b.email||"",b.telefone||"",b.observacoes||"",b.ativo!==false,req.params.id,...t(req)]);if(!rows[0])return res.status(404).json({error:"Fornecedor não encontrado."});res.json(rows[0])}));
 app.delete("/api/fornecedores/:id",ar(async(req,res)=>{const {rows}=await pool.query("UPDATE fornecedores SET ativo=FALSE,updated_at=NOW() WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 RETURNING id",[req.params.id,...t(req)]);if(!rows[0])return res.status(404).json({error:"Fornecedor não encontrado."});res.status(204).end()}));
 app.get("/api/compras/:id",ar(async(req,res)=>{const c=(await pool.query(`SELECT c.*,f.nome fornecedor FROM compras c LEFT JOIN fornecedores f ON f.id=c.fornecedor_id WHERE c.id=$1 AND c.empresa_id=$2 AND c.unidade_id=$3`,[req.params.id,...t(req)])).rows[0];if(!c)return res.status(404).json({error:"Compra não encontrada."});c.itens=(await pool.query("SELECT * FROM compra_itens WHERE compra_id=$1 ORDER BY id",[c.id])).rows;res.json(c)}));
 app.get("/api/inventarios",ar(async(req,res)=>{const {rows}=await pool.query(`SELECT v.*,i.ingrediente,i.unidade FROM inventarios v JOIN insumos i ON i.id=v.insumo_id WHERE v.empresa_id=$1 AND v.unidade_id=$2 ORDER BY v.data_contagem DESC LIMIT 300`,t(req));res.json(rows)}));
 app.get("/api/perdas",ar(async(req,res)=>{const {rows}=await pool.query(`SELECT p.*,i.ingrediente,i.unidade FROM perdas p JOIN insumos i ON i.id=p.insumo_id WHERE p.empresa_id=$1 AND p.unidade_id=$2 ORDER BY p.created_at DESC LIMIT 300`,t(req));res.json(rows)}));
 app.delete("/api/documentos-operacionais/:id",ar(async(req,res)=>{const {rows}=await pool.query("DELETE FROM documentos_operacionais WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 RETURNING id",[req.params.id,...t(req)]);if(!rows[0])return res.status(404).json({error:"Documento não encontrado."});res.status(204).end()}));
 app.get("/api/relatorios/resumo",ar(async(req,res)=>{
  const [est,per,com,prod]=await Promise.all([
   pool.query(`SELECT COALESCE(SUM(saldo*i.preco_real),0)::numeric valor FROM (SELECT i.id,COALESCE(SUM(m.quantidade),0) saldo FROM insumos i LEFT JOIN estoque_movimentacoes m ON m.insumo_id=i.id AND m.empresa_id=$1 AND m.unidade_id=$2 WHERE i.empresa_id=$1 AND i.unidade_id=$2 GROUP BY i.id) x JOIN insumos i ON i.id=x.id`,t(req)),
   pool.query("SELECT COALESCE(SUM(custo),0)::numeric valor,COUNT(*)::int qtd FROM perdas WHERE empresa_id=$1 AND unidade_id=$2 AND created_at>=date_trunc('month',NOW())",t(req)),
   pool.query("SELECT COALESCE(SUM(total),0)::numeric valor,COUNT(*)::int qtd FROM compras WHERE empresa_id=$1 AND unidade_id=$2 AND data_compra>=date_trunc('month',CURRENT_DATE)",t(req)),
   pool.query("SELECT COALESCE(SUM(custo_real),0)::numeric valor,COUNT(*)::int qtd FROM ordens_producao WHERE empresa_id=$1 AND unidade_id=$2 AND status='finalizada' AND finalizada_at>=date_trunc('month',NOW())",t(req))
  ]);res.json({valor_estoque:est.rows[0].valor,perdas_mes:per.rows[0],compras_mes:com.rows[0],producao_mes:prod.rows[0]})
 }));
}