(() => {
const C=()=>document.querySelector("#content");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
let workbook=null, analise=null;

function norm(v){return String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ")}
function numero(v){if(typeof v==="number")return v;let s=String(v??"").trim();if(!s)return null;s=s.replace(/R\$\s?/g,"").replace(/\s/g,"");if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?n:null}
function analisar(wb){
 const fichas=[], nomes=new Set(wb.SheetNames.map(norm)), ocorr=new Map();
 wb.SheetNames.forEach(nomeAba=>{
   const ws=wb.Sheets[nomeAba], rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
   let header=-1;
   for(let i=0;i<Math.min(rows.length,25);i++){const r=rows[i].map(norm);if(r.some(x=>/INGREDIENTE|INSUMO/.test(x))&&r.some(x=>/QUANT|PESO/.test(x))){header=i;break}}
   const componentes=[];
   if(header>=0){
     const h=rows[header].map(norm);
     const ci=h.findIndex(x=>/INGREDIENTE|INSUMO/.test(x));
     const cq=h.findIndex(x=>/QUANT|PESO LIQ|LIQUID/.test(x));
     const cu=h.findIndex(x=>/UNIDADE|^UN$|^UND$/.test(x));
     const cp=h.findIndex(x=>/PRECO|CUSTO UNIT/.test(x));
     const cf=h.findIndex(x=>/^FC$|FATOR/.test(x));
     for(let i=header+1;i<rows.length;i++){
       const ing=ci>=0?String(rows[i][ci]??"").trim():"";
       if(!ing||/TOTAL|CUSTO TOTAL|MODO DE PREPARO/i.test(ing))continue;
       const item={nome:ing,qtd:cq>=0?numero(rows[i][cq]):null,unidade:cu>=0?String(rows[i][cu]??"").trim():"",preco:cp>=0?numero(rows[i][cp]):null,fc:cf>=0?numero(rows[i][cf]):null};
       componentes.push(item);
       const k=norm(ing); if(k){if(!ocorr.has(k))ocorr.set(k,[]);ocorr.get(k).push({...item,ficha:nomeAba})}
     }
   }
   fichas.push({nome:nomeAba,componentes,estrutura:header>=0});
 });
 const preparacoes=[],insumos=new Set(),conflitos=[];
 fichas.forEach(f=>f.componentes.forEach(i=>{const k=norm(i.nome);if(nomes.has(k)&&k!==norm(f.nome))preparacoes.push({ficha:f.nome,nome:i.nome});else insumos.add(k)}));
 ocorr.forEach((arr,k)=>{
   const precos=[...new Set(arr.map(x=>x.preco).filter(x=>x!=null).map(x=>x.toFixed(4)))];
   const fcs=[...new Set(arr.map(x=>x.fc).filter(x=>x!=null).map(x=>x.toFixed(4)))];
   const unidades=[...new Set(arr.map(x=>norm(x.unidade)).filter(Boolean))];
   if(precos.length>1||fcs.length>1||unidades.length>1)conflitos.push({nome:arr[0].nome,precos,fcs,unidades});
 });
 return {fichas,insumos:[...insumos].filter(Boolean),preparacoes,conflitos};
}
function telaInicial(){
 C().innerHTML=`<div class="section-head"><div><small>EXPERIMENTAL</small><h2>Assistente de Importação</h2><p>Leia uma planilha e revise como os dados seriam interpretados antes de qualquer importação.</p></div></div>
 <div class="card import-exp"><div class="import-badge">MODO SEGURO · NÃO GRAVA DADOS</div><h3>1. Selecionar planilha</h3><p>Compatível neste teste com arquivos Excel .xlsx e .xls.</p><label class="import-drop"><input id="importArquivo" type="file" accept=".xlsx,.xls" hidden><b>Selecionar planilha</b><span>Nenhuma informação será enviada ao banco nesta etapa.</span></label><div id="importStatus"></div></div>`;
 document.querySelector("#importArquivo").onchange=ler;
}
async function ler(e){
 const file=e.target.files?.[0];if(!file)return;
 const st=document.querySelector("#importStatus");st.innerHTML="<p>Analisando planilha…</p>";
 try{const data=await file.arrayBuffer();workbook=XLSX.read(data,{type:"array"});analise=analisar(workbook);renderResumo(file.name)}
 catch(err){st.innerHTML='<div class="import-error">Não foi possível ler esta planilha: '+esc(err.message)+'</div>'}
}
function renderResumo(nome){
 const a=analise, prontas=a.fichas.filter(f=>f.estrutura).length;
 C().innerHTML=`<div class="section-head"><div><small>EXPERIMENTAL · SOMENTE LEITURA</small><h2>Assistente de Importação</h2><p>${esc(nome)}</p></div><button class="secondary" id="novaPlanilha">Trocar arquivo</button></div>
 <div class="card"><div class="import-badge">NENHUM DADO SERÁ GRAVADO</div><h3>2. Análise concluída</h3><div class="stats import-stats"><article><span>Abas / fichas</span><b>${a.fichas.length}</b></article><article><span>Estruturas reconhecidas</span><b>${prontas}</b></article><article><span>Possíveis insumos</span><b>${a.insumos.length}</b></article><article><span>Vínculos de preparações</span><b>${a.preparacoes.length}</b></article><article><span>Conflitos</span><b>${a.conflitos.length}</b></article></div></div>
 <div class="card"><h3>3. Fichas reconhecidas</h3><div class="import-list">${a.fichas.map(f=>`<article><div><b>${esc(f.nome)}</b><small>${f.componentes.length} componentes</small></div><span class="${f.estrutura?"ok":"warn"}">${f.estrutura?"Reconhecida":"Revisar"}</span></article>`).join("")}</div></div>
 <div class="card"><h3>4. Correspondências de preparações</h3>${a.preparacoes.length?'<div class="import-list">'+a.preparacoes.slice(0,30).map(x=>`<article><div><b>${esc(x.nome)}</b><small>usada em ${esc(x.ficha)}</small></div><span class="ok">Possível vínculo</span></article>`).join("")+'</div>':'<div class="empty">Nenhuma correspondência encontrada.</div>'}</div>
 <div class="card"><h3>5. Conflitos para revisão</h3>${a.conflitos.length?'<div class="import-list">'+a.conflitos.map(x=>`<article><div><b>${esc(x.nome)}</b><small>${x.precos.length>1?"Preços diferentes · ":""}${x.fcs.length>1?"FCs diferentes · ":""}${x.unidades.length>1?"Unidades diferentes":""}</small></div><span class="warn">Revisar</span></article>`).join("")+'</div>':'<div class="empty">Nenhum conflito detectado.</div>'}</div>
 <div class="card import-final"><h3>6. Simulação concluída</h3><p>O assistente chegou até a revisão final. A gravação no banco está bloqueada neste modo experimental.</p><button disabled>Importar para o MISEVO — bloqueado no teste</button></div>`;
 document.querySelector("#novaPlanilha").onclick=telaInicial;
}
window.telaImportacaoExperimental=telaInicial;
})();