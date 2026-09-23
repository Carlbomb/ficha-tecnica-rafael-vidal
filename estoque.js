/* MISEVO V19.1 — Estoque da Cozinha + criação automática de insumo */
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};

export async function initEstoque(pool){
  await pool.query(`
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC(14,4) NOT NULL DEFAULT 0;
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS estoque_maximo NUMERIC(14,4) NOT NULL DEFAULT 0;
    ALTER TABLE insumos ADD COLUMN IF NOT EXISTS local_estoque TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS estoque_movimentacoes(
      id BIGSERIAL PRIMARY KEY,
      insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida','perda','ajuste')),
      quantidade NUMERIC(14,4) NOT NULL,
      saldo_anterior NUMERIC(14,4) NOT NULL,
      saldo_novo NUMERIC(14,4) NOT NULL,
      motivo TEXT NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      empresa_id BIGINT NOT NULL,
      unidade_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_tenant ON estoque_movimentacoes(empresa_id,unidade_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_insumo ON estoque_movimentacoes(insumo_id,created_at DESC);
  `);
}

const saldoExpr=`COALESCE((SELECT SUM(m.quantidade) FROM estoque_movimentacoes m
 WHERE m.insumo_id=i.id AND m.empresa_id=i.empresa_id AND m.unidade_id=i.unidade_id),0)`;

export function installEstoque(app,pool){
  app.get("/api/estoque",async(req,res,next)=>{try{
    const {rows}=await pool.query(`
      SELECT i.id,i.ingrediente,i.unidade,i.preco_real,i.estoque_minimo,i.estoque_maximo,i.local_estoque,
      ${saldoExpr}::numeric AS saldo_atual,
      (${saldoExpr}*i.preco_real)::numeric AS valor_estoque,
      CASE WHEN ${saldoExpr}<=0 THEN 'sem_estoque'
           WHEN i.estoque_minimo>0 AND ${saldoExpr}<=i.estoque_minimo THEN 'baixo'
           WHEN i.estoque_maximo>0 AND ${saldoExpr}>i.estoque_maximo THEN 'excesso'
           ELSE 'normal' END AS status_estoque
      FROM insumos i
      WHERE i.empresa_id=$1 AND i.unidade_id=$2 AND i.ativo=TRUE
      ORDER BY i.ingrediente`,[req.user.empresa_id,req.user.unidade_id]);
    res.json(rows);
  }catch(e){next(e)}});

  app.get("/api/estoque/resumo",async(req,res,next)=>{try{
    const {rows}=await pool.query(`
      WITH e AS (SELECT i.id,i.preco_real,i.estoque_minimo,i.estoque_maximo,${saldoExpr} saldo
      FROM insumos i WHERE i.empresa_id=$1 AND i.unidade_id=$2 AND i.ativo=TRUE)
      SELECT COUNT(*)::int itens,
      COUNT(*) FILTER(WHERE saldo<=0)::int sem_estoque,
      COUNT(*) FILTER(WHERE saldo>0 AND estoque_minimo>0 AND saldo<=estoque_minimo)::int abaixo_minimo,
      COUNT(*) FILTER(WHERE estoque_maximo>0 AND saldo>estoque_maximo)::int acima_maximo,
      COALESCE(SUM(saldo*preco_real),0)::numeric valor_total
      FROM e`,[req.user.empresa_id,req.user.unidade_id]);
    res.json(rows[0]);
  }catch(e){next(e)}});

  app.get("/api/estoque/movimentacoes",async(req,res,next)=>{try{
    const {rows}=await pool.query(`
      SELECT m.*,i.ingrediente,i.unidade,u.nome usuario_nome
      FROM estoque_movimentacoes m
      JOIN insumos i ON i.id=m.insumo_id
      LEFT JOIN usuarios u ON u.id=m.usuario_id
      WHERE m.empresa_id=$1 AND m.unidade_id=$2
      ORDER BY m.created_at DESC LIMIT 500`,[req.user.empresa_id,req.user.unidade_id]);
    res.json(rows);
  }catch(e){next(e)}});

  app.put("/api/estoque/insumos/:id",async(req,res,next)=>{try{
    const minimo=Math.max(0,n(req.body.estoque_minimo)),maximo=Math.max(0,n(req.body.estoque_maximo));
    if(maximo>0&&maximo<minimo)return res.status(400).json({error:"O estoque máximo não pode ser menor que o mínimo."});
    const {rows}=await pool.query(`UPDATE insumos SET estoque_minimo=$1,estoque_maximo=$2,local_estoque=$3,updated_at=NOW()
      WHERE id=$4 AND empresa_id=$5 AND unidade_id=$6 RETURNING id,ingrediente,estoque_minimo,estoque_maximo,local_estoque`,
      [minimo,maximo,String(req.body.local_estoque||"").trim(),req.params.id,req.user.empresa_id,req.user.unidade_id]);
    if(!rows[0])return res.status(404).json({error:"Insumo não encontrado."});res.json(rows[0]);
  }catch(e){next(e)}});

  /* Cria o insumo e a primeira entrada em uma única transação. */
  app.post("/api/estoque/novo-insumo",async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const b=req.body||{},ingrediente=String(b.ingrediente||"").trim();
      const unidade=String(b.unidade||"KG").trim().toUpperCase();
      const quantidade=n(b.quantidade),precoCompra=Math.max(0,n(b.preco_compra));
      const fornecedor=String(b.fornecedor||"").trim(),local=String(b.local_estoque||"").trim();
      const minimo=Math.max(0,n(b.estoque_minimo)),maximo=Math.max(0,n(b.estoque_maximo));
      if(!ingrediente)return res.status(400).json({error:"Informe o nome do novo insumo."});
      if(!["KG","G","L","ML","UN"].includes(unidade))return res.status(400).json({error:"Unidade inválida."});
      if(quantidade<=0)return res.status(400).json({error:"Informe uma quantidade de entrada maior que zero."});
      if(maximo>0&&maximo<minimo)return res.status(400).json({error:"O estoque máximo não pode ser menor que o mínimo."});

      await client.query("BEGIN");
      const dup=await client.query(`SELECT id,ingrediente FROM insumos
        WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE AND LOWER(TRIM(ingrediente))=LOWER(TRIM($3)) LIMIT 1`,
        [req.user.empresa_id,req.user.unidade_id,ingrediente]);
      if(dup.rows[0]){
        await client.query("ROLLBACK");
        return res.status(409).json({error:`O insumo "${dup.rows[0].ingrediente}" já existe. Selecione-o para registrar a entrada.`,insumo_id:dup.rows[0].id});
      }

      /* Entrada de estoque usa FC=1 inicialmente. O FC pode ser refinado depois no cadastro de Insumos. */
      const ins=await client.query(`INSERT INTO insumos
        (ingrediente,unidade,peso_bruto,peso_liquido,fc,preco_compra,preco_real,fornecedor,data_cotacao,ativo,observacoes,
         empresa_id,unidade_id,estoque_minimo,estoque_maximo,local_estoque,updated_at)
        VALUES($1,$2,1,1,1,$3,$3,$4,CURRENT_DATE,TRUE,$5,$6,$7,$8,$9,$10,NOW())
        RETURNING id,ingrediente,unidade,preco_compra,preco_real`,
        [ingrediente,unidade,precoCompra,fornecedor,String(b.observacoes||"").trim(),
         req.user.empresa_id,req.user.unidade_id,minimo,maximo,local]);
      const novo=ins.rows[0];
      const mov=await client.query(`INSERT INTO estoque_movimentacoes
        (insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id)
        VALUES($1,'entrada',$2,0,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [novo.id,quantidade,String(b.motivo||"Primeira entrada").trim(),String(b.observacoes||"").trim(),
         req.user.id,req.user.empresa_id,req.user.unidade_id]);
      await client.query("COMMIT");
      res.status(201).json({insumo:novo,movimentacao:mov.rows[0],message:"Insumo criado e entrada registrada com sucesso."});
    }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
  });

  app.post("/api/estoque/movimentacoes",async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const id=Number(req.body.insumo_id),tipo=String(req.body.tipo||"").toLowerCase();
      const qtd=Math.abs(n(req.body.quantidade));
      if(!id||!["entrada","saida","perda","ajuste"].includes(tipo))return res.status(400).json({error:"Movimentação inválida."});
      if(tipo!=="ajuste"&&qtd<=0)return res.status(400).json({error:"Informe uma quantidade maior que zero."});
      await client.query("BEGIN");
      const ins=await client.query(`SELECT id,ingrediente,unidade FROM insumos WHERE id=$1 AND empresa_id=$2 AND unidade_id=$3 AND ativo=TRUE FOR UPDATE`,
        [id,req.user.empresa_id,req.user.unidade_id]);
      if(!ins.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Insumo não encontrado."})}
      const s=await client.query(`SELECT COALESCE(SUM(quantidade),0)::numeric saldo FROM estoque_movimentacoes WHERE insumo_id=$1 AND empresa_id=$2 AND unidade_id=$3`,
        [id,req.user.empresa_id,req.user.unidade_id]);
      const anterior=n(s.rows[0].saldo);
      let delta,novo;
      if(tipo==="ajuste"){novo=n(req.body.quantidade);if(novo<0){await client.query("ROLLBACK");return res.status(400).json({error:"O saldo ajustado não pode ser negativo."})}delta=novo-anterior}
      else {delta=tipo==="entrada"?qtd:-qtd;novo=anterior+delta}
      if(novo<0){await client.query("ROLLBACK");return res.status(409).json({error:`Saldo insuficiente. Disponível: ${anterior} ${ins.rows[0].unidade}.`})}
      const {rows}=await client.query(`INSERT INTO estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_novo,motivo,observacoes,usuario_id,empresa_id,unidade_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [id,tipo,delta,anterior,novo,String(req.body.motivo||"").trim(),String(req.body.observacoes||"").trim(),req.user.id,req.user.empresa_id,req.user.unidade_id]);
      await client.query("COMMIT");res.status(201).json({...rows[0],ingrediente:ins.rows[0].ingrediente,unidade:ins.rows[0].unidade});
    }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
  });
}
