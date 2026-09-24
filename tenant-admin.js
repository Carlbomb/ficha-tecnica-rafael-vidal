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
}
export function installTenantAdmin(app,pool){
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