import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("railway.internal")?false:{rejectUnauthorized:false}});
const q=(s,p=[])=>pool.query(s,p).then(r=>r.rows);
try{
 const e=(await q("SELECT id,nome FROM empresas WHERE nome=$1",["MISEVO — Ambiente de Teste"]))[0];
 if(!e) throw new Error("Ambiente de homologação não encontrado");
 const u=(await q("SELECT id,nome FROM unidades WHERE empresa_id=$1 AND nome=$2",[e.id,"Cozinha de Homologação"]))[0];
 const ins=await q("SELECT id,ingrediente,unidade,fc,preco_compra,preco_real FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 ORDER BY ingrediente",[e.id,u.id]);
 const forn=await q("SELECT id,nome FROM fornecedores WHERE empresa_id=$1 AND unidade_id=$2",[e.id,u.id]);
 const counts={};
 for(const [k,t] of Object.entries({compras:"compras",movimentos:"estoque_movimentacoes",perdas:"perdas",inventarios:"inventarios",ordens:"ordens_producao",estoque_preparacoes:"estoque_preparacoes"})){
  counts[k]=Number((await q(`SELECT COUNT(*)::int n FROM ${t} WHERE empresa_id=$1 AND unidade_id=$2`,[e.id,u.id]))[0].n)
 }
 console.log(JSON.stringify({empresa:e,unidade:u,insumos:ins,fornecedores:forn,counts},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{await pool.end()}