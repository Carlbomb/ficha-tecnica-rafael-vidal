let I=[],F=[],T="insumos",C=document.querySelector("#content"),$=s=>document.querySelector(s),N=x=>Number(x||0),M=x=>N(x).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),P=x=>N(x).toFixed(1)+"%",E=x=>String(x??"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[a]));

async function A(u,o={}){
let r=await fetch(u,{headers:{"Content-Type":"application/json"},...o});
if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.error||"Falha na operação")}
return r.status==204?null:r.json()
}

async function L(){
try{
[I,F]=await Promise.all([A("/api/insumos"),A("/api/fichas")]);
R()
}catch(e){
C.innerHTML=`<div class="error">${E(e.message)}</div>`
}
}

function S(){
$("#ni").textContent=I.length;
$("#nf").textContent=F.length;
let a=F.filter(x=>N(x.preco_venda)>0).map(x=>N(x.cmv_percentual));
$("#avg").textContent=P(a.length?a.reduce((x,y)=>x+y,0)/a.length:0)
}

function K(x){
return N(x)<=30?"good":N(x)<=35?"warn":"bad"
}

function R(){
S();
document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.tab==T));

if(T=="insumos")
C.innerHTML=`
<div class="row">
<h2>Banco de Insumos</h2>
<button class="primary" onclick="NI()">+ Insumo</button>
</div>
`+(I.map(i=>`
<div class="card row mobile">
<div>
<b>${E(i.ingrediente)}</b>
<div class="muted">${E(i.unidade)} · FC ${N(i.fc).toFixed(3)} · compra ${M(i.preco_compra)}</div>
<small>${E(i.fornecedor||"")}</small>
</div>
<div class="actions">
<span class="price">${M(i.preco_real)}</span>
<button class="secondary" onclick="EI(${i.id})">Editar</button>
<button class="danger" onclick="DI(${i.id})">Excluir</button>
</div>
</div>
`).join("")||'<div class="card muted">Cadastre o primeiro insumo.</div>');

else if(T=="fichas")
C.innerHTML=`
<div class="row">
<h2>Fichas Técnicas</h2>
<button class="primary" onclick="NF()">+ Ficha</button>
</div>
`+(F.map(f=>`
<div class="card">
<div class="row">
<div><b>${E(f.nome_prato)}</b> <span class="tag">${E(f.categoria)}</span></div>
<b class="${K(f.cmv_percentual)}">${P(f.cmv_percentual)} CMV</b>
</div>
<p class="muted">${N(f.porcoes)} porções · custo total ${M(f.custo_total)} · custo/porção ${M(f.custo_por_porcao)}</p>
<div class="actions">
<button class="primary" onclick="OF(${f.id})">Ingredientes</button>
<button class="secondary" onclick="EF(${f.id})">Editar</button>
<button class="danger" onclick="DF(${f.id})">Excluir</button>
</div>
</div>
`).join("")||'<div class="card muted">Crie a primeira ficha técnica.</div>');

else
C.innerHTML='<h2>Controle de CMV</h2>'+
(F.map(f=>`
<div class="card row mobile">
<div>
<b>${E(f.nome_prato)}</b>
<div class="muted">Custo/porção ${M(f.custo_por_porcao)} · Venda ${M(f.preco_venda)}</div>
</div>
<b class="${K(f.cmv_percentual)}">${P(f.cmv_percentual)}</b>
</div>
`).join("")||'<div class="card muted">O CMV aparecerá após cadastrar fichas.</div>')
}

function FI(i={}){
C.innerHTML=`
<h2>${i.id?"Editar":"Novo"} insumo</h2>
<div class="card form">

<input id="n" placeholder="Ingrediente" value="${E(i.ingrediente||"")}">

<select id="u">
${["KG","L","G","ML","UN","PCT","CX"].map(x=>`<option ${i.unidade==x?"selected":""}>${x}</option>`).join("")}
</select>

<input id="pb" type="number" step=".001" placeholder="Peso bruto" value="${i.peso_bruto||1}">

<input id="pl" type="number" step=".001" placeholder="Peso líquido" value="${i.peso_liquido||1}">

<input id="pc" type="number" step=".01" placeholder="Preço de compra (R$)" value="${i.preco_compra||""}">

<input id="fo" placeholder="Fornecedor" value="${E(i.fornecedor||"")}">

<input id="dt" type="date" value="${i.data_cotacao?.slice?.(0,10)||""}">

<textarea id="ob" placeholder="Observações">${E(i.observacoes||"")}</textarea>

<button class="primary wide" id="sv">Salvar insumo</button>
</div>
`;

$("#sv").onclick=async()=>{
try{
let b={
ingrediente:$("#n").value,
unidade:$("#u").value,
peso_bruto:$("#pb").value,
peso_liquido:$("#pl").value,
preco_compra:$("#pc").value,
fornecedor:$("#fo").value,
data_cotacao:$("#dt").value||null,
observacoes:$("#ob").value
};

await A(i.id?`/api/insumos/${i.id}`:"/api/insumos",{
method:i.id?"PUT":"POST",
body:JSON.stringify(b)
});

await L()
}catch(e){alert(e.message)}
}
}

window.NI=()=>FI();

window.EI=id=>FI(I.find(x=>N(x.id)==id));

window.DI=async id=>{
if(confirm("Excluir este insumo?"))
try{
await A(`/api/insumos/${id}`,{method:"DELETE"});
await L()
}catch(e){alert(e.message)}
};

function FF(f={}){
C.innerHTML=`
<h2>${f.id?"Editar":"Nova"} ficha técnica</h2>

<div class="card form">

<input id="fn" placeholder="Nome do prato" value="${E(f.nome_prato||"")}">

<select id="ca">
${["Entrada","Prato Principal","Acompanhamento","Molho","Sobremesa","Bebida","Outros"].map(x=>`<option ${f.categoria==x?"selected":""}>${x}</option>`).join("")}
</select>

<input id="re" type="number" step=".001" placeholder="Rendimento (kg)" value="${f.rendimento_kg||""}">

<input id="po" type="number" placeholder="Porções" value="${f.porcoes||1}">

<input id="pv" type="number" step=".01" placeholder="Preço de venda/porção" value="${f.preco_venda||""}">

<select id="st">
${["Rascunho","Ativa","Inativa"].map(x=>`<option ${f.status==x?"selected":""}>${x}</option>`).join("")}
</select>

<textarea id="pr" placeholder="Modo de preparo">${E(f.modo_preparo||"")}</textarea>

<textarea id="fob" placeholder="Observações">${E(f.observacoes||"")}</textarea>

<button class="primary wide" id="sf">Salvar ficha</button>

</div>
`;

$("#sf").onclick=async()=>{
try{
let b={
nome_prato:$("#fn").value,
categoria:$("#ca").value,
rendimento_kg:$("#re").value,
porcoes:$("#po").value,
preco_venda:$("#pv").value,
status:$("#st").value,
modo_preparo:$("#pr").value,
observacoes:$("#fob").value
};

await A(f.id?`/api/fichas/${f.id}`:"/api/fichas",{
method:f.id?"PUT":"POST",
body:JSON.stringify(b)
});

await L()
}catch(e){alert(e.message)}
}
}

window.NF=()=>FF();
window.novaFicha=window.NF;

window.EF=id=>FF(F.find(x=>N(x.id)==id));

window.DF=async id=>{
if(confirm("Excluir esta ficha e seus ingredientes?")){
await A(`/api/fichas/${id}`,{method:"DELETE"});
await L()
}
};

window.OF=async id=>{
try{
let f=await A(`/api/fichas/${id}`);

C.innerHTML=`
<div class="row">
<h2>${E(f.nome_prato)}</h2>
<button class="secondary" onclick="R()">Voltar</button>
</div>

<div class="card row mobile">
<span>Custo total <b>${M(f.custo_total)}</b></span>
<span>Custo/porção <b>${M(f.custo_por_porcao)}</b></span>
<span>CMV <b class="${K(f.cmv_percentual)}">${P(f.cmv_percentual)}</b></span>
</div>

<div class="card">
<h3>Adicionar ingrediente</h3>

${I.length?`
<div class="form">

<select id="si">
${I.map(i=>`
<option value="${i.id}">
${E(i.ingrediente)} · ${M(i.preco_real)}/${E(i.unidade)}
</option>
`).join("")}
</select>

<input id="qt" type="number" step=".001" placeholder="Quantidade">

<button class="primary wide" id="ad">Adicionar</button>

</div>
`:'<p class="muted">Cadastre primeiro os insumos.</p>'}

</div>

<div class="card">
<h3>Ingredientes</h3>

${f.ingredientes.map(i=>`
<div class="ingredient row">

<div>
<b>${E(i.ingrediente)}</b>
<div class="muted">
${N(i.quantidade)} ${E(i.unidade)} × ${M(i.preco_real)}
</div>
</div>

<div>
<b>${M(i.custo_item)}</b>
<button class="danger" onclick="DG(${i.id},${f.id})">×</button>
</div>

</div>
`).join("")||'<p class="muted">Nenhum ingrediente.</p>'}

</div>

<div class="card">
<h3>Modo de preparo</h3>
<p>${E(f.modo_preparo||"—")}</p>
</div>
`;

if($("#ad"))
$("#ad").onclick=async()=>{
let s=$("#si");
let i=I.find(x=>String(x.id)==s.value);

await A(`/api/fichas/${id}/ingredientes`,{
method:"POST",
body:JSON.stringify({
insumo_id:s.value,
quantidade:$("#qt").value,
unidade:i?.unidade||"KG"
})
});

OF(id)
}

}catch(e){
C.innerHTML=`<div class="error">${E(e.message)}</div>`
}
};

window.DG=async(id,f)=>{
await A(`/api/ingredientes/${id}`,{method:"DELETE"});
OF(f)
};

document.querySelectorAll("nav button").forEach(b=>{
b.onclick=()=>{
T=b.dataset.tab;
R()
}
});

L();
