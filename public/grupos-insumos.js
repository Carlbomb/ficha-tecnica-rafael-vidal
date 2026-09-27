/* MISEVO — Lista compacta de insumos */
(()=>{
const GRUPOS_PADRAO=["Carnes e Aves","Pescados e Frutos do Mar","Laticínios e Queijos","Hortifruti","Grãos, Cereais e Leguminosas","Massas e Farinhas","Óleos, Gorduras e Azeites","Temperos, Ervas e Especiarias","Molhos e Condimentos","Enlatados e Conservas","Bebidas e Líquidos","Confeitaria","Congelados","Produções da Cozinha","Outros"];
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function apiG(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Erro ao carregar grupos.");return d}
window.telaInsumos=async function(){
 const C=document.querySelector("#content"); C.innerHTML='<div class="card">Carregando insumos...</div>';
 try{
  const itens=await apiG("/api/estoque/insumos-grupos");
  const usados=[...new Set(itens.map(x=>x.grupo||"Outros"))];
  const grupos=[...new Set([...GRUPOS_PADRAO,...usados])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  C.innerHTML=`<div class="section-head"><div><small>BANCO DE DADOS</small><h2>Insumos Base</h2><p>Consulta rápida de custos e cadastro.</p></div><button type="button" class="primary" id="novoInsumoGrupo">+ Novo insumo</button></div>
  <div class="card insumos-card"><div class="insumos-toolbar"><input id="buscaInsumoGrupo" placeholder="Buscar insumo, código ou fornecedor..."><select id="filtroGrupo"><option value="">Todos os grupos</option>${grupos.map(g=>`<option>${esc(g)}</option>`).join("")}</select><select id="ordemInsumo"><option value="az">A–Z</option><option value="codigo">Código</option><option value="preco">Maior preço</option></select></div><div id="listaInsumosGrupo"></div></div>`;
  const render=()=>{
   const q=(document.querySelector("#buscaInsumoGrupo")?.value||"").trim().toLowerCase(), gf=document.querySelector("#filtroGrupo")?.value||"", ordem=document.querySelector("#ordemInsumo")?.value||"az";
   let a=itens.filter(x=>(!gf||(x.grupo||"Outros")===gf)&&(`${x.codigo} ${x.ingrediente} ${x.fornecedor||""} ${x.grupo||""}`).toLowerCase().includes(q));
   a.sort((x,y)=>ordem==="preco"?Number(y.preco_real||0)-Number(x.preco_real||0):ordem==="codigo"?String(x.codigo||"").localeCompare(String(y.codigo||""),"pt-BR",{numeric:true}):String(x.ingrediente||"").localeCompare(String(y.ingrediente||""),"pt-BR"));
   document.querySelector("#listaInsumosGrupo").innerHTML=!a.length?'<div class="empty">Nenhum insumo encontrado.</div>':`<div class="insumos-count">${a.length} insumo${a.length===1?"":"s"}</div><div class="insumos-compactos">${a.map(x=>`<details class="insumo-row"><summary><div class="insumo-main"><b>${esc(x.ingrediente)}</b><span>#${esc(x.codigo)} · ${esc(x.unidade||"—")} · ${esc(x.grupo||"Outros")}</span></div><div class="insumo-price"><small>Preço real</small><b>${money(x.preco_real)}</b></div><span class="insumo-chevron">⌄</span></summary><div class="insumo-detail"><div><small>Preço compra</small><b>${money(x.preco_compra)}</b></div><div><small>Fornecedor</small><b>${esc(x.fornecedor||"—")}</b></div><label>Grupo<select class="grupo-item" data-id="${x.id}">${grupos.map(o=>`<option ${o===(x.grupo||"Outros")?"selected":""}>${esc(o)}</option>`).join("")}</select></label><button type="button" class="secondary editar-insumo" data-id="${x.id}">Editar insumo</button></div></details>`).join("")}</div>`;
   document.querySelectorAll(".grupo-item").forEach(s=>s.onchange=async e=>{e.stopPropagation();try{await apiG(`/api/estoque/insumos/${s.dataset.id}/grupo`,{method:"PUT",body:JSON.stringify({grupo:s.value})});const it=itens.find(i=>String(i.id)===String(s.dataset.id));if(it)it.grupo=s.value;render()}catch(err){alert(err.message)}});
   document.querySelectorAll(".editar-insumo").forEach(b=>b.onclick=()=>{if(typeof window.editarInsumo==="function")window.editarInsumo(Number(b.dataset.id))});
  };
  ["buscaInsumoGrupo","filtroGrupo","ordemInsumo"].forEach(id=>document.querySelector("#"+id).addEventListener(id==="buscaInsumoGrupo"?"input":"change",render));
  document.querySelector("#novoInsumoGrupo").onclick=()=>{if(typeof window.formularioInsumo==="function")window.formularioInsumo();else alert("Cadastro indisponível.")}; render();
 }catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}
};
})();