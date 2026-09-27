import pg from "pg";
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("railway")?{rejectUnauthorized:false}:undefined});
const c=await pool.connect();
try{
 await c.query("BEGIN");
 const fi=await c.query("SELECT id,nome_prato FROM fichas WHERE observacoes='Importado por planilha'");
 const pr=await c.query("SELECT id,nome FROM preparacoes WHERE observacoes='Importado por planilha'");
 const ins=await c.query("SELECT id,ingrediente FROM insumos WHERE observacoes='Importado por planilha'");
 if(fi.rows.length)await c.query("DELETE FROM fichas WHERE id=ANY($1::bigint[])",[fi.rows.map(x=>x.id)]);
 if(pr.rows.length){
  const ids=pr.rows.map(x=>x.id);
  await c.query("DELETE FROM ficha_preparacoes WHERE preparacao_id=ANY($1::bigint[])",[ids]);
  await c.query("DELETE FROM preparacao_componentes WHERE preparacao_id=ANY($1::bigint[]) OR componente_id=ANY($1::bigint[])",[ids]);
  await c.query("DELETE FROM preparacao_ingredientes WHERE preparacao_id=ANY($1::bigint[])",[ids]);
  await c.query("DELETE FROM preparacoes WHERE id=ANY($1::bigint[])",[ids]);
}
 let removed=0;
 if(ins.rows.length){const r=await c.query("DELETE FROM insumos i WHERE i.id=ANY($1::bigint[]) AND NOT EXISTS(SELECT 1 FROM ingredientes g WHERE g.insumo_id=i.id) AND NOT EXISTS(SELECT 1 FROM preparacao_ingredientes p WHERE p.insumo_id=i.id) RETURNING id",[ins.rows.map(x=>x.id)]);removed=r.rowCount}
 await c.query("COMMIT");
 console.log("[MISEVO][cleanup-import]",JSON.stringify({fichas:fi.rows.length,preparacoes:pr.rows.length,insumos:removed,insumosMarcados:ins.rows.length}));
}catch(e){await c.query("ROLLBACK");console.error(e);process.exitCode=1}finally{c.release();await pool.end()}
