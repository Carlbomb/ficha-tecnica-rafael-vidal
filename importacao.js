import multer from "multer";
import XLSX from "xlsx";
import ExcelJS from "exceljs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const norm=v=>String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
const num=v=>{ if(typeof v==="number") return Number.isFinite(v)?v:null; let s=String(v??"").trim(); if(!s)return null; s=s.replace(/R\$\s?/gi,"").replace(/\s/g,""); if(s.includes(","))s=s.replace(/\./g,"").replace(",","."); const n=Number(s); return Number.isFinite(n)?n:null; };
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
function parseFicha(ws){
 const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
 const flat=(label)=>{for(let i=0;i<rows.length;i++)for(let j=0;j<rows[i].length;j++)if(norm(rows[i][j])===label){for(let k=j+1;k<rows[i].length;k++)if(rows[i][k]!=null&&String(rows[i][k]).trim())return rows[i][k];}return null};
 const hi=headerIndex(rows,/INGREDIENTE/); const componentes=[];
 if(hi>=0){const h=rows[hi].map(norm), col=re=>h.findIndex(x=>re.test(x));const ci=col(/INGREDIENTE/),cq=col(/QUANTIDADE|QTD/),cu=col(/UNID/),cf=col(/^FC$|FATOR/),cp=col(/CUSTO UNIT|PRECO/);
  for(let i=hi+1;i<rows.length;i++){const nome=String(rows[i][ci]??"").trim();if(!nome||/TOTAL|MODO DE PREPARO/i.test(nome))continue;componentes.push({nome,qtd:num(rows[i][cq]),unidade:String(rows[i][cu]??"").trim(),fc:num(rows[i][cf]),preco:num(rows[i][cp]),linha:i+1});}}
 return {nome:String(flat("NOME DO PRATO")??"FICHA TÉCNICA").trim(),categoria:String(flat("CATEGORIA")??"").trim(),rendimento:num(flat("RENDIMENTO DA RECEITA")),porcoes:num(flat("QUANTIDADE DE PORCOES")),componentes};
}
function analisar(wb,bancoAtual=[]){
 const bancoSheet=wb.SheetNames.find(n=>norm(n).includes("BANCO DE DADOS"));
 const fichaSheets=wb.SheetNames.filter(n=>/FICHA/i.test(norm(n)));
 const insumos=bancoSheet?parseBanco(wb.Sheets[bancoSheet]):[];
 const fichas=fichaSheets.map(n=>parseFicha(wb.Sheets[n])).filter(f=>f.componentes.length||f.nome!=="FICHA TÉCNICA");
 const bm=new Map(bancoAtual.map(x=>[norm(x.ingrediente),x]));
 const insumosDetalhes=insumos.map(x=>({...x,usos:fichas.reduce((a,f)=>a+f.componentes.filter(c=>norm(c.nome)===norm(x.nome)).length,0),existente:bm.get(norm(x.nome))||null}));
 const conflitos=insumosDetalhes.filter(x=>x.existente&&((x.preco!=null&&Number(x.existente.preco_compra)!==Number(x.preco))||(x.fc!=null&&Math.abs(Number(x.existente.fc)-Number(x.fc))>.0001)||norm(x.existente.unidade)!==norm(x.unidade))).map(x=>({nome:x.nome,precos:[x.existente.preco_compra,x.preco].filter(v=>v!=null).map(Number),fcs:[x.existente.fc,x.fc].filter(v=>v!=null).map(Number),unidades:[x.existente.unidade,x.unidade].filter(Boolean),ocorrencias:[{ficha:"MISEVO atual",preco:Number(x.existente.preco_compra),fc:Number(x.existente.fc),unidade:x.existente.unidade},{ficha:"BANCO DE DADOS da planilha",preco:x.preco,fc:x.fc,unidade:x.unidade}]}));
 return {fichas,insumos:insumos.map(x=>norm(x.nome)),insumosDetalhes,preparacoes:[],conflitos,meta:{abas:wb.SheetNames,parser:"server-side-v1"}};
}
export function installImportacao(app,pool){
 app.post("/api/importacoes/analisar-base64",async(req,res,next)=>{try{
  const dados=String(req.body?.dados||"");
  if(!dados)return res.status(400).json({error:"Arquivo não recebido."});
  const buffer=Buffer.from(dados,"base64");
  if(!buffer.length||buffer.length>12*1024*1024)return res.status(400).json({error:"Arquivo inválido ou acima do limite."});
  const wb=await readWorkbookRobusto(buffer);
  const {rows}=await pool.query("SELECT id, ingrediente, unidade, fc, preco_compra FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE",[req.user.empresa_id,req.user.unidade_id]);
  res.json(analisar(wb,rows));
 }catch(e){next(e)}});
 app.post("/api/importacoes/analisar",upload.single("arquivo"),async(req,res,next)=>{try{
  if(!req.file)return res.status(400).json({error:"Selecione uma planilha Excel."});
  const wb=await readWorkbookRobusto(req.file.buffer);
  const {rows}=await pool.query("SELECT id, ingrediente, unidade, fc, preco_compra FROM insumos WHERE empresa_id=$1 AND unidade_id=$2 AND ativo=TRUE",[req.user.empresa_id,req.user.unidade_id]);
  res.json(analisar(wb,rows));
 }catch(e){next(e)}});
}
