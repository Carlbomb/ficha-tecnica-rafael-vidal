const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const num=v=>Number.isFinite(Number(v))?Number(v):0;

export async function initOperacao(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS fornecedores (
  id BIGSERIAL PRIMARY KEY, nome TEXT NOT NULL, contato TEXT DEFAULT '', email TEXT DEFAULT '', telefone TEXT DEFAULT '',
  observacoes TEXT DEFAULT '', ativo BOOLEAN NOT NULL DEFAULT TRUE, empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant ON fornecedores(empresa_id,unidade_id,nome);
 CREATE TABLE IF NOT EXISTS compras (
  id BIGSERIAL PRIMARY KEY, fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL, numero_documento TEXT DEFAULT '',
  data_compra DATE DEFAULT CURRENT_DATE, total NUMERIC(14,4) NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT DEFAULT '', empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS compra_itens (
  id BIGSERIAL PRIMARY KEY, compra_id BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  insumo_id BIGINT REFERENCES insumos(id) ON DELETE SET NULL, descricao TEXT NOT NULL, quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
  unidade TEXT DEFAULT 'KG', preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0, total NUMERIC(14,4) NOT NULL DEFAULT 0
 );
 CREATE TABLE IF NOT EXISTS historico_precos (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL, preco_unitario NUMERIC(14,4) NOT NULL,
  data_preco DATE DEFAULT CURRENT_DATE, compra_id BIGINT REFERENCES compras(id) ON DELETE SET NULL,
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS inventarios (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  quantidade_contada NUMERIC(14,4) NOT NULL DEFAULT 0, data_contagem TIMESTAMPTZ DEFAULT NOW(), responsavel TEXT DEFAULT '',
  observacoes TEXT DEFAULT '', empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS perdas (
  id BIGSERIAL PRIMARY KEY, insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  quantidade NUMERIC(14,4) NOT NULL, motivo TEXT DEFAULT '', custo NUMERIC(14,4) NOT NULL DEFAULT 0,
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS documentos_operacionais (
  id BIGSERIAL PRIMARY KEY, tipo TEXT NOT NULL DEFAULT 'outro', nome TEXT NOT NULL, emissor TEXT DEFAULT '', referencia TEXT DEFAULT '',
  emissao DATE, validade DATE, status TEXT NOT NULL DEFAULT 'valido', observacoes TEXT DEFAULT '',
  empresa_id BIGINT NOT NULL, unidade_id BIGINT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
 );`);
}
export function installOperacao(app,pool){
 const tenant=req=>[req.user.empresa_id,req.user.unidade_id];
 app.get('/api/fornecedores',asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM fornecedores WHERE empresa_id=$1 AND unidade_id=$2 ORDER BY nome',tenant(req));res.json(rows)}));
 app.post('/api/fornecedores',asyncRoute(async(req,res)=>{const b=req.body,nome=String(b.nome||'').trim();if(!nome)return res.status(400).json({error:'Informe o fornecedor.'});const {rows}=await pool.query(`INSERT INTO fornecedores(nome,contato,email,telefone,observacoes,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[nome,b.contato||'',b.email||'',b.telefone||'',b.observacoes||'',...tenant(req)]);res.status(201).json(rows[0])}));
 app.get('/api/compras',asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT c.*,f.nome fornecedor FROM compras c LEFT JOIN fornecedores f ON f.id=c.fornecedor_id WHERE c.empresa_id=$1 AND c.unidade_id=$2 ORDER BY c.data_compra DESC,c.id DESC`,tenant(req));res.json(rows)}));
 app.post('/api/compras',asyncRoute(async(req,res)=>{const b=req.body,itens=Array.isArray(b.itens)?b.itens:[];if(!itens.length)return res.status(400).json({error:'Adicione itens à compra.'});const client=await pool.connect();try{await client.query('BEGIN');const total=itens.reduce((s,i)=>s+num(i.quantidade)*num(i.preco_unitario),0);const q=await client.query(`INSERT INTO compras(fornecedor_id,numero_documento,data_compra,total,status,observacoes,empresa_id,unidade_id) VALUES($1,$2,$3,$4,'pendente',$5,$6,$7) RETURNING *`,[b.fornecedor_id||null,b.numero_documento||'',b.data_compra||new Date().toISOString().slice(0,10),total,b.observacoes||'',...tenant(req)]);for(const i of itens)await client.query(`INSERT INTO compra_itens(compra_id,insumo_id,descricao,quantidade,unidade,preco_unitario,total) VALUES($1,$2,$3,$4,$5,$6,$7)`,[q.rows[0].id,i.insumo_id||null,i.descricao||'',num(i.quantidade),i.unidade||'KG',num(i.preco_unitario),num(i.quantidade)*num(i.preco_unitario)]);await client.query('COMMIT');res.status(201).json(q.rows[0])}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
 app.post('/api/compras/:id/reconciliar',asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const t=tenant(req);const c=await client.query('SELECT * FROM compras WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 FOR UPDATE',[req.params.id,...t]);if(!c.rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Compra não encontrada.'})}const itens=(await client.query('SELECT * FROM compra_itens WHERE compra_id=$1',[req.params.id])).rows;for(const i of itens){if(!i.insumo_id)continue;const ins=(await client.query('SELECT * FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3',[i.insumo_id,...t])).rows[0];if(!ins)continue;const fc=num(ins.fc)||1,real=num(i.preco_unitario)*fc;await client.query('UPDATE insumos SET preco_compra=$1,preco_real=$2,fornecedor=COALESCE((SELECT nome FROM fornecedores WHERE id=$3),fornecedor),data_cotacao=CURRENT_DATE,updated_at=NOW() WHERE id=$4',[num(i.preco_unitario),real,c.rows[0].fornecedor_id,i.insumo_id]);await client.query(`INSERT INTO historico_precos(insumo_id,fornecedor_id,preco_unitario,data_preco,compra_id,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[i.insumo_id,c.rows[0].fornecedor_id,num(i.preco_unitario),c.rows[0].data_compra,c.rows[0].id,...t]);await client.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id) SELECT $1,'entrada',$2,COALESCE(SUM(quantidade),0),COALESCE(SUM(quantidade),0)+$2,$3,'Entrada por compra',$4,$5,$6 FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$5 AND unidade_id=$6`,[i.insumo_id,num(i.quantidade),'Compra #'+c.rows[0].id,req.user.id,...t]);}await client.query("UPDATE compras SET status='reconciliada' WHERE id=$1",[req.params.id]);await client.query('COMMIT');res.json({ok:true})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
 app.get('/api/historico-precos/:insumoId',asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT h.*,f.nome fornecedor FROM historico_precos h LEFT JOIN fornecedores f ON f.id=h.fornecedor_id WHERE h.insumo_id=$1 AND h.empresa_id=$2 AND h.unidade_id=$3 ORDER BY h.data_preco DESC,h.id DESC`,[req.params.insumoId,...tenant(req)]);res.json(rows)}));
 app.post('/api/inventarios',asyncRoute(async(req,res)=>{const b=req.body,t=tenant(req),q=num(b.quantidade_contada);const client=await pool.connect();try{await client.query('BEGIN');const atual=num((await client.query('SELECT COALESCE(SUM(quantidade),0) saldo FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$2 AND unidade_id=$3',[b.insumo_id,...t])).rows[0].saldo);await client.query(`INSERT INTO inventarios(insumo_id,quantidade_contada,responsavel,observacoes,usuario_id,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[b.insumo_id,q,b.responsavel||'',b.observacoes||'',req.user.id,...t]);const dif=q-atual;if(dif)await client.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id) VALUES($1,'ajuste',$2,$3,$4,'Inventário',$5,$6,$7,$8)`,[b.insumo_id,dif,atual,q,b.observacoes||'',req.user.id,...t]);await client.query('COMMIT');res.json({ok:true,saldo_anterior:atual,saldo_novo:q,ajuste:dif})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
 app.post('/api/perdas',asyncRoute(async(req,res)=>{const b=req.body,t=tenant(req),q=Math.abs(num(b.quantidade));if(!q)return res.status(400).json({error:'Informe a quantidade.'});const client=await pool.connect();try{await client.query('BEGIN');const ins=(await client.query('SELECT * FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3',[b.insumo_id,...t])).rows[0];if(!ins){await client.query('ROLLBACK');return res.status(404).json({error:'Insumo não encontrado.'})}const atual=num((await client.query('SELECT COALESCE(SUM(quantidade),0) saldo FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$2 AND unidade_id=$3',[b.insumo_id,...t])).rows[0].saldo);if(atual<q){await client.query('ROLLBACK');return res.status(409).json({error:'Estoque insuficiente.'})}const custo=q*num(ins.preco_real);await client.query('INSERT INTO perdas(insumo_id,quantidade,motivo,custo,usuario_id,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[b.insumo_id,q,b.motivo||'',custo,req.user.id,...t]);await client.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id) VALUES($1,'perda',$2,$3,$4,$5,'',$6,$7,$8)`,[b.insumo_id,-q,atual,atual-q,b.motivo||'Perda',req.user.id,...t]);await client.query('COMMIT');res.json({ok:true,custo})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
 app.get('/api/documentos-operacionais',asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT *,CASE WHEN validade<CURRENT_DATE THEN 'vencido' WHEN validade<=CURRENT_DATE+INTERVAL '30 days' THEN 'vencendo' ELSE 'valido' END status_calculado FROM documentos_operacionais WHERE empresa_id=$1 AND unidade_id=$2 ORDER BY validade NULLS LAST`,tenant(req));res.json(rows)}));
 app.post('/api/documentos-operacionais',asyncRoute(async(req,res)=>{const b=req.body;if(!String(b.nome||'').trim())return res.status(400).json({error:'Informe o nome do documento.'});const {rows}=await pool.query(`INSERT INTO documentos_operacionais(tipo,nome,emissor,referencia,emissao,validade,observacoes,empresa_id,unidade_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[b.tipo||'outro',b.nome,b.emissor||'',b.referencia||'',b.emissao||null,b.validade||null,b.observacoes||'',...tenant(req)]);res.status(201).json(rows[0])}));
}
