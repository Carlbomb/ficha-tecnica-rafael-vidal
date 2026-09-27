/* MISEVO — Produção do Dia / Ordens de Produção — Fase 1 */
(()=>{const C=document.querySelector("#content"),esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const num=v=>{let s=String(v??"").trim().replace(",",".");const x=Number(s);return Number.isFinite(x)?x:0};
const fmt=(v,d=3)=>num(v).toLocaleString("pt-BR",{maximumFractionDigits:d}),money=v=>num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function apiP(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}}),d=r.status===204?null:await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Erro na produção.");return d}
const status=s=>s==="concluida"||s==="finalizada"?"Concluída":s==="em_producao"?"Em produção":s==="cancelada"?"Cancelada":s==="anulada"?"Excluída":"Pendente";

window.telaProducao=async()=>{C.innerHTML='<div class="card">Carregando produção...</div>';try{
 const [ordens,preps,fichas]=await Promise.all([apiP("/api/producao/ordens"),apiP("/api/preparacoes"),apiP("/api/fichas")]);window.__ORDENS_PRODUCAO=ordens;window.__PREPS_PRODUCAO=preps;window.__FICHAS_PRODUCAO=fichas;
 const visiveis=ordens.filter(x=>!["anulada","cancelada"].includes(x.status));
 C.innerHTML=`<div class="section-head"><div><small>OPERAÇÃO DA COZINHA</small><h2>Produção do Dia</h2><p>Lista diária de tarefas e preparações para orientar a equipe.</p></div><div class="actions"><button class="secondary" id="planejarFichas">Planejar produção</button><button class="primary" id="novaOP">+ Adicionar tarefa</button></div></div>
 <div class="stats"><article><span>Pendentes</span><b>${visiveis.filter(x=>x.status==="planejada").length}</b></article><article><span>Em produção</span><b>${visiveis.filter(x=>x.status==="em_producao").length}</b></article><article><span>Concluídas</span><b>${visiveis.filter(x=>["concluida","finalizada"].includes(x.status)).length}</b></article></div>
 <div class="card">${!visiveis.length?'<div class="empty">Nenhuma tarefa de produção para hoje.</div>':`<div class="table-wrap"><table><thead><tr><th>Preparação</th><th>Quantidade</th><th>Observações</th><th>Status</th><th>Ações</th></tr></thead><tbody>${visiveis.map(o=>`<tr><td><b>${esc(o.preparacao_nome)}</b></td><td>${fmt(o.quantidade_planejada)} ${esc(o.unidade)}</td><td>${esc(o.observacoes||"—")}</td><td><span class="stock-status ${["concluida","finalizada"].includes(o.status)?"normal":"baixo"}">${status(o.status)}</span></td><td>${o.status==="planejada"?`<button class="secondary" onclick="statusOP(${o.id},'em_producao')">Iniciar</button> `:""}${o.status==="em_producao"||o.status==="planejada"?`<button class="primary" onclick="statusOP(${o.id},'concluida')">Concluir</button> `:""}<button class="secondary" onclick="excluirOP(${o.id})">Excluir</button></td></tr>`).join("")}</tbody></table></div>`}</div>`;
 document.querySelector("#novaOP").onclick=novaOP;document.querySelector("#planejarFichas").onclick=planejarFichas;
}catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}};


let PLANO_FICHAS=[],PLANO_PREPS=[];
function planejarFichas(){
 const fichas=window.__FICHAS_PRODUCAO||[],preps=window.__PREPS_PRODUCAO||[];PLANO_FICHAS=[];PLANO_PREPS=[];
 const opcoes=[...fichas.map(x=>({tipo:"ficha",id:Number(x.id),nome:x.nome_prato,unidade:"PORÇÕES"})),...preps.map(x=>({tipo:"preparacao",id:Number(x.id),nome:x.nome,unidade:x.unidade_rendimento||""}))].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
 window.__ITENS_PLANO=opcoes;
 C.innerHTML=`<div class="section-head"><div><small>ORDEM DE PRODUÇÃO</small><h2>Planejar produção</h2><p>Adicione pratos e preparações na mesma lista. O MISEVO calcula e consolida todas as necessidades.</p></div><button class="secondary" id="voltarPlano">← Voltar</button></div>
 <div class="card"><div class="form-grid"><label>Item de produção<select id="planoItem"><option value="">Selecione...</option>${opcoes.map(x=>`<option value="${x.tipo}:${x.id}">${x.tipo==="ficha"?"Ficha Técnica":"Preparação"} — ${esc(x.nome)}</option>`).join("")}</select></label><label id="planoQtdLabel">Quantidade<input id="planoQtd" inputmode="decimal" placeholder="0,000"></label></div><div class="actions"><button class="primary" id="addPlanoItem">+ Adicionar item</button></div><div id="planoUnicoLista"></div></div>
 <div class="actions"><button class="primary" id="calcularPlano">Calcular necessidades</button></div>`;
 const sel=document.querySelector("#planoItem"),lab=document.querySelector("#planoQtdLabel");
 const atualizarRotulo=()=>{const [tipo,id]=String(sel.value||":").split(":"),x=opcoes.find(z=>z.tipo===tipo&&z.id===Number(id));lab.firstChild.textContent=!x?"Quantidade":x.tipo==="ficha"?"Porções":`Quantidade (${x.unidade})`};
 sel.onchange=atualizarRotulo;document.querySelector("#voltarPlano").onclick=telaProducao;
 document.querySelector("#addPlanoItem").onclick=()=>{const [tipo,idS]=String(sel.value||":").split(":"),id=Number(idS),q=num(document.querySelector("#planoQtd").value),x=opcoes.find(z=>z.tipo===tipo&&z.id===id);if(!x||q<=0)return;if(tipo==="ficha")PLANO_FICHAS.push({ficha_id:id,porcoes:q,nome:x.nome});else PLANO_PREPS.push({preparacao_id:id,quantidade:q,nome:x.nome,unidade:x.unidade});renderPlano();document.querySelector("#planoQtd").value=""};
 document.querySelector("#calcularPlano").onclick=calcularPlano;renderPlano();
}
function renderPlano(){
 const a=document.querySelector("#planoUnicoLista");if(!a)return;
 const itens=[...PLANO_FICHAS.map((x,i)=>({tipo:"ficha",idx:i,nome:x.nome,q:x.porcoes,unidade:"porções"})),...PLANO_PREPS.map((x,i)=>({tipo:"preparacao",idx:i,nome:x.nome,q:x.quantidade,unidade:x.unidade||""}))];
 a.innerHTML=!itens.length?'<div class="empty">Nenhum item adicionado.</div>':`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Quantidade</th><th></th></tr></thead><tbody>${itens.map(x=>`<tr><td><small>${x.tipo==="ficha"?"FICHA TÉCNICA":"PREPARAÇÃO"}</small><br><b>${esc(x.nome)}</b></td><td>${fmt(x.q)} ${esc(x.unidade)}</td><td><button class="secondary" onclick="removerPlanoItem('${x.tipo}',${x.idx})">×</button></td></tr>`).join("")}</tbody></table></div>`;
}
window.removerPlanoItem=(tipo,i)=>{if(tipo==="ficha")PLANO_FICHAS.splice(i,1);else PLANO_PREPS.splice(i,1);renderPlano()};
async function calcularPlano(){if(!PLANO_FICHAS.length&&!PLANO_PREPS.length)return;try{const d=await apiP("/api/producao/planejar-fichas",{method:"POST",body:JSON.stringify({fichas:PLANO_FICHAS,preparacoes:PLANO_PREPS})});renderResultadoPlano(d)}catch(e){C.insertAdjacentHTML("afterbegin",`<div class="card"><b>Erro:</b> ${esc(e.message)}</div>`)}}
function renderResultadoPlano(d){
 window.__ULTIMO_PLANO=d;
 const pratos=d.pratos.length?`<div class="card"><h3>Pratos a produzir</h3>${d.pratos.map(x=>`<div class="prep-uso-item"><span>${esc(x.nome)}</span><b>${fmt(x.porcoes)} porções</b></div>`).join("")}</div>`:"";
 C.innerHTML=`<div class="section-head"><div><small>ORDEM DE PRODUÇÃO</small><h2>Necessidades consolidadas</h2><p>Planejamento calculado. Nenhuma movimentação de estoque foi realizada.</p></div><button class="secondary" id="editarPlano">← Editar</button></div>
 ${pratos}
 <div class="card"><h3>Preparações necessárias</h3>${d.preparacoes.length?d.preparacoes.map(x=>`<div class="prep-uso-item"><span>${esc(x.nome)}</span><b>${fmt(x.quantidade)} ${esc(x.unidade)}</b></div>`).join(""):'<div class="empty">Nenhuma preparação vinculada.</div>'}</div>
 <div class="card"><h3>Insumos consolidados</h3>${d.insumos.length?d.insumos.map(x=>`<div class="prep-uso-item"><span>${esc(x.ingrediente)}</span><b>${fmt(x.quantidade)} ${esc(x.unidade)}</b></div>`).join(""):'<div class="empty">Nenhum insumo encontrado.</div>'}</div>
 <div class="actions"><button class="primary" id="salvarPlano">Salvar Ordem de Produção</button></div>`;
 document.querySelector("#editarPlano").onclick=planejarFichas;
 document.querySelector("#salvarPlano").onclick=salvarPlano;
}
async function salvarPlano(){
 const b=document.querySelector("#salvarPlano");if(b){b.disabled=true;b.textContent="Salvando..."}
 try{
   const itens=PLANO_PREPS.map(x=>({tipo:"preparacao",preparacao_id:x.preparacao_id,quantidade:x.quantidade}));
   if(!itens.length)throw new Error("Nesta etapa, salve ao menos uma Preparação/Sub-receita.");
   await apiP("/api/producao/salvar-planejamento",{method:"POST",body:JSON.stringify({itens})});
   await telaProducao();
 }catch(e){if(b){b.disabled=false;b.textContent="Salvar Ordem de Produção"}C.insertAdjacentHTML("afterbegin",`<div class="card"><b>Erro:</b> ${esc(e.message)}</div>`)}
}

function novaOP(){const preps=window.__PREPS_PRODUCAO||[];C.innerHTML=`<div class="section-head"><div><small>PRODUÇÃO DO DIA</small><h2>Adicionar tarefa</h2><p>Registre o que a equipe precisa produzir. Esta tarefa não movimenta o estoque.</p></div><button class="secondary" id="voltarOP">← Voltar</button></div>
<form class="card" id="formOP"><div class="form-grid"><label>Preparação<select id="opPrep" required><option value="">Selecione...</option>${preps.map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label><label>Quantidade<input id="opQtd" inputmode="decimal" required placeholder="0,000"></label></div><label>Observações<textarea id="opObs" placeholder="Ex.: deixar pronto antes do almoço"></textarea></label><div class="actions"><button type="button" class="secondary" id="cancelOP">Cancelar</button><button class="primary">Adicionar à produção do dia</button></div></form>`;
 document.querySelector("#voltarOP").onclick=telaProducao;document.querySelector("#cancelOP").onclick=telaProducao;
 document.querySelector("#formOP").onsubmit=async e=>{e.preventDefault();try{await apiP("/api/producao/planejar",{method:"POST",body:JSON.stringify({preparacao_id:Number(document.querySelector("#opPrep").value),quantidade:num(document.querySelector("#opQtd").value),observacoes:document.querySelector("#opObs").value})});await telaProducao()}catch(z){alert(z.message)}}}

window.statusOP=async(id,status)=>{try{await apiP(`/api/producao/ordens/${id}/status`,{method:"POST",body:JSON.stringify({status})});await telaProducao()}catch(e){alert(e.message)}};
window.excluirOP=async id=>{if(!confirm("Excluir esta tarefa da Produção do Dia?"))return;try{await apiP(`/api/producao/ordens/${id}/anular`,{method:"POST",body:"{}"});await telaProducao()}catch(e){alert(e.message)}};

document.addEventListener("click",e=>{const b=e.target.closest('[data-tab="producao"]');if(b)setTimeout(telaProducao,0)});
})();