import crypto from "node:crypto";
const hp=(p,s=crypto.randomBytes(16).toString("base64url"))=>`${s}:${crypto.scryptSync(p,s,64).toString("hex")}`;
export async function initTenantAdmin(pool){
 await pool.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id)
 SELECT id,unidade_id,empresa_id FROM usuarios WHERE unidade_id IS NOT NULL AND empresa_id IS NOT NULL
 ON CONFLICT(usuario_id,unidade_id) DO NOTHING`);
 await pool.query(`UPDATE usuarios SET plataforma_admin=(LOWER(email)=LOWER($1)) WHERE plataforma_admin IS DISTINCT FROM (LOWER(email)=LOWER($1))`,["charlcooking@gmail.com"]);
 const pa=await pool.query(`SELECT id FROM usuarios WHERE plataforma_admin=TRUE AND LOWER(email)=LOWER($1) LIMIT 1`,["charlcooking@gmail.com"]);
 if(!pa.rows[0]) console.warn("MISEVO: usuário principal da plataforma não encontrado.");
}
export function installTenantAdmin(app,pool){
 const platform=(req,res,next)=>req.user?.plataforma_admin===true?next():res.status(403).json({error:"Acesso restrito ao Admin MISEVO."});
 app.get("/api/plataforma/contextos",platform,async(req,res,next)=>{try{
  const {rows}=await pool.query(`SELECT e.id empresa_id,e.nome empresa_nome,u.id unidade_id,u.nome unidade_nome,u.codigo
    FROM empresas e JOIN unidades u ON u.empresa_id=e.id
    WHERE e.ativo=TRUE AND u.ativo=TRUE ORDER BY e.nome,u.nome`);
  res.json(rows)
 }catch(e){next(e)}});
 app.post("/api/plataforma/trocar-contexto",platform,async(req,res,next)=>{const db=await pool.connect();try{
  const empresaId=Number(req.body?.empresa_id),unidadeId=Number(req.body?.unidade_id);
  const alvo=(await db.query(`SELECT e.id empresa_id,e.nome empresa_nome,u.id unidade_id,u.nome unidade_nome
    FROM empresas e JOIN unidades u ON u.empresa_id=e.id
    WHERE e.id=$1 AND u.id=$2 AND u.empresa_id=e.id AND e.ativo=TRUE AND u.ativo=TRUE`,[empresaId,unidadeId])).rows[0];
  if(!alvo)return res.status(404).json({error:"Restaurante ou unidade não encontrado."});
  await db.query("BEGIN");
  const s=await db.query("UPDATE sessoes SET empresa_id=$1,unidade_id=$2 WHERE id=$3 AND usuario_id=$4 RETURNING id",[empresaId,unidadeId,req.user.sessao_id,req.user.id]);
  if(!s.rows[0]){await db.query("ROLLBACK");return res.status(409).json({error:"Não foi possível atualizar o contexto desta sessão."})}
  await db.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id,ativo) VALUES($1,$2,$3,TRUE)
    ON CONFLICT(usuario_id,unidade_id) DO UPDATE SET empresa_id=EXCLUDED.empresa_id,ativo=TRUE`,[req.user.id,unidadeId,empresaId]);
  await db.query("COMMIT");res.json({ok:true,...alvo})
 }catch(e){await db.query("ROLLBACK");next(e)}finally{db.release()}});
 app.get("/api/plataforma/empresas",platform,async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT e.*,COUNT(DISTINCT u.id)::integer AS unidades,COUNT(DISTINCT us.id)::integer AS usuarios FROM empresas e LEFT JOIN unidades u ON u.empresa_id=e.id LEFT JOIN usuarios us ON us.empresa_id=e.id GROUP BY e.id ORDER BY e.nome`);res.json(rows)}catch(e){next(e)}});
 app.post("/api/plataforma/empresas",platform,async(req,res,next)=>{const db=await pool.connect();try{const b=req.body||{},nome=String(b.nome||"").trim(),an=String(b.admin_nome||"").trim(),email=String(b.admin_email||"").trim().toLowerCase(),senha=String(b.admin_senha||"");if(!nome||!an||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Preencha empresa, administrador e e-mail."});if(senha.length<8)return res.status(400).json({error:"A senha inicial deve ter pelo menos 8 caracteres."});await db.query("BEGIN");const emp=(await db.query(`INSERT INTO empresas(nome,nome_fantasia,documento) VALUES($1,$2,$3) RETURNING *`,[nome,String(b.nome_fantasia||nome),String(b.documento||"")])).rows[0];const un=(await db.query(`INSERT INTO unidades(empresa_id,nome,codigo) VALUES($1,$2,$3) RETURNING *`,[emp.id,String(b.unidade_nome||"Unidade Principal"),String(b.unidade_codigo||"MATRIZ")])).rows[0];const us=(await db.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id,unidade_id) VALUES($1,$2,$3,\'admin\',$4,$5) RETURNING id,nome,email`,[an,email,hp(senha),emp.id,un.id])).rows[0];await db.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id) VALUES($1,$2,$3)`,[us.id,un.id,emp.id]);await db.query("COMMIT");res.status(201).json({empresa:emp,unidade:un,administrador:us})}catch(e){await db.query("ROLLBACK");if(e.code==="23505")return res.status(409).json({error:"E-mail já cadastrado."});next(e)}finally{db.release()}});
 app.delete("/api/plataforma/empresas/:id",platform,async(req,res,next)=>{
  const db=await pool.connect();
  try {
   const id=Number(req.params.id);
   if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:"Restaurante inválido."});
   if(req.body?.confirmacao!=="REMOVER")return res.status(400).json({error:"Confirme a exclusão do restaurante."});
   if(Number(req.user.empresa_id)===id)return res.status(409).json({error:"Entre em outro restaurante antes de excluir o restaurante em uso."});
   await db.query("BEGIN");
   const emp=(await db.query("SELECT id,nome FROM empresas WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(!emp){await db.query("ROLLBACK");return res.status(404).json({error:"Restaurante não encontrado."})}
   const principal=await db.query("SELECT id FROM usuarios WHERE empresa_id=$1 AND plataforma_admin=TRUE",[id]);
   if(principal.rows.length){await db.query("ROLLBACK");return res.status(409).json({error:"O restaurante de origem do administrador da plataforma não pode ser excluído."})}
   // Inclui tabelas com empresa_id mesmo quando não existe FK para empresas.
   const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
   const has=(table,column)=>columns.some(x=>x.table_name===table&&x.column_name===column);
   // Filhos sem empresa_id precisam ser excluídos antes de seus pais.
   for(const [child,key,parent] of [
    ["producao_consumos","ordem_id","ordens_producao"],
    ["producao_componentes","ordem_id","ordens_producao"],
    ["compra_itens","compra_id","compras"],
    ["ingredientes","ficha_id","fichas"],
    ["ficha_preparacoes","ficha_id","fichas"],
    ["preparacao_componentes","preparacao_id","preparacoes"],
    ["preparacao_ingredientes","preparacao_id","preparacoes"]
   ])if(has(child,key)&&has(parent,"empresa_id")){
    await db.query(`DELETE FROM "${child}" WHERE "${key}" IN (SELECT id FROM "${parent}" WHERE empresa_id=$1)`,[id]);
   }
   for(const table of ["estoque_movimentacoes","estoque_produzidos","etiqueta_registros","perdas","inventarios","historico_precos","compras","fornecedores","ordens_producao","documentos_operacionais","categorias_producao","fichas","usuario_unidades","sessoes","usuarios","insumos","preparacoes","unidades"]){
    if(has(table,"empresa_id"))await db.query(`DELETE FROM "${table}" WHERE empresa_id=$1`,[id]);
   }
   await db.query("DELETE FROM empresas WHERE id=$1",[id]);
   await db.query("COMMIT");
   res.json({ok:true,nome:emp.nome});
  }catch(e){
   await db.query("ROLLBACK");
   if(e.code==="23503")return res.status(409).json({error:"Há vínculos que impedem a exclusão deste restaurante. Nenhum dado foi removido."});
   next(e);
  }finally{db.release()}
 });
 app.get("/api/empresa/unidades",async(req,res,next)=>{try{
  const {rows}=await pool.query(`SELECT u.id,u.nome,u.codigo,u.ativo FROM usuario_unidades a JOIN unidades u ON u.id=a.unidade_id
  WHERE a.usuario_id=$1 AND a.empresa_id=$2 AND a.ativo=TRUE AND u.ativo=TRUE ORDER BY u.nome`,[req.user.id,req.user.empresa_id]);res.json(rows)
 }catch(e){next(e)}});
 app.post("/api/empresa/unidades",async(req,res,next)=>{try{
  if(req.user.perfil!=="admin")return res.status(403).json({error:"Acesso restrito ao administrador da empresa."});
  const nome=String(req.body?.nome||"").trim();if(!nome)return res.status(400).json({error:"Informe o nome da unidade."});
  const {rows}=await pool.query(`INSERT INTO unidades(empresa_id,nome,codigo) VALUES($1,$2,$3) RETURNING *`,[req.user.empresa_id,nome,String(req.body?.codigo||"").trim()]);
  await pool.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[req.user.id,rows[0].id,req.user.empresa_id]);
  res.status(201).json(rows[0])
 }catch(e){next(e)}});
 app.post("/api/empresa/trocar-unidade",async(req,res,next)=>{const db=await pool.connect();try{
  const id=Number(req.body?.unidade_id);
  const {rows}=await db.query(`SELECT u.id,u.nome FROM usuario_unidades a JOIN unidades u ON u.id=a.unidade_id
  WHERE a.usuario_id=$1 AND a.empresa_id=$2 AND a.unidade_id=$3 AND a.ativo=TRUE AND u.ativo=TRUE`,[req.user.id,req.user.empresa_id,id]);
  if(!rows[0])return res.status(403).json({error:"Você não possui acesso a esta unidade."});
  await db.query("BEGIN");
  const s=await db.query("UPDATE sessoes SET unidade_id=$1 WHERE id=$2 AND usuario_id=$3 RETURNING id",[id,req.user.sessao_id,req.user.id]);
  if(!s.rows[0]){await db.query("ROLLBACK");return res.status(409).json({error:"Não foi possível atualizar a unidade desta sessão."})}
  await db.query(`UPDATE usuarios SET unidade_id=$1,updated_at=NOW() WHERE id=$2`,[id,req.user.id]);
  await db.query("COMMIT");
  res.json({ok:true,unidade:rows[0]})
 }catch(e){await db.query("ROLLBACK").catch(()=>{});next(e)}finally{db.release()}});
}