(() => {
const C=()=>document.querySelector("#content");
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
let workbook=null, analise=null, insumosBanco=[], arquivoAtual=""; const decisoes={conflitos:{},insumos:{}};

function norm(v){return String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ")}
function numero(v){if(typeof v==="number")return v;let s=String(v??"").trim();if(!s)return null;s=s.replace(/R\$\s?/g,"").replace(/\s/g,"");if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?n:null}
function bancoMap(){const m=new Map();(insumosBanco||[]).forEach(x=>m.set(norm(x.ingrediente||x.nome),x));return m}
function analisar(wb){
 const fichas=[], nomes=new Set(wb.SheetNames.map(norm)), ocorr=new Map();
 wb.SheetNames.forEach(nomeAba=>{
   const ws=wb.Sheets[nomeAba], rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
   let header=-1, ci=-1, cq=-1, cu=-1, cp=-1, cf=-1;
   const maxCols=Math.max(0,...rows.slice(0,25).map(r=>r.length));
   const textoScore=(col,inicio=0)=>rows.slice(inicio,Math.min(rows.length,inicio+40)).reduce((s,r)=>{const v=String(r[col]??"").trim();return s+(v&&/[A-Za-zÀ-ÿ]/.test(v)&&numero(v)===null?1:0)},0);
   for(let i=0;i<Math.min(rows.length,25);i++){
     const combinado=Array.from({length:maxCols},(_,col)=>norm([rows[i]?.[col],rows[i+1]?.[col]].filter(Boolean).join(" ")));
     const achar=re=>combinado.map((x,col)=>re.test(x)?col:-1).filter(col=>col>=0);
     const nomes=achar(/(^| )PRODUTO($| )|INGREDIENTE|INSUMO/).sort((a,b)=>textoScore(b,i+1)-textoScore(a,i+1));
     const qtds=achar(/QUANTIDADE.*LIQ|QUANT|PESO.*LIQ|LIQUID/);
     const uns=achar(/UNIDADE|(^| )UN(D)?($| )/);
     if(nomes.length&&qtds.length){
       header=i;ci=nomes[0];cq=qtds.find(x=>x!==ci)??-1;cu=uns.find(x=>x!==ci)??-1;
       cp=achar(/CUSTO.*UNIT|PRECO.*UNIT|PRECO/).find(x=>x!==ci)??-1;
       cf=achar(/FATOR.*CORRE|(^| )FC($| )/).find(x=>x!==ci)??-1;
       break;
     }
   }
   // Fallback estrutural: nas fichas Rafael Vidal, o nome é a coluna textual mais consistente;
   // quantidade/unidade são inferidas pelas colunas vizinhas, sem confundir valores monetários com nomes.
   if(ci<0){
     const scores=Array.from({length:maxCols},(_,col)=>({col,score:textoScore(col,0)})).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score);
     ci=scores[0]?.col??-1;
     if(ci>=0){
       header=0;
       const numeric=Array.from({length:maxCols},(_,col)=>({col,n:rows.slice(0,40).filter(r=>numero(r[col])!==null).length})).filter(x=>x.col!==ci&&x.n>0).sort((a,b)=>a.col-b.col);
       cq=numeric.find(x=>x.col>ci)?.col??numeric[0]?.col??-1;
       cu=Array.from({length:maxCols},(_,col)=>col).find(col=>col!==ci&&rows.slice(0,40).some(r=>/^(KG|G|L|LT|ML|UN|UND|UNIDADE)$/i.test(String(r[col]??"").trim())))??-1;
     }
   }
   const componentes=[];
   if(ci>=0){
     for(let i=Math.max(0,header+1);i<rows.length;i++){
       const ing=ci>=0?String(rows[i][ci]??"").trim():"";
       if(!ing||/TOTAL|CUSTO TOTAL|MODO DE PREPARO/i.test(ing))continue;
       if(numero(ing)!==null||/^R\$\s*[-\d.,]*$/i.test(ing))continue;
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
   if(precos.length>1||fcs.length>1||unidades.length>1)conflitos.push({nome:arr[0].nome,precos,fcs,unidades,ocorrencias:arr.map(o=>({ficha:o.ficha,preco:o.preco,fc:o.fc,unidade:o.unidade,qtd:o.qtd}))});
 });
 const bm=bancoMap(); const insumosDetalhes=[...insumos].filter(Boolean).map(k=>{const arr=ocorr.get(k)||[];const x=arr[0]||{};return {nome:x.nome||k,unidade:x.unidade||"",preco:x.preco,fc:x.fc,usos:arr.length,existente:bm.get(k)||null}});
 return {fichas,insumos:[...insumos].filter(Boolean),insumosDetalhes,preparacoes,conflitos};
}
function telaInicial(){
 C().innerHTML=`<div class="section-head"><div><small>EXPERIMENTAL</small><h2>Assistente de Importação</h2><p>Leia uma planilha e revise como os dados seriam interpretados antes de qualquer importação.</p></div></div>
 <div class="card import-exp"><div class="import-badge">MODO SEGURO · NÃO GRAVA DADOS</div><h3>1. Selecionar planilha</h3><p>Compatível neste teste com arquivos Excel .xlsx e .xls.</p><label class="import-drop"><input id="importArquivo" type="file" accept=".xlsx,.xls" hidden><b>Selecionar planilha</b><span>Nenhuma informação será enviada ao banco nesta etapa.</span></label><div id="importStatus"></div></div>`;
 document.querySelector("#importArquivo").onchange=ler;
}
async function ler(e){
 const file=e.target.files?.[0];if(!file)return; arquivoAtual=file.name; decisoes.conflitos={}; decisoes.insumos={};
 const st=document.querySelector("#importStatus");st.innerHTML="<p>Enviando e analisando a planilha no servidor…</p>";
 try{
   const form=new FormData();form.append("arquivo",file);
   const resp=await fetch("/api/importacoes/analisar",{method:"POST",body:form,credentials:"same-origin"});
   const data=await resp.json().catch(()=>({}));
   if(!resp.ok)throw new Error(data.error||"Falha ao analisar a planilha.");
   analise=data; renderResumo(file.name);
 }catch(err){st.innerHTML='<div class="import-error">Não foi possível ler esta planilha: '+esc(err.message)+'</div>'}
}
function renderResumo(nome){
 const a=analise, prontas=a.fichas.filter(f=>f.estrutura).length;
 C().innerHTML=`<div class="section-head"><div><small>EXPERIMENTAL · SOMENTE LEITURA</small><h2>Assistente de Importação</h2><p>${esc(nome)}</p></div><button class="secondary" id="novaPlanilha">Trocar arquivo</button></div>
 <div class="card"><div class="import-badge">NENHUM DADO SERÁ GRAVADO</div><h3>2. Análise concluída</h3><div class="stats import-stats"><article><span>Abas / fichas</span><b>${a.fichas.length}</b></article><article><span>Estruturas reconhecidas</span><b>${prontas}</b></article><article><span>Possíveis insumos</span><b>${a.insumos.length}</b></article><article><span>Vínculos de preparações</span><b>${a.preparacoes.length}</b></article><article><span>Conflitos</span><b>${a.conflitos.length}</b></article></div></div>
 <div class="card"><h3>3. Fichas reconhecidas</h3><div class="import-list">${a.fichas.map((f,i)=>`<article><div><b>${esc(f.nome)}</b><small>${f.componentes.length} componentes</small></div><button type="button" class="import-review ${f.estrutura?"ok":"warn"}" data-ficha="${i}">${f.estrutura?"Ver ficha":"Revisar"}</button></article>`).join("")}</div></div>
 <div class="card"><h3>4. Insumos reconhecidos</h3><p>Comparação da planilha com o banco atual do MISEVO. Cada item é exibido pelo nome do insumo encontrado.</p><div class="import-list">${a.insumosDetalhes.map((x,i)=>`<article><div><b class="import-insumo-name">${esc(x.nome||"Insumo sem nome")}</b><small>${esc(x.unidade||"—")} · FC ${x.fc??"—"} · ${x.preco!=null?"R$ "+Number(x.preco).toFixed(2).replace(".",","):"sem preço"} · ${x.usos} ocorrência(s)</small></div><button type="button" class="import-review ${x.existente?"ok":"warn"}" data-insumo="${i}">${x.existente?"Já existe":"Novo insumo"}</button></article>`).join("")||'<div class="empty">Nenhum insumo encontrado.</div>'}</div></div>
 <div class="card"><h3>5. Correspondências de preparações</h3>${a.preparacoes.length?'<div class="import-list">'+a.preparacoes.slice(0,30).map(x=>`<article><div><b>${esc(x.nome)}</b><small>usada em ${esc(x.ficha)}</small></div><span class="ok">Possível vínculo</span></article>`).join("")+'</div>':'<div class="empty">Nenhuma correspondência encontrada.</div>'}</div>
 <div class="card"><h3>6. Conflitos para revisão</h3>${a.conflitos.length?'<div class="import-list">'+a.conflitos.map(x=>`<article><div><b>${esc(x.nome)}</b><small>${x.precos.length>1?"Preços diferentes · ":""}${x.fcs.length>1?"FCs diferentes · ":""}${x.unidades.length>1?"Unidades diferentes":""}</small><small class="import-origin">${[...new Set((x.ocorrencias||[]).map(o=>o.ficha))].slice(0,3).map(esc).join(" · ")}${new Set((x.ocorrencias||[]).map(o=>o.ficha)).size>3?" + mais":""}</small></div><button type="button" class="warn import-review" data-conflito="${a.conflitos.indexOf(x)}">Revisar</button></article>`).join("")+'</div>':'<div class="empty">Nenhum conflito detectado.</div>'}</div>
 <div class="card import-final"><h3>7. Revisão final</h3><div id="importResumoFinal"></div><p>A gravação no banco continua bloqueada neste modo experimental. As decisões abaixo servem apenas para validar o fluxo.</p><button disabled>Importar para o MISEVO — bloqueado no teste</button></div>`;
 document.querySelector("#novaPlanilha").onclick=telaInicial;
 document.querySelectorAll("[data-conflito]").forEach(b=>b.onclick=()=>abrirConflito(Number(b.dataset.conflito)));
 document.querySelectorAll("[data-insumo]").forEach(b=>b.onclick=()=>abrirInsumo(Number(b.dataset.insumo)));
 document.querySelectorAll("[data-ficha]").forEach(b=>b.onclick=()=>abrirFicha(Number(b.dataset.ficha)));
 atualizarResumoFinal();
}
function modal(html){let d=document.querySelector("#importModal");if(!d){d=document.createElement("div");d.id="importModal";d.className="import-modal-backdrop";document.body.appendChild(d)}d.innerHTML='<div class="import-modal">'+html+'<button type="button" class="secondary import-close">Fechar</button></div>';d.querySelector(".import-close").onclick=()=>d.remove();return d}
function moeda(v){return v==null?"—":"R$ "+Number(v).toFixed(2).replace(".",",")}
function atualizarResumoFinal(){const el=document.querySelector("#importResumoFinal");if(!el||!analise)return;const resolvidos=Object.keys(decisoes.conflitos).length, classificados=Object.keys(decisoes.insumos).length;el.innerHTML=`<div class="import-summary-grid"><span><b>${analise.fichas.length}</b> fichas analisadas</span><span><b>${analise.insumosDetalhes.length}</b> insumos reconhecidos</span><span><b>${resolvidos}/${analise.conflitos.length}</b> conflitos revisados</span><span><b>${classificados}/${analise.insumosDetalhes.length}</b> insumos classificados</span></div>`}
function abrirFicha(i){const f=analise.fichas[i];if(!f)return;modal(`<small>PRÉVIA DA FICHA</small><h3>${esc(f.nome)}</h3><p><b>${f.componentes.length}</b> componentes reconhecidos.</p><div class="import-conflict-sources">${f.componentes.map(x=>`<div><b>${esc(x.nome)}</b><span>${x.qtd!=null?Number(x.qtd).toLocaleString("pt-BR",{maximumFractionDigits:4}):"—"} ${esc(x.unidade||"")} · FC ${x.fc??"—"} · ${moeda(x.preco)}</span></div>`).join("")||'<div>Nenhum componente reconhecido.</div>'}</div><div class="import-note">Prévia somente leitura. É assim que os componentes desta ficha foram interpretados.</div>`)}
function abrirConflito(i){const x=analise.conflitos[i];if(!x)return;const d=modal(`<small>REVISÃO EXPERIMENTAL</small><h3>${esc(x.nome)}</h3><p>Escolha qual ocorrência deve servir como referência nesta simulação:</p><div class="import-choice-list">${(x.ocorrencias||[]).map((o,j)=>`<label><input type="radio" name="confEscolha" value="${j}" ${decisoes.conflitos[i]?.indice===j?"checked":""}><span><b>${esc(o.ficha)}</b><small>${moeda(o.preco)} · FC ${o.fc??"—"} · ${esc(o.unidade||"—")}</small></span></label>`).join("")}</div><label class="import-check"><input type="checkbox" id="confAplicar" ${decisoes.conflitos[i]?.aplicar?"checked":""}> Aplicar esta referência a todas as ocorrências deste insumo</label><button type="button" class="primary import-save-choice">Confirmar escolha</button><div class="import-note">A escolha fica somente nesta simulação e não altera a planilha nem o banco.</div>`);d.querySelector(".import-save-choice").onclick=()=>{const sel=d.querySelector('input[name="confEscolha"]:checked');if(!sel)return;decisoes.conflitos[i]={indice:Number(sel.value),aplicar:d.querySelector("#confAplicar").checked};d.remove();atualizarResumoFinal()}}
function abrirInsumo(i){const x=analise.insumosDetalhes[i];if(!x)return;const b=x.existente, atual=decisoes.insumos[i]||"";const d=modal(`<small>INSUMO RECONHECIDO</small><h3>${esc(x.nome)}</h3><p><b>Planilha:</b> ${esc(x.unidade||"—")} · FC ${x.fc??"—"} · ${moeda(x.preco)}</p>${b?'<p><b>MISEVO:</b> '+esc(b.ingrediente||b.nome||x.nome)+' · '+esc(b.unidade||"—")+' · FC '+esc(b.fc??"—")+' · '+moeda(b.preco_compra)+'</p>':""}<div class="import-choice-list"><label><input type="radio" name="insEscolha" value="novo" ${atual==="novo"?"checked":""}><span><b>Cadastrar como novo insumo</b><small>Usar os dados reconhecidos na planilha.</small></span></label>${b?`<label><input type="radio" name="insEscolha" value="existente" ${atual==="existente"?"checked":""}><span><b>Vincular ao insumo existente</b><small>Evita duplicidade no banco.</small></span></label><label><input type="radio" name="insEscolha" value="atualizar" ${atual==="atualizar"?"checked":""}><span><b>Atualizar na importação</b><small>Simulação de atualização do cadastro existente.</small></span></label>`:""}</div><button type="button" class="primary import-save-insumo">Confirmar classificação</button><div class="import-note">Nenhuma dessas opções grava dados enquanto o modo experimental estiver ativo.</div>`);d.querySelector(".import-save-insumo").onclick=()=>{const sel=d.querySelector('input[name="insEscolha"]:checked');if(!sel)return;decisoes.insumos[i]=sel.value;d.remove();atualizarResumoFinal()}}
window.telaImportacaoExperimental=telaInicial;
})();