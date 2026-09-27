import multer from "multer";
import XLSX from "xlsx";
import ExcelJS from "exceljs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const norm=v=>String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
const num=v=>{ if(typeof v==="number") return Number.isFinite(v)?v:null; let s=String(v??"").trim(); if(!s)return null; s=s.replace(/R\$\s?/gi,"").replace(/\s/g,""); if(s.includes(","))s=s.replace(/\./g,"").replace(",","."); const n=Number(s); return Number.isFinite(n)?n:null; };
function diagnosticoZip(buffer){
 const sig=(a,b,c,d)=>{for(let i=0;i<=buffer.length-4;i++)if(buffer[i]===a&&buffer[i+1]===b&&buffer[i+2]===c&&buffer[i+3]===d)return i;return -1};
 const rSig=(a,b,c,d)=>{for(let i=buffer.length-4;i>=0;i--)if(buffer[i]===a&&buffer[i+1]===b&&buffer[i+2]===c&&buffer[i+3]===d)return i;return -1};
 return {bytes:buffer.length,pkLocal:sig(0x50,0x4b,0x03,0x04),central:sig(0x50,0x4b,0x01,0x02),eocd:rSig(0x50,0x4b,0x05,0x06),inicio:Array.from(buffer.subarray(0,8)).map(x=>x.toString(16).padStart(2,"0")).join(" ")};
}

async function readWorkbookRobusto(buffer){
 try{return XLSX.read(buffer,{type:"buffer",cellFormula:true,cellDates:true,WTF:false})}
 catch(primary){
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(buffer,{ignoreNodes:["dataValidations","extLst"]});
  const wb={SheetNames:[],Sheets:{}};
  book.eachSheet(ws=>{
   const aoa=[];
   ws.eachRow({includeEmpty:true},(row,rowNumber)=>{
    const arr=[]; row.eachCell({includeEmpty:true},(cell,colNumber)=>{
      let v=cell.value;
      if(v&&typeof v==="object"){
       if("result" in v)v=v.result;
       else if("text" in v)v=v.text;
       else if(Array.isArray(v.richText))v=v.richText.map(x=>x.text||"").join("");
      }
      arr[colNumber-1]=v??null;
    }); aoa[rowNumber-1]=arr;
   });
   wb.SheetNames.push(ws.name);
   wb.Sheets[ws.name]=XLSX.utils.aoa_to_sheet(aoa);
  });
  return wb;
 }
}

const headerIndex=(rows,re)=>{for(let i=0;i<Math.min(rows.length,30);i++)if(rows[i].some(v=>re.test(norm(v))))return i;return -1};
function parseBanco(ws){
 const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
 const hi=headerIndex(rows,/INGREDIENTE/); if(hi<0)return [];
 const h=rows[hi].map(norm), col=re=>h.findIndex(x=>re.test(x));
 const ci=col(/INGREDIENTE/), cu=col(/UNID/), cb=col(/PESO BRUTO/), cl=col(/PESO LIQUIDO/), cf=col(/^FC$/), cp=col(/PRECO COMPRA/), cr=col(/PRECO REAL/), cfor=col(/FORNECEDOR/);
 return rows.slice(hi+1).map((r,k)=>({linha:hi+k+2,nome:String(r[ci]??"").trim(),unidade:String(r[cu]??"").trim(),peso_bruto:num(r[cb]),peso_liquido:num(r[cl]),fc:num(r[cf])??((num(r[cb])&&num(r[cl]))?num(r[cb])/num(r[cl]):null),preco:num(r[cp]),preco_real:num(r[cr]),fornecedor:String(r[cfor]??"").trim()})).filter(x=>x.nome);
}
function parseFicha(ws,nomeAba=""){
 const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
 const findLabel=(re)=>{for(let i=0;i<Math.min(rows.length,40);i++)for(let j=0;j<rows[i].length;j++)if(re.test(norm(rows[i][j]))){for(let k=j+1;k<rows[i].length;k++){const v=rows[i][k];if(v!=null&&String(v).trim())return v}}return null};
 const hi=headerIndex(rows,/^PRODUTO$|INGREDIENTE/), componentes=[];
 if(hi>=0){
  const h=rows[hi].map(norm), col=re=>h.findIndex(x=>re.test(x));
  const ci=col(/^PRODUTO$|INGREDIENTE/), cq=col(/QUANTIDADE.*LIQUIDA|QUANTIDADE|QTD/), cu=col(/^UNIDADE$|^UNID/), cf=col(/^FC$|FATOR.*CORRECAO/), cp=col(/CUSTO.*UNITARIO|PRECO/);
  for(let i=hi+1;i<rows.length;i++){
   const nome=String(rows[i][ci]??"").trim();
   const qtd=cq>=0?num(rows[i][cq]):null, unidade=cu>=0?String(rows[i][cu]??"").trim():"";
   if(!nome){if(i>hi+3&&rows[i].every(v=>v==null||String(v).trim()===""))break;continue}
   if(/TOTAL|CUSTO TOTAL|MODO DE PREPARO|OBSERV/i.test(nome))break;
   if(!qtd&&!unidade)continue;
   componentes.push({nome,qtd,unidade,fc:cf>=0?num(rows[i][cf]):null,preco:cp>=0?num(rows[i][cp]):null,linha:i+1});
  }
 }
 return {nome:String(findLabel(/PRODUTO OU NOME DA PREPARACAO|NOME DO PRATO/)??nomeAba??"").trim(),categoria:String(findLabel(/^REFERENCIA$|^CATEGORIA$/)??"").trim(),rendimento:num(findLabel(/RENDIMENTO EM PORCOES|RENDIMENTO DA RECEITA/)),porcoes:num(findLabel(/QUANTIDADE DE PORCOES|RENDIMENTO EM PORCOES/)),componentes};
}
function analisar(wb,bancoAtual=[]){
 const bancoSheet=wb.SheetNames.find(n=>norm(n).includes("BANCO DE DADOS"));
 const fichaSheets=wb.SheetNames.filter(n=>n!==bancoSheet&&!/^LISTAS?$/i.test(norm(n)));
 const bancoImportado=bancoSheet?parseBanco(wb.Sheets[bancoSheet]):[];
 const fichas=fichaSheets.map(n=>parseFicha(wb.Sheets[n],n)).filter(f=>f.componentes.length);
 const bm=new Map(bancoAtual.map(x=>[norm(x.ingrediente),x]));
 const vistos=new Map(); fichas.forEach(f=>f.componentes.forEach(c=>{const k=norm(c.nome);if(!vistos.has(k))vistos.set(k,{nome:c.nome,unidade:c.unidade,fc:c.fc,preco:c.preco,origens:[]});vistos.get(k).origens.push(f.nome)})); bancoImportado.forEach(x=>{const k=norm(x.nome);if(!vistos.has(k))vistos.set(k,x)}); const insumos=[...vistos.values()];
 const insumosDetalhes=insumos.map(x=>({...x,usos:fichas.reduce((a,f)=>a+f.componentes.filter(c=>norm(c.nome)===norm(x.nome)).length,0),existente:bm.get(norm(x.nome))||null}));
 const nomesFichas=new Map(fichas.map(f=>[norm(f.nome),f.nome]));
 const preparacoes=[];
 fichas.forEach(f=>f.componentes.forEach(c=>{const alvo=nomesFichas.get(norm(c.nome));if(alvo&&norm(alvo)!==norm(f.nome))preparacoes.push({origem:f.nome,componente:c.nome,destino:alvo,qtd:c.qtd,unidade:c.unidade,linha:c.linha})}));
 const conflitos=insumosDetalhes.filter(x=>x.existente&&((x.preco!=null&&Number(x.existente.preco_compra)!==Number(x.preco))||(x.fc!=null&&Math.abs(Number(x.existente.fc)-Number(x.fc))>.0001)||norm(x.existente.unidade)!==norm(x.unidade))).map(x=>({nome:x.nome,precos:[x.existente.preco_compra,x.preco].filter(v=>v!=null).map(Number),fcs:[x.existente.fc,x.fc].filter(v=>v!=null).map(Number),unidades:[x.existente.unidade,x.unidade].filter(Boolean),ocorrencias:[{ficha:"MISEVO atual",preco:Number(x.existente.preco_compra),fc:Number(x.existente.fc),unidade:x.existente.unidade},...((x.origens||["Planilha"]).map(ficha=>({ficha,preco:x.preco,fc:x.fc,unidade:x.unidade})))]}));
 return {fichas,insumos:insumos.map(x=>norm(x.nome)),insumosDetalhes,preparacoes,conflitos,meta:{abas:wb.SheetNames,parser:"server-side-v3-vinculos"}};
}
export function installImportacao(app,pool){
 app.post("/api/importacoes/analisar-base64",async(req,res,next)=>{try{
  const dados=String(req.body?.dados||"");
  if(!dados)return res.status(400).json({error:"Arquivo não recebido."});
  const buffer=Buffer.from(dados,"base64");
  if(!buffer.length||buffer.length>12*1024*1024)return res.status(400).json({error:"Arquivo inválido ou acima do limite."});
  const diag=diagnosticoZip(buffer); console.log("[MISEVO][importacao][zip]",JSON.stringify({nome:req.body?.nome||"",...diag}));
  if(diag.pkLocal<0||diag.eocd<0)return res.status(422).json({error:"O arquivo recebido não contém uma estrutura ZIP/XLSX completa.",codigo:"XLSX_INCOMPLETO",diagnostico:diag});
  const wb=await readWorkbookRobusto(buffer);
  const {rows}=await pool.query("SELECT id, ingrediente, unidade, fc, preco_compra FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE",[req.user.empresa_id,req.user.unidade_id]);
  res.json(analisar(wb,rows));
 }catch(e){next(e)}});
 app.post("/api/importacoes/executar",async(req,res,next)=>{const c=await pool.connect();try{
  const plano=req.body||{}, fichas=Array.isArray(plano.fichas)?plano.fichas:[], decisoes=plano.decisoes||{}, detalhes=Array.isArray(plano.insumosDetalhes)?plano.insumosDetalhes:[], conflitos=Array.isArray(plano.conflitos)?plano.conflitos:[];
  const detalhesEfetivos=detalhes.map(x=>({...x}));
  conflitos.forEach((conf,i)=>{const escolha=decisoes.conflitos?.[i];if(escolha==null)return;const oc=conf.ocorrencias?.[Number(escolha)];if(!oc)return;const d=detalhesEfetivos.find(x=>norm(x.nome)===norm(conf.nome));if(d){d.unidade=oc.unidade||d.unidade;d.fc=oc.fc??d.fc;d.preco=oc.preco??d.preco}});
  if(!plano.confirmado)return res.status(400).json({error:"Confirme o plano antes de importar."});
  if(!fichas.length)return res.status(400).json({error:"Plano sem fichas."});
  const mapa=new Map();
  await c.query("BEGIN");
  const atuais=await c.query("SELECT id,ingrediente FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE",[req.user.empresa_id,req.user.unidade_id]);
  atuais.rows.forEach(x=>mapa.set(norm(x.ingrediente),x.id));
  for(let i=0;i<detalhesEfetivos.length;i++){
   const x=detalhesEfetivos[i], acao=decisoes.insumos?.[i]; if(!acao)throw new Error("Há insumo sem classificação.");
   const k=norm(x.nome), existente=mapa.get(k);
   if(acao==="existente"){if(!existente)throw new Error("Insumo existente não localizado: "+x.nome);continue}
   if(acao==="atualizar"){if(!existente)throw new Error("Insumo para atualização não localizado: "+x.nome);await c.query("UPDATE insumos SET unidade=COALESCE(NULLIF($1,''),unidade),fc=COALESCE($2,fc),preco_compra=COALESCE($3,preco_compra),preco_real=COALESCE($3,preco_compra)*COALESCE($2,fc) WHERE id=$4",[x.unidade||"",x.fc,x.preco,existente]);continue}
   if(acao==="novo"){
    if(existente){mapa.set(k,existente);continue}
    const fc=Number(x.fc)>0?Number(x.fc):1, preco=Number(x.preco)||0;
    const r=await c.query(`INSERT INTO insumos(ingrediente,unidade,peso_bruto,peso_liquido,fc,preco_compra,preco_real,fornecedor,ativo,observacoes,empresa_id,unidade_id) VALUES($1,$2,1,1,$3,$4,$5,'',TRUE,'Importado por planilha',$6,$7) RETURNING id`,[x.nome,(x.unidade||"KG").toUpperCase(),fc,preco,preco*fc,req.user.empresa_id,req.user.unidade_id]);
    mapa.set(k,r.rows[0].id);
   }
  }
  const usados=new Set((plano.preparacoes||[]).map(x=>norm(x.destino||x.nome)));
  const prepIds=new Map();
  for(const f of fichas.filter(x=>usados.has(norm(x.nome)))){
   let r=await c.query("SELECT id FROM preparacoes WHERE empresa_id=$1 AND unidade_id=$2 AND LOWER(nome)=LOWER($3) LIMIT 1",[req.user.empresa_id,req.user.unidade_id,f.nome]);
   let id=r.rows[0]?.id;
   if(!id){r=await c.query("INSERT INTO preparacoes(nome,categoria,rendimento,unidade_rendimento,observacoes,empresa_id,unidade_id) VALUES($1,$2,$3,'KG','Importado por planilha',$4,$5) RETURNING id",[f.nome,f.categoria||"Outros",Number(f.rendimento)||1,req.user.empresa_id,req.user.unidade_id]);id=r.rows[0].id}
   prepIds.set(norm(f.nome),id);
  }
  for(const f of fichas.filter(x=>usados.has(norm(x.nome)))){
   const id=prepIds.get(norm(f.nome)); await c.query("DELETE FROM preparacao_ingredientes WHERE preparacao_id=$1",[id]); await c.query("DELETE FROM preparacao_componentes WHERE preparacao_id=$1",[id]);
   let ordem=0; for(const x of f.componentes){const pid=prepIds.get(norm(x.nome)), iid=mapa.get(norm(x.nome)), q=Number(x.qtd)||0;if(q<=0)continue;if(pid&&pid!==id)await c.query("INSERT INTO preparacao_componentes(preparacao_id,componente_id,quantidade,ordem) VALUES($1,$2,$3,$4)",[id,pid,q,ordem++]);else if(pid===id)continue;else if(iid)await c.query("INSERT INTO preparacao_ingredientes(preparacao_id,insumo_id,quantidade,ordem) VALUES($1,$2,$3,$4)",[id,iid,q,ordem++]);else throw new Error("Componente sem destino: "+x.nome)}
  }
  let fichasCriadas=0;
  for(const f of fichas.filter(x=>!usados.has(norm(x.nome)))){
   const dup=await c.query("SELECT id FROM fichas WHERE empresa_id=$1 AND unidade_id=$2 AND LOWER(nome_prato)=LOWER($3) AND ativo=TRUE LIMIT 1",[req.user.empresa_id,req.user.unidade_id,f.nome]); if(dup.rows[0])throw new Error("Ficha já existe: "+f.nome);
   const rf=await c.query("INSERT INTO fichas(nome_prato,categoria,rendimento_kg,porcoes,preco_venda,meta_cmv,modo_preparo,observacoes,status,ativo,empresa_id,unidade_id) VALUES($1,$2,$3,$4,0,30,'','Importado por planilha','Ativa',TRUE,$5,$6) RETURNING id",[f.nome,f.categoria||"Outros",Number(f.rendimento)||null,Number(f.porcoes)||1,req.user.empresa_id,req.user.unidade_id]); const fid=rf.rows[0].id; let ordem=0;
   for(const x of f.componentes){const pid=prepIds.get(norm(x.nome)),iid=mapa.get(norm(x.nome)),q=Number(x.qtd)||0;if(q<=0)continue;if(pid)await c.query("INSERT INTO ficha_preparacoes(ficha_id,preparacao_id,quantidade,ordem) VALUES($1,$2,$3,$4)",[fid,pid,q,ordem++]);else if(iid)await c.query("INSERT INTO ingredientes(ficha_id,insumo_id,quantidade,unidade,ordem,observacoes) VALUES($1,$2,$3,$4,$5,'')",[fid,iid,q,x.unidade||"KG",ordem++]);else throw new Error("Componente sem destino: "+x.nome)}
   fichasCriadas++;
  }
  await c.query("COMMIT"); res.status(201).json({ok:true,fichasCriadas,preparacoes:prepIds.size,insumos:mapa.size,message:"Importação concluída com sucesso."});
 }catch(e){try{await c.query("ROLLBACK")}catch{};console.error("[MISEVO][importacao][executar]",{message:e.message,code:e.code,detail:e.detail,constraint:e.constraint,table:e.table,column:e.column});res.status(422).json({error:e.message||"Falha na importação.",codigo:e.code||"IMPORTACAO_FALHOU"})}finally{c.release()}});

 app.post("/api/importacoes/analisar",upload.single("arquivo"),async(req,res,next)=>{try{
  if(!req.file)return res.status(400).json({error:"Selecione uma planilha Excel."});
  const wb=await readWorkbookRobusto(req.file.buffer);
  const {rows}=await pool.query("SELECT id, ingrediente, unidade, fc, preco_compra FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE",[req.user.empresa_id,req.user.unidade_id]);
  res.json(analisar(wb,rows));
 }catch(e){next(e)}});
}
