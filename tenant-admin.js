import crypto from "node:crypto";
const hp=(p,s=crypto.randomBytes(16).toString("base64url"))=>`${s}:${crypto.scryptSync(p,s,64).toString("hex")}`;
export async function initTenantAdmin(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS usuario_unidades(
 usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 unidade_id BIGINT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
 empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY(usuario_id,unidade_id));`);
 await pool.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id)
 SELECT id,unidade_id,empresa_id FROM usuarios WHERE unidade_id IS NOT NULL AND empresa_id IS NOT NULL
 ON CONFLICT(usuario_id,unidade_id) DO NOTHING`);
 await pool.query(`UPDATE usuarios SET plataforma_admin=(LOWER(email)=LOWER($1)) WHERE plataforma_admin IS DISTINCT FROM (LOWER(email)=LOWER($1))`,["charlcooking@gmail.com"]);
 const pa=await pool.query(`SELECT id FROM usuarios WHERE plataforma_admin=TRUE AND LOWER(email)=LOWER($1) LIMIT 1`,["charlcooking@gmail.com"]);
 if(!pa.rows[0]) console.warn("MISEVO: usuário principal da plataforma não encontrado.");
}
export function installTenantAdmin(app,pool){
 const platform=(req,res,next)=>req.user?.plataforma_admin===true?next():res.status(403).json({error:"Acesso restrito ao Admin MISEVO."});
 app.get("/api/plataforma/empresas",platform,async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT e.*,COUNT(DISTINCT u.id)::integer AS unidades,COUNT(DISTINCT us.id)::integer AS usuarios FROM empresas e LEFT JOIN unidades u ON u.empresa_id=e.id LEFT JOIN usuarios us ON us.empresa_id=e.id GROUP BY e.id ORDER BY e.nome`);res.json(rows)}catch(e){next(e)}});
 app.post("/api/plataforma/empresas",platform,async(req,res,next)=>{const db=await pool.connect();try{const b=req.body||{},nome=String(b.nome||"").trim(),an=String(b.admin_nome||"").trim(),email=String(b.admin_email||"").trim().toLowerCase(),senha=String(b.admin_senha||"");if(!nome||!an||!email)return res.status(400).json({error:"Preencha empresa, administrador e e-mail."});if(senha.length<8)return res.status(400).json({error:"A senha inicial deve ter pelo menos 8 caracteres."});await db.query("BEGIN");const emp=(await db.query(`INSERT INTO empresas(nome,nome_fantasia,documento) VALUES($1,$2,$3) RETURNING *`,[nome,String(b.nome_fantasia||nome),String(b.documento||"")])).rows[0];const un=(await db.query(`INSERT INTO unidades(empresa_id,nome,codigo) VALUES($1,$2,$3) RETURNING *`,[emp.id,String(b.unidade_nome||"Unidade Principal"),String(b.unidade_codigo||"MATRIZ")])).rows[0];const us=(await db.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,empresa_id,unidade_id) VALUES($1,$2,$3,\'admin\',$4,$5) RETURNING id,nome,email`,[an,email,hp(senha),emp.id,un.id])).rows[0];await db.query(`INSERT INTO usuario_unidades(usuario_id,unidade_id,empresa_id) VALUES($1,$2,$3)`,[us.id,un.id,emp.id]);await db.query("COMMIT");res.status(201).json({empresa:emp,unidade:un,administrador:us})}catch(e){await db.query("ROLLBACK");if(e.code==="23505")return res.status(409).json({error:"E-mail já cadastrado."});next(e)}finally{db.release()}});
 app.delete("/api/plataforma/empresas/:id",platform,async(req,res,next)=>{const db=await pool.connect();try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Restaurante inválido."});if(Number(req.user?.empresa_id)===id)return res.status(400).json({error:"O restaurante vinculado ao usuário principal não pode ser removido por esta tela."});const emp=(await db.query("SELECT id,nome FROM empresas WHERE id=$1",[id])).rows[0];if(!emp)return res.status(404).json({error:"Restaurante não encontrado."});await db.query("BEGIN");const tables=(await db.query(`SELECT DISTINCT tc.table_name FROM information_schema.table_constraints tc JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_schema='public' AND ccu.table_name='empresas' AND tc.table_schema='public'`)).rows.map(r=>r.table_name).filter(t=>/^[a-z_][a-z0-9_]*$/.test(t)&&t!=="empresas");for(const t of tables)await db.query(`DELETE FROM "${t}" WHERE empresa_id=$1`,[id]);await db.query("DELETE FROM empresas WHERE id=$1",[id]);await db.query("COMMIT");res.json({ok:true,nome:emp.nome})}catch(e){await db.query("ROLLBACK");next(e)}finally{db.release()}});
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
 app.post("/api/empresa/trocar-unidade",async(req,res,next)=>{try{
  const id=Number(req.body?.unidade_id);
  const {rows}=await pool.query(`SELECT u.id,u.nome FROM usuario_unidades a JOIN unidades u ON u.id=a.unidade_id
  WHERE a.usuario_id=$1 AND a.empresa_id=$2 AND a.unidade_id=$3 AND a.ativo=TRUE AND u.ativo=TRUE`,[req.user.id,req.user.empresa_id,id]);
  if(!rows[0])return res.status(403).json({error:"Você não possui acesso a esta unidade."});
  await pool.query(`UPDATE usuarios SET unidade_id=$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,[id,req.user.id,req.user.empresa_id]);
  res.json({ok:true,unidade:rows[0]})
 }catch(e){next(e)}});
}