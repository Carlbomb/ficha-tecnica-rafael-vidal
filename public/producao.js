/* MISEVO — Produção do Dia / Ordens de Produção — Fase 1 */
(()=>{const C=document.querySelector("#content"),esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const num=v=>{let s=String(v??"").trim().replace(",",".");const x=Number(s);return Number.isFinite(x)?x:0};
const fmt=(v,d=3)=>num(v).toLocaleString("pt-BR",{maximumFractionDigits:d}),money=v=>num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function apiP(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}}),d=r.status===204?null:await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Erro na produção.");return d}
const status=s=>s==="concluida"||s==="finalizada"?"Concluída":s==="em_producao"?"Em produção":s==="cancelada"?"Cancelada":s==="anulada"?"Excluída":"Pendente";

window.telaProducao=async()=>{C.innerHTML='<div class="card">Carregando produção...</div>';try{
 const [ordens,preps]=await Promise.all([apiP("/api/producao/ordens"),apiP("/api/preparacoes")]);window.__ORDENS_PRODUCAO=ordens;window.__PREPS_PRODUCAO=preps;
 const visiveis=ordens.filter(x=>!["anulada","cancelada"].includes(x.status));
 C.innerHTML=`<div class="section-head"><div><small>OPERAÇÃO DA COZINHA</small><h2>Produção do Dia</h2><p>Lista diária de tarefas e preparações para orientar a equipe.</p></div><button class="primary" id="novaOP">+ Adicionar tarefa</button></div>
 <div class="stats"><article><span>Pendentes</span><b>${visiveis.filter(x=>x.status==="planejada").length}</b></article><article><span>Em produção</span><b>${visiveis.filter(x=>x.status==="em_producao").length}</b></article><article><span>Concluídas</span><b>${visiveis.filter(x=>["concluida","finalizada"].includes(x.status)).length}</b></article></div>
 <div class="card">${!visiveis.length?'<div class="empty">Nenhuma tarefa de produção para hoje.</div>':`<div class="table-wrap"><table><thead><tr><th>Preparação</th><th>Quantidade</th><th>Observações</th><th>Status</th><th>Ações</th></tr></thead><tbody>${visiveis.map(o=>`<tr><td><b>${esc(o.preparacao_nome)}</b></td><td>${fmt(o.quantidade_planejada)} ${esc(o.unidade)}</td><td>${esc(o.observacoes||"—")}</td><td><span class="stock-status ${["concluida","finalizada"].includes(o.status)?"normal":"baixo"}">${status(o.status)}</span></td><td>${o.status==="planejada"?`<button class="secondary" onclick="statusOP(${o.id},'em_producao')">Iniciar</button> `:""}${o.status==="em_producao"||o.status==="planejada"?`<button class="primary" onclick="statusOP(${o.id},'concluida')">Concluir</button> `:""}<button class="secondary" onclick="excluirOP(${o.id})">Excluir</button></td></tr>`).join("")}</tbody></table></div>`}</div>`;
 document.querySelector("#novaOP").onclick=novaOP;
}catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}};

function novaOP(){const preps=window.__PREPS_PRODUCAO||[];C.innerHTML=`<div class="section-head"><div><small>PRODUÇÃO DO DIA</small><h2>Adicionar tarefa</h2><p>Registre o que a equipe precisa produzir. Esta tarefa não movimenta o estoque.</p></div><button class="secondary" id="voltarOP">← Voltar</button></div>
<form class="card" id="formOP"><div class="form-grid"><label>Preparação<select id="opPrep" required><option value="">Selecione...</option>${preps.map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label><label>Quantidade<input id="opQtd" inputmode="decimal" required placeholder="0,000"></label></div><label>Observações<textarea id="opObs" placeholder="Ex.: deixar pronto antes do almoço"></textarea></label><div class="actions"><button type="button" class="secondary" id="cancelOP">Cancelar</button><button class="primary">Adicionar à produção do dia</button></div></form>`;
 document.querySelector("#voltarOP").onclick=telaProducao;document.querySelector("#cancelOP").onclick=telaProducao;
 document.querySelector("#formOP").onsubmit=async e=>{e.preventDefault();try{await apiP("/api/producao/planejar",{method:"POST",body:JSON.stringify({preparacao_id:Number(document.querySelector("#opPrep").value),quantidade:num(document.querySelector("#opQtd").value),observacoes:document.querySelector("#opObs").value})});await telaProducao()}catch(z){alert(z.message)}}}

window.statusOP=async(id,status)=>{try{await apiP(`/api/producao/ordens/${id}/status`,{method:"POST",body:JSON.stringify({status})});await telaProducao()}catch(e){alert(e.message)}};
window.excluirOP=async id=>{if(!confirm("Excluir esta tarefa da Produção do Dia?"))return;try{await apiP(`/api/producao/ordens/${id}/anular`,{method:"POST",body:"{}"});await telaProducao()}catch(e){alert(e.message)}};

document.addEventListener("click",e=>{const b=e.target.closest('[data-tab="producao"]');if(b)setTimeout(telaProducao,0)});
})();