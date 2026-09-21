import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway.internal") ? false : { rejectUnauthorized: false }
});

app.use(express.json({limit:"1mb"}));
app.use(express.static("public"));

const schema = `
CREATE TABLE IF NOT EXISTS insumos (
 id BIGSERIAL PRIMARY KEY,
 ingrediente TEXT NOT NULL,
 unidade TEXT NOT NULL DEFAULT 'KG',
 peso_bruto NUMERIC(14,4) NOT NULL DEFAULT 1,
 peso_liquido NUMERIC(14,4) NOT NULL DEFAULT 1,
 fc NUMERIC(14,4) NOT NULL DEFAULT 1,
 preco_compra NUMERIC(14,4) NOT NULL DEFAULT 0,
 preco_real NUMERIC(14,4) NOT NULL DEFAULT 0,
 fornecedor TEXT DEFAULT '',
 data_cotacao DATE,
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 observacoes TEXT DEFAULT '',
 created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS fichas (
 id BIGSERIAL PRIMARY KEY,
 nome_prato TEXT NOT NULL,
 categoria TEXT NOT NULL DEFAULT 'Outros',
 rendimento_kg NUMERIC(14,4) NOT NULL DEFAULT 0,
 porcoes NUMERIC(14,2) NOT NULL DEFAULT 1,
 preco_venda NUMERIC(14,4) NOT NULL DEFAULT 0,
 modo_preparo TEXT DEFAULT '',
 observacoes TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Ativa',
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ingredientes (
 id BIGSERIAL PRIMARY KEY,
 ficha_id BIGINT NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
 insumo_id BIGINT NOT NULL REFERENCES insumos(id),
 quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
 unidade TEXT NOT NULL DEFAULT 'KG',
 ordem INTEGER NOT NULL DEFAULT 0,
 observacoes TEXT DEFAULT '',
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingredientes_ficha ON ingredientes(ficha_id);
`;
async function init(){ await pool.query(schema); console.log("Banco de dados pronto"); }
const n=v=>Number(v||0);
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

app.get("/health",asyncRoute(async(_,res)=>{await pool.query("SELECT 1");res.json({ok:true,database:true})}));

app.get("/api/insumos",asyncRoute(async(_,res)=>{
 const {rows}=await pool.query("SELECT * FROM insumos ORDER BY ingrediente");
 res.json(rows);
}));
app.post("/api/insumos",asyncRoute(async(req,res)=>{
 const b=req.body, bruto=n(b.peso_bruto)||1, liquido=n(b.peso_liquido)||1;
 const fc=liquido?bruto/liquido:1, real=n(b.preco_compra)*fc;
 const q=`INSERT INTO insumos(ingrediente,unidade,peso_bruto,peso_liquido,fc,preco_compra,preco_real,fornecedor,data_cotacao,ativo,observacoes)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`;
 const {rows}=await pool.query(q,[b.ingrediente,b.unidade||"KG",bruto,liquido,fc,n(b.preco_compra),real,b.fornecedor||"",b.data_cotacao||null,b.ativo!==false,b.observacoes||""]);
 res.status(201).json(rows[0]);
}));
app.put("/api/insumos/:id",asyncRoute(async(req,res)=>{
 const b=req.body, bruto=n(b.peso_bruto)||1, liquido=n(b.peso_liquido)||1;
 const fc=liquido?bruto/liquido:1, real=n(b.preco_compra)*fc;
 const q=`UPDATE insumos SET ingrediente=$1,unidade=$2,peso_bruto=$3,peso_liquido=$4,fc=$5,preco_compra=$6,preco_real=$7,fornecedor=$8,data_cotacao=$9,ativo=$10,observacoes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`;
 const {rows}=await pool.query(q,[b.ingrediente,b.unidade||"KG",bruto,liquido,fc,n(b.preco_compra),real,b.fornecedor||"",b.data_cotacao||null,b.ativo!==false,b.observacoes||"",req.params.id]);
 res.json(rows[0]);
}));
app.delete("/api/insumos/:id",asyncRoute(async(req,res)=>{
 try{await pool.query("DELETE FROM insumos WHERE id=$1",[req.params.id]);res.status(204).end()}
 catch(e){if(e.code==="23503") return res.status(409).json({error:"Este insumo está sendo usado em uma ficha técnica."});throw e}
}));

const fichaSelect=`
SELECT f.*,
 COALESCE(SUM(i.quantidade * ins.preco_real),0)::numeric AS custo_total,
 CASE WHEN f.porcoes>0 THEN (COALESCE(SUM(i.quantidade*ins.preco_real),0)/f.porcoes)::numeric ELSE 0 END AS custo_por_porcao,
 CASE WHEN f.porcoes>0 AND f.preco_venda>0 THEN ((COALESCE(SUM(i.quantidade*ins.preco_real),0)/f.porcoes)/f.preco_venda*100)::numeric ELSE 0 END AS cmv_percentual,
 CASE WHEN f.porcoes>0 THEN (f.rendimento_kg/f.porcoes)::numeric ELSE 0 END AS peso_por_porcao
FROM fichas f LEFT JOIN ingredientes i ON i.ficha_id=f.id LEFT JOIN insumos ins ON ins.id=i.insumo_id`;
app.get("/api/fichas",asyncRoute(async(_,res)=>{
 const {rows}=await pool.query(fichaSelect+" GROUP BY f.id ORDER BY f.nome_prato");res.json(rows)
}));
app.get("/api/fichas/:id",asyncRoute(async(req,res)=>{
 const {rows}=await pool.query(fichaSelect+" WHERE f.id=$1 GROUP BY f.id",[req.params.id]);
 if(!rows[0]) return res.status(404).json({error:"Ficha não encontrada"});
 const ing=await pool.query(`SELECT i.*,ins.ingrediente,ins.preco_real,(i.quantidade*ins.preco_real)::numeric custo_item FROM ingredientes i JOIN insumos ins ON ins.id=i.insumo_id WHERE ficha_id=$1 ORDER BY ordem,id`,[req.params.id]);
 res.json({...rows[0],ingredientes:ing.rows});
}));
app.post("/api/fichas",asyncRoute(async(req,res)=>{
 const b=req.body; const {rows}=await pool.query(`INSERT INTO fichas(nome_prato,categoria,rendimento_kg,porcoes,preco_venda,modo_preparo,observacoes,status,ativo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
 [b.nome_prato,b.categoria||"Outros",n(b.rendimento_kg),n(b.porcoes)||1,n(b.preco_venda),b.modo_preparo||"",b.observacoes||"",b.status||"Ativa",b.ativo!==false]);res.status(201).json(rows[0])
}));
app.put("/api/fichas/:id",asyncRoute(async(req,res)=>{
 const b=req.body; const {rows}=await pool.query(`UPDATE fichas SET nome_prato=$1,categoria=$2,rendimento_kg=$3,porcoes=$4,preco_venda=$5,modo_preparo=$6,observacoes=$7,status=$8,ativo=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
 [b.nome_prato,b.categoria||"Outros",n(b.rendimento_kg),n(b.porcoes)||1,n(b.preco_venda),b.modo_preparo||"",b.observacoes||"",b.status||"Ativa",b.ativo!==false,req.params.id]);res.json(rows[0])
}));
app.delete("/api/fichas/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM fichas WHERE id=$1",[req.params.id]);res.status(204).end()}));
app.post("/api/fichas/:id/ingredientes",asyncRoute(async(req,res)=>{
 const b=req.body; const {rows}=await pool.query(`INSERT INTO ingredientes(ficha_id,insumo_id,quantidade,unidade,ordem,observacoes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
 [req.params.id,b.insumo_id,n(b.quantidade),b.unidade||"KG",Number(b.ordem||0),b.observacoes||""]);res.status(201).json(rows[0])
}));
app.delete("/api/ingredientes/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM ingredientes WHERE id=$1",[req.params.id]);res.status(204).end()}));

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Erro interno",detail:process.env.NODE_ENV==="production"?undefined:err.message})});

init().then(()=>app.listen(port,"0.0.0.0",()=>console.log(`Ficha Técnica Rafael Vidal: ${port}`))).catch(e=>{console.error("Falha ao iniciar banco",e);process.exit(1)});
