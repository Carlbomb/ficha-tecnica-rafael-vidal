let I=[],F=[],T="insumos",C=document.querySelector("#content");
const $=s=>document.querySelector(s),N=x=>Number(x||0);
const M=x=>N(x).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const P=x=>N(x).toFixed(1)+"%";
const E=x=>String(x??"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[a]));

async function A(u,o={}){
 let r=await fetch(u,{headers:{"Content-Type":"application/json"},...o});
 if(!r.ok){
  let e=await r.json().catch(()=>({}));
  throw Error(e.error||"Falha na operação")
 }
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

function K(x){return N(x)<=30?"good":N(x)<=35?"warn":"bad"}

function CV(q,u,b){
 q=N(q);
 if(u=="G"&&b=="KG")return q/1000;
 if(u=="ML"&&b=="L")return q/1000;
 if(u=="KG"&&b=="G")return q*1000;
 if(u=="L"&&b=="ML")return q*1000;
 return q
}

function R(){
 S();
 document.querySelectorAll("nav button").forEach(b=>
  b.classList.toggle("active",b.dataset.tab==T)
 );

 if(T=="insumos"){
  C.innerHTML=`
  <div class="row">
   <h2>Banco de Insumos</h2>
   <button class="primary" onclick="NI()">+ Insumo</button>
  </div>
  `+(I.map(i=>`
   <div class="card row mobile">
    <div>
     <b>${E(i.ingrediente)}</b>
     <div class="muted">
      ${E(i.unidade)} · FC ${N(i.fc).toFixed(3)}
      · compra ${M(i.preco_compra)}
     </div>
     <small>${E(i.fornecedor||"")}</small>
    </div>

    <div class="actions">
     <span class="price">${M(i.preco_real)}</span>
     <button class="secondary" onclick="EI(${i.id})">Editar</button>
     <button class="danger" onclick="DI(${i.id})">Excluir</button>
    </div>
   </div>
  `).join("")||'<div class="card muted">Cadastre o primeiro insumo.</div>')
 }

 else if(T=="fichas"){
  C.innerHTML=`
  <div class="row">
   <h2>Fichas Técnicas</h2>
   <button class="primary" onclick="NF()">+ Ficha</button>
  </div>
  `+(F.map(f=>`
   <div class="card">
    <div class="row">
     <div>
      <b>${E(f.nome_prato)}</b>
      <span class="tag">${E(f.categoria)}</span>
     </div>
     <b class="${K(f.cmv_percentual)}">
      ${P(f.cmv_percentual)} CMV
     </b>
    </div>

    <p class="muted">
     ${N(f.porcoes)} porções ·
     custo total ${M(f.custo_total)} ·
     custo/porção ${M(f.custo_por_porcao)}
    </p>

    <div class="actions">
     <button class="primary" onclick="OF(${f.id})">Abrir</button>
     <button class="secondary" onclick="EF(${f.id})">Editar</button>
     <button class="danger" onclick="DF(${f.id})">Excluir</button>
    </div>
   </div>
  `).join("")||'<div class="card muted">Crie a primeira ficha técnica.</div>')
 }

 else{
  C.innerHTML='<h2>Controle de CMV</h2>'+
  (F.map(f=>`
   <div class="card row mobile">
    <div>
     <b>${E(f.nome_prato)}</b>
     <div class="muted">
      Custo/porção ${M(f.custo_por_porcao)}
      · Venda ${M(f.preco_venda)}
     </div>
    </div>
    <b class="${K(f.cmv_percentual)}">${P(f.cmv_percentual)}</b>
   </div>
  `).join("")||'<div class="card muted">O CMV aparecerá após cadastrar fichas.</div>')
 }
}

function FI(i={}){
 C.innerHTML=`
 <h2>${i.id?"Editar":"Novo"} insumo</h2>

 <div class="card form">
  <input id="n" placeholder="Ingrediente" value="${E(i.ingrediente||"")}">

  <select id="u">
   ${["KG","L","G","ML","UN","PCT","CX"].map(x=>
    `<option ${i.unidade==x?"selected":""}>${x}</option>`
   ).join("")}
  </select>

  <input id="pb" type="number" step=".001"
   placeholder="Peso bruto" value="${i.peso_bruto||1}">

  <input id="pl" type="number" step=".001"
   placeholder="Peso líquido" value="${i.peso_liquido||1}">

  <input id="pc" type="number" step=".01"
   placeholder="Preço de compra (R$)" value="${i.preco_compra||""}">

  <input id="fo" placeholder="Fornecedor"
   value="${E(i.fornecedor||"")}">

  <input id="dt" type="date"
   value="${i.data_cotacao?.slice?.(0,10)||""}">

  <textarea id="ob"
   placeholder="Observações">${E(i.observacoes||"")}</textarea>

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
 if(confirm("Excluir este insumo?")){
  try{
   await A(`/api/insumos/${id}`,{method:"DELETE"});
   await L()
  }catch(e){alert(e.message)}
 }
};

function FF(f={}){
 let itens=[];

 function tela(){
  let total=itens.reduce((s,x)=>s+x.custo,0);

  C.innerHTML=`
  <h2>${f.id?"Editar":"Nova"} ficha técnica</h2>

  <div class="card form">

   <input id="fn" placeholder="Nome do prato"
    value="${E(f.nome_prato||"")}">

   <select id="ca">
    ${["Entrada","Prato Principal","Acompanhamento","Molho",
    "Sobremesa","Bebida","Outros"].map(x=>
     `<option ${f.categoria==x?"selected":""}>${x}</option>`
    ).join("")}
   </select>

   <input id="re" type="number" step=".001"
    placeholder="Rendimento total (kg)"
    value="${f.rendimento_kg||""}">

   <input id="po" type="number"
    placeholder="Número de porções"
    value="${f.porcoes||1}">

   <input id="pv" type="number" step=".01"
    placeholder="Preço de venda por porção (R$)"
    value="${f.preco_venda||""}">

  </div>

  <div class="card">
   <h3>Ingredientes da ficha</h3>

   ${I.length?`
    <div class="form">

     <select id="si">
      ${I.map(i=>`
       <option value="${i.id}">
        ${E(i.ingrediente)} · ${M(i.preco_real)}/${E(i.unidade)}
       </option>
      `).join("")}
     </select>

     <input id="qt" type="number" step=".001"
      placeholder="Quantidade utilizada">

     <select id="iu">
      ${["G","KG","ML","L","UN","PCT","CX"]
      .map(x=>`<option>${x}</option>`).join("")}
     </select>

     <button class="secondary wide" id="ai">
      + Adicionar ingrediente
     </button>

    </div>
   `:'<p class="muted">Cadastre primeiro os insumos.</p>'}

   <div>
    ${itens.map((x,n)=>`
     <div class="ingredient row">
      <div>
       <b>${E(x.nome)}</b>
       <div class="muted">
        ${x.qtd} ${x.unidade}
        · ${M(x.custo)}
       </div>
      </div>

      <button class="danger" onclick="RI(${n})">×</button>
     </div>
    `).join("")||'<p class="muted">Nenhum ingrediente adicionado.</p>'}
   </div>
  </div>

  <div class="card">
   <div class="row mobile">
    <span>
     Custo total
     <b>${M(total)}</b>
    </span>

    <span>
     Custo por porção
     <b id="cpp">${M(total/(N(f.porcoes)||1))}</b>
    </span>

    <span>
     CMV
     <b id="cmvp">0,0%</b>
    </span>
   </div>
  </div>

  <div class="card form">

   <select id="st">
    ${["Rascunho","Ativa","Inativa"].map(x=>
     `<option ${f.status==x?"selected":""}>${x}</option>`
    ).join("")}
   </select>

   <textarea id="pr"
    placeholder="Modo de preparo">${E(f.modo_preparo||"")}</textarea>

   <textarea id="fob"
    placeholder="Observações">${E(f.observacoes||"")}</textarea>

   <button class="primary wide" id="sf">
    Salvar ficha completa
   </button>

  </div>
  `;

  function calc(){
   let p=N($("#po").value)||1;
   let v=N($("#pv").value);
   let cp=total/p;
   $("#cpp").textContent=M(cp);
   let cmv=v?cp/v*100:0;
   $("#cmvp").textContent=P(cmv);
   $("#cmvp").className=K(cmv)
  }

  $("#po").oninput=calc;
  $("#pv").oninput=calc;
  calc();

  if($("#ai"))$("#ai").onclick=()=>{
   let ins=I.find(x=>String(x.id)==$("#si").value);
   let q=N($("#qt").value);

   if(!ins||q<=0){
    alert("Informe o ingrediente e a quantidade.");
    return
   }

   let u=$("#iu").value;

   itens.push({
    insumo_id:ins.id,
    nome:ins.ingrediente,
    qtd:q,
    unidade:u,
    custo:CV(q,u,ins.unidade)*N(ins.preco_real)
   });

   f.nome_prato=$("#fn").value;
   f.categoria=$("#ca").value;
   f.rendimento_kg=$("#re").value;
   f.porcoes=$("#po").value;
   f.preco_venda=$("#pv").value;
   f.status=$("#st").value;
   f.modo_preparo=$("#pr").value;
   f.observacoes=$("#fob").value;

   tela()
  };

  $("#sf").onclick=async()=>{
   try{
    if(!$("#fn").value.trim()){
     alert("Informe o nome do prato.");
     return
    }

    let body={
     nome_prato:$("#fn").value,
     categoria:$("#ca").value,
     rendimento_kg:$("#re").value,
     porcoes:$("#po").value,
     preco_venda:$("#pv").value,
     status:$("#st").value,
     modo_preparo:$("#pr").value,
     observacoes:$("#fob").value
    };

    let ficha=await A("/api/fichas",{
     method:"POST",
     body:JSON.stringify(body)
    });

    for(let x of itens){
     await A(`/api/fichas/${ficha.id}/ingredientes`,{
      method:"POST",
      body:JSON.stringify({
       insumo_id:x.insumo_id,
       quantidade:x.qtd,
       unidade:x.unidade
      })
     })
    }

    T="fichas";
    await L()

   }catch(e){
    alert(e.message)
   }
  }
 }

 window.RI=n=>{
  itens.splice(n,1);
  tela()
 };

 tela()
}

window.NF=()=>FF();
window.novaFicha=window.NF;

window.EF=async id=>{
 try{
  let f=await A(`/api/fichas/${id}`);
  FE(f)
 }catch(e){alert(e.message)}
};

function FE(f){
 C.innerHTML=`
 <h2>Editar ficha técnica</h2>

 <div class="card form">
  <input id="fn" placeholder="Nome do prato"
   value="${E(f.nome_prato||"")}">

  <select id="ca">
   ${["Entrada","Prato Principal","Acompanhamento","Molho",
   "Sobremesa","Bebida","Outros"].map(x=>
    `<option ${f.categoria==x?"selected":""}>${x}</option>`
   ).join("")}
  </select>

  <input id="re" type="number" step=".001"
   placeholder="Rendimento (kg)"
   value="${f.rendimento_kg||""}">

  <input id="po" type="number"
   placeholder="Porções"
   value="${f.porcoes||1}">

  <input id="pv" type="number" step=".01"
   placeholder="Preço de venda"
   value="${f.preco_venda||""}">

  <select id="st">
   ${["Rascunho","Ativa","Inativa"].map(x=>
    `<option ${f.status==x?"selected":""}>${x}</option>`
   ).join("")}
  </select>

  <textarea id="pr"
   placeholder="Modo de preparo">${E(f.modo_preparo||"")}</textarea>

  <textarea id="fob"
   placeholder="Observações">${E(f.observacoes||"")}</textarea>

  <button class="primary wide" id="sf">Salvar alterações</button>
 </div>
 `;

 $("#sf").onclick=async()=>{
  try{
   await A(`/api/fichas/${f.id}`,{
    method:"PUT",
    body:JSON.stringify({
     nome_prato:$("#fn").value,
     categoria:$("#ca").value,
     rendimento_kg:$("#re").value,
     porcoes:$("#po").value,
     preco_venda:$("#pv").value,
     status:$("#st").value,
     modo_preparo:$("#pr").value,
     observacoes:$("#fob").value
    })
   });

   T="fichas";
   await L()
  }catch(e){alert(e.message)}
 }
}

window.DF=async id=>{
 if(confirm("Excluir esta ficha e seus ingredientes?")){
  try{
   await A(`/api/fichas/${id}`,{method:"DELETE"});
   await L()
  }catch(e){alert(e.message)}
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
   <span>
    CMV
    <b class="${K(f.cmv_percentual)}">${P(f.cmv_percentual)}</b>
   </span>
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

     <input id="qt" type="number" step=".001"
      placeholder="Quantidade">

     <select id="iu">
      ${["G","KG","ML","L","UN","PCT","CX"]
      .map(x=>`<option>${x}</option>`).join("")}
     </select>

     <button class="primary wide" id="ad">
      Adicionar
     </button>
    </div>
   `:""}
  </div>

  <div class="card">
   <h3>Ingredientes</h3>

   ${f.ingredientes.map(i=>`
    <div class="ingredient row">
     <div>
      <b>${E(i.ingrediente)}</b>
      <div class="muted">
       ${N(i.quantidade)} ${E(i.unidade)}
      </div>
     </div>

     <div>
      <b>${M(i.custo_item)}</b>
      <button class="danger"
       onclick="DG(${i.id},${f.id})">×</button>
     </div>
    </div>
   `).join("")||'<p class="muted">Nenhum ingrediente.</p>'}
  </div>

  <div class="card">
   <h3>Modo de preparo</h3>
   <p>${E(f.modo_preparo||"—")}</p>
  </div>
  `;

  if($("#ad"))$("#ad").onclick=async()=>{
   let ins=I.find(x=>String(x.id)==$("#si").value);

   if(!N($("#qt").value)){
    alert("Informe a quantidade.");
    return
   }

   await A(`/api/fichas/${id}/ingredientes`,{
    method:"POST",
    body:JSON.stringify({
     insumo_id:ins.id,
     quantidade:$("#qt").value,
     unidade:$("#iu").value
    })
   });

   OF(id)
  }

 }catch(e){
  C.innerHTML=`<div class="error">${E(e.message)}</div>`
 }
};

window.DG=async(id,f)=>{
 try{
  await A(`/api/ingredientes/${id}`,{method:"DELETE"});
  OF(f)
 }catch(e){alert(e.message)}
};

document.querySelectorAll("nav button").forEach(b=>{
 b.onclick=()=>{
  T=b.dataset.tab;
  R()
 }
});

L();
