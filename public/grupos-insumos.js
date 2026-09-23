/* MISEVO V20.1 — Grupos de Insumos */
(()=>{
const GRUPOS_PADRAO=["Carnes e Aves","Pescados e Frutos do Mar","Laticínios e Queijos","Hortifruti","Grãos, Cereais e Leguminosas","Massas e Farinhas","Óleos, Gorduras e Azeites","Temperos, Ervas e Especiarias","Molhos e Condimentos","Enlatados e Conservas","Bebidas e Líquidos","Confeitaria","Congelados","Produções da Cozinha","Outros"];
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function apiG(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Erro ao carregar grupos.");return d}
window.telaInsumos=async function(){
 const C=document.querySelector("#content");
 C.innerHTML='<div class="card">Carregando insumos...</div>';
 try{
  const itens=await apiG("/api/estoque/insumos-grupos");
  const usados=[...new Set(itens.map(x=>x.grupo||"Outros"))];
  const grupos=[...new Set([...GRUPOS_PADRAO,...usados])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  C.innerHTML=`<div class="section-head"><div><small>BANCO DE DADOS</small><h2>Insumos Base</h2><p>Organizados por grupos para facilitar estoque, fichas e operação.</p></div><button type="button" class="primary" id="novoInsumoGrupo">+ Novo insumo</button></div>
  <div class="card"><div class="estoque-tools"><input id="buscaInsumoGrupo" placeholder="Buscar código, ingrediente ou fornecedor..."><select id="filtroGrupo"><option value="">Todos os grupos</option>${grupos.map(g=>`<option>${esc(g)}</option>`).join("")}</select></div><div id="listaInsumosGrupo" style="margin-top:12px"></div></div>`;
  const render=()=>{
   const q=(document.querySelector("#buscaInsumoGrupo")?.value||"").trim().toLowerCase();
   const gf=document.querySelector("#filtroGrupo")?.value||"";
   const a=itens.filter(x=>(!gf||(x.grupo||"Outros")===gf)&&(`${x.codigo} ${x.ingrediente} ${x.fornecedor||""}`).toLowerCase().includes(q));
   const por={};a.forEach(x=>{const g=x.grupo||"Outros";(por[g]??=[]).push(x)});
   document.querySelector("#listaInsumosGrupo").innerHTML=!a.length?'<div class="empty">Nenhum insumo encontrado.</div>':
   Object.keys(por).sort((a,b)=>a.localeCompare(b,"pt-BR")).map(g=>`<div class="grupo-insumos"><h3>${esc(g)} <small>(${por[g].length})</small></h3><div class="table-wrap"><table><thead><tr><th>Cód.</th><th>Ingrediente</th><th>Unid.</th><th>Preço Compra</th><th>Preço Real</th><th>Fornecedor</th><th>Grupo</th></tr></thead><tbody>${por[g].map(x=>`<tr><td><b>${esc(x.codigo)}</b></td><td><b>${esc(x.ingrediente)}</b></td><td>${esc(x.unidade)}</td><td>${money(x.preco_compra)}</td><td><b>${money(x.preco_real)}</b></td><td>${esc(x.fornecedor||"—")}</td><td><select class="grupo-item" data-id="${x.id}">${grupos.map(o=>`<option ${o===(x.grupo||"Outros")?"selected":""}>${esc(o)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div></div>`).join("");
   document.querySelectorAll(".grupo-item").forEach(s=>s.onchange=async()=>{try{await apiG(`/api/estoque/insumos/${s.dataset.id}/grupo`,{method:"PUT",body:JSON.stringify({grupo:s.value})});await window.telaInsumos()}catch(e){alert(e.message)}});
  };
  document.querySelector("#buscaInsumoGrupo").oninput=render;
  document.querySelector("#filtroGrupo").onchange=render;
  document.querySelector("#novoInsumoGrupo").onclick=()=>{ if(typeof window.formularioInsumo==="function") window.formularioInsumo(); else alert("Use Estoque > Movimentações > Cadastrar novo insumo."); };
  render();
 }catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}
};
})();
