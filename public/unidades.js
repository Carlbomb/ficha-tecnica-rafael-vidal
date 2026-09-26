/* MISEVO V18 — Unidades e Conversões */
(()=>{
const C=document.querySelector("#content");
const fmt=(v,d=3)=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:d});
const GRUPOS=[
 {nome:"Massa",base:"KG",unidades:[["KG","Quilograma"],["G","Grama"]]},
 {nome:"Volume",base:"L",unidades:[["L","Litro"],["ML","Mililitro"]]},
 {nome:"Contagem",base:"UN",unidades:[["UN","Unidade"]]}
];
function grupo(u){if(["KG","G"].includes(u))return"massa";if(["L","ML"].includes(u))return"volume";if(u==="UN")return"unidade";return"outro"}
function conv(v,de,para){v=Number(String(v||0).replace(",","."));if(de===para)return v;if(grupo(de)!==grupo(para))return NaN;const f={KG:1000,G:1,L:1000,ML:1,UN:1};return v*f[de]/f[para]}
window.telaUnidades=()=>{
 C.innerHTML=`<div class="section-head"><div><small>PADRONIZAÇÃO</small><h2>Unidades e Conversões</h2><p>Use unidades compatíveis sem alterar o custo real da ficha técnica.</p></div></div>
 <div class="card"><h3>Conversor rápido</h3><div class="form-grid">
 <label>Quantidade<input id="cvValor" type="text" inputmode="decimal" value="1"></label>
 <label>De<select id="cvDe">${["KG","G","L","ML","UN"].map(x=>`<option>${x}</option>`).join("")}</select></label>
 <label>Para<select id="cvPara">${["KG","G","L","ML","UN"].map(x=>`<option>${x}</option>`).join("")}</select></label>
 </div><div class="summary-grid"><div><span>Resultado</span><strong id="cvResultado">1 KG</strong></div></div></div>
 <div class="card"><div class="section-head"><div><small>PADRÃO MISEVO</small><h3>Unidades disponíveis</h3></div></div>
 <div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Unidade</th><th>Nome</th><th>Equivalência</th></tr></thead><tbody>
 ${GRUPOS.flatMap(g=>g.unidades.map(([u,n])=>`<tr><td>${g.nome}</td><td><b>${u}</b></td><td>${n}</td><td>${u==="KG"?"1 KG = 1.000 G":u==="G"?"1 G = 0,001 KG":u==="L"?"1 L = 1.000 ML":u==="ML"?"1 ML = 0,001 L":"Contagem unitária"}</td></tr>`)).join("")}
 </tbody></table></div></div>
 <div class="card"><h3>Como funciona nas fichas</h3><p>O custo continua baseado na unidade cadastrada no insumo. Você pode lançar, por exemplo, <b>250 G</b> de um insumo comprado em <b>KG</b>; o MISEVO converte automaticamente para <b>0,250 KG</b> antes de calcular o custo.</p><p><b>Conversões permitidas:</b> KG ↔ G e L ↔ ML. UN permanece UN. Conversões entre massa e volume não são feitas automaticamente porque dependem da densidade do ingrediente.</p></div>`;
 const calc=()=>{const v=document.querySelector("#cvValor").value,de=document.querySelector("#cvDe").value,para=document.querySelector("#cvPara").value,r=conv(v,de,para);document.querySelector("#cvResultado").textContent=Number.isFinite(r)?`${fmt(r)} ${para}`:"Unidades incompatíveis"};
 ["#cvValor","#cvDe","#cvPara"].forEach(s=>document.querySelector(s).addEventListener("input",calc));calc();
};
document.addEventListener("click",e=>{const b=e.target.closest('[data-tab="unidades"]');if(b)setTimeout(()=>window.telaUnidades(),0)});
})();