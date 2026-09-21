let I=[],F=[],T="insumos",C=document.querySelector("#content"),D=null;

const $=s=>document.querySelector(s);
const N=x=>Number(x||0);

const M=x=>N(x).toLocaleString("pt-BR",{
 style:"currency",
 currency:"BRL"
});

const P=x=>N(x).toLocaleString("pt-BR",{
 minimumFractionDigits:1,
 maximumFractionDigits:1
})+"%";

const E=x=>String(x??"").replace(/[&<>"']/g,a=>({
 "&":"&amp;",
 "<":"&lt;",
 ">":"&gt;",
 '"':"&quot;",
 "'":"&#39;"
}[a]));

const U=["G","KG","ML","L","UN","PCT","CX"];

const CAT=[
 "Entrada",
 "Prato Principal",
 "Acompanhamento",
 "Molho",
 "Sobremesa",
 "Bebida",
 "Outros"
];


/* =========================
   API
========================= */

async function A(u,o={}){

 let r=await fetch(u,{
  headers:{
   "Content-Type":"application/json"
  },
  ...o
 });

 if(!r.ok){

  let e=await r.json().catch(()=>({}));

  throw Error(
   e.error||"Falha na operação"
  )
 }

 return r.status==204
  ?null
  :r.json()
}


/* =========================
   CARREGAMENTO
========================= */

async function L(){

 try{

  [I,F]=await Promise.all([
   A("/api/insumos"),
   A("/api/fichas")
  ]);

  R()

 }catch(e){

  C.innerHTML=
   '<div class="error">'+
   E(e.message)+
   '</div>'
 }
}


/* =========================
   FORMATAÇÕES
========================= */

function K(x){

 return N(x)<=30
  ?"good"
  :N(x)<=35
   ?"warn"
   :"bad"
}


function CV(q,u,b){

 q=N(q);

 if(u=="G"&&b=="KG")
  return q/1000;

 if(u=="ML"&&b=="L")
  return q/1000;

 if(u=="KG"&&b=="G")
  return q*1000;

 if(u=="L"&&b=="ML")
  return q*1000;

 return q
}


function DU(b){

 return b=="KG"
  ?"G"
  :b=="L"
   ?"ML"
   :b
}


function COD(id){

 return "INS-"+
  String(id).padStart(3,"0")
}


function PG(x){

 return Math.round(
  N(x)*1000
 ).toLocaleString("pt-BR")+" g"
}


/* =========================
   INDICADORES
========================= */

function S(){

 $("#ni").textContent=I.length;

 $("#nf").textContent=F.length;

 let a=F
  .filter(x=>N(x.preco_venda)>0)
  .map(x=>N(x.cmv_percentual));

 $("#avg").textContent=P(
  a.length
   ?a.reduce((x,y)=>x+y,0)/a.length
   :0
 )
}


/* =========================
   TELA PRINCIPAL
========================= */

function R(){

 S();

 document
  .querySelectorAll("nav button")
  .forEach(b=>

   b.classList.toggle(
    "active",
    b.dataset.tab==T
   )
  );


 if(T=="insumos"){

  C.innerHTML=`

  <div class="row">

   <h2>Banco de Insumos</h2>

   <button
    class="primary"
    onclick="NI()">

    + Insumo

   </button>

  </div>


  ${
   I.map(i=>`

    <div class="card row mobile">

     <div>

      <b>
       ${E(i.ingrediente)}
      </b>

      <div class="muted">

       ${COD(i.id)}
       · ${E(i.unidade)}
       · FC ${N(i.fc).toFixed(3)}
       · compra ${M(i.preco_compra)}

      </div>

      <small>
       ${E(i.fornecedor||"")}
      </small>

     </div>


     <div class="actions">

      <span class="price">
       ${M(i.preco_real)}
      </span>

      <button
       class="secondary"
       onclick="EI(${i.id})">
       Editar
      </button>

      <button
       class="danger"
       onclick="DI(${i.id})">
       Excluir
      </button>

     </div>

    </div>

   `).join("")

   ||

   `<div class="card muted">
     Cadastre o primeiro insumo.
    </div>`
  }
  `
 }


 else if(T=="fichas"){

  C.innerHTML=`

  <div class="row">

   <h2>Fichas Técnicas</h2>

   <button
    class="primary"
    onclick="NF()">

    + Ficha

   </button>

  </div>


  ${
   F.map(f=>`

    <div class="card">

     <div class="row">

      <div>

       <b>
        ${E(f.nome_prato)}
       </b>

       <span class="tag">
        ${E(f.categoria)}
       </span>

      </div>

      <b class="${K(f.cmv_percentual)}">
       ${P(f.cmv_percentual)}
       CMV
      </b>

     </div>


     <p class="muted">

      ${N(f.porcoes)} porções

      · Peso/porção
      ${PG(f.peso_por_porcao)}

      · Custo total
      ${M(f.custo_total)}

      · Custo/porção
      ${M(f.custo_por_porcao)}

     </p>


     <div class="actions">

      <button
       class="primary"
       onclick="OF(${f.id})">
       Abrir
      </button>

      <button
       class="secondary"
       onclick="EF(${f.id})">
       Editar completa
      </button>

      <button
       class="danger"
       onclick="DF(${f.id})">
       Excluir
      </button>

     </div>

    </div>

   `).join("")

   ||

   `<div class="card muted">
     Crie a primeira ficha técnica.
    </div>`
  }
  `
 }


 else{

  C.innerHTML=`

  <h2>Controle de CMV</h2>

  ${
   F.map(f=>`

    <div class="card row mobile">

     <div>

      <b>
       ${E(f.nome_prato)}
      </b>

      <div class="muted">

       Peso/porção
       ${PG(f.peso_por_porcao)}

       · Custo/porção
       ${M(f.custo_por_porcao)}

       · Venda
       ${M(f.preco_venda)}

       · Meta 30%
       ${M(
        N(f.custo_por_porcao)/.30
       )}

      </div>

     </div>

     <b class="${K(f.cmv_percentual)}">
      ${P(f.cmv_percentual)}
     </b>

    </div>

   `).join("")

   ||

   `<div class="card muted">
     O CMV aparecerá após cadastrar fichas.
    </div>`
  }
  `
 }
}


/* =========================
   CADASTRO DE INSUMO
========================= */

function FI(i={}){

 C.innerHTML=`

 <h2>
  ${i.id?"Editar":"Novo"} insumo
 </h2>


 <div class="card form">

  ${
   i.id
   ?`
    <div class="muted">
     Código ${COD(i.id)}
    </div>
   `
   :""
  }


  <input
   id="n"
   placeholder="Ingrediente"
   value="${E(i.ingrediente||"")}">


  <select id="u">

   ${
    U.map(x=>`

     <option
      ${i.unidade==x?"selected":""}>
      ${x}
     </option>

    `).join("")
   }

  </select>


  <input
   id="pb"
   type="number"
   step=".001"
   placeholder="Peso bruto"
   value="${i.peso_bruto||1}">


  <input
   id="pl"
   type="number"
   step=".001"
   placeholder="Peso líquido"
   value="${i.peso_liquido||1}">


  <div
   class="muted"
   id="fcv">

   FC:
   ${N(i.fc||1).toFixed(3)}

  </div>


  <input
   id="pc"
   type="number"
   step=".01"
   placeholder="Preço de compra / unidade (R$)"
   value="${i.preco_compra||""}">


  <div
   class="muted"
   id="prv">

   Preço real:
   ${M(i.preco_real)}

  </div>


  <input
   id="fo"
   placeholder="Fornecedor"
   value="${E(i.fornecedor||"")}">


  <input
   id="dt"
   type="date"
   value="${
    i.data_cotacao?.slice?.(0,10)||""
   }">


  <textarea
   id="ob"
   placeholder="Observações">${E(i.observacoes||"")}</textarea>


  <button
   class="primary wide"
   id="sv">

   Salvar insumo

  </button>

 </div>
 `;


 function c(){

  let fc=
   N($("#pl").value)
   ?N($("#pb").value)/
    N($("#pl").value)
   :1;


  $("#fcv").textContent=
   "FC: "+
   fc.toFixed(3);


  $("#prv").textContent=
   "Preço real: "+
   M(
    N($("#pc").value)*fc
   )
 }


 ["#pb","#pl","#pc"]
  .forEach(s=>
   $(s).oninput=c
  );


 $("#sv").onclick=async()=>{

  try{

   await A(

    i.id
     ?"/api/insumos/"+i.id
     :"/api/insumos",

    {

     method:
      i.id
       ?"PUT"
       :"POST",

     body:JSON.stringify({

      ingrediente:
       $("#n").value,

      unidade:
       $("#u").value,

      peso_bruto:
       $("#pb").value,

      peso_liquido:
       $("#pl").value,

      preco_compra:
       $("#pc").value,

      fornecedor:
       $("#fo").value,

      data_cotacao:
       $("#dt").value||null,

      observacoes:
       $("#ob").value

     })
    }
   );


   await L()

  }catch(e){

   alert(e.message)
  }
 }
}


window.NI=()=>FI();


window.EI=id=>

 FI(
  I.find(
   x=>N(x.id)==id
  )
 );


window.DI=async id=>{

 if(
  confirm(
   "Excluir este insumo?"
  )
 ){

  try{

   await A(

    "/api/insumos/"+id,

    {
     method:"DELETE"
    }
   );

   await L()

  }catch(e){

   alert(e.message)
  }
 }
};


/* =========================
   SINCRONIZA FICHA
========================= */

function sync(){

 if(!D)return;


 let campos={

  nome_prato:"fn",

  rendimento_kg:"re",

  porcoes:"po",

  preco_venda:"pv",

  modo_preparo:"pr",

  observacoes:"fob",

  status:"st",

  categoria:"ca"
 };


 Object.keys(campos)
  .forEach(k=>{

   let e=
    $("#"+campos[k]);

   if(e)
    D[k]=e.value
  })
}


/* =========================
   CÁLCULOS DA FICHA
========================= */

function totals(){

 let total=
  D.itens.reduce(
   (s,x)=>
    s+N(x.custo),
   0
  );


 let por=
  N(D.porcoes)||1;


 let cp=
  total/por;


 let pv=
  N(D.preco_venda);


 let rendimento=
  N(D.rendimento_kg);


 let pesoPorcao=
  por>0
   ?rendimento/por
   :0;


 let cmv=
  pv>0
   ?(cp/pv)*100
   :0;


 let meta=
  cp>0
   ?cp/.30
   :0;


 return{

  total,

  cp,

  cmv,

  meta,

  peso:pesoPorcao

 }
}


/* =========================
   EDITOR DA FICHA
========================= */

function ED(){

 let z=totals();


 C.innerHTML=`

 <h2>
  ${D.id?"Editar":"Nova"}
  ficha técnica
 </h2>


 <div class="card form">


  <input
   id="fn"
   placeholder="Nome do prato"
   value="${E(D.nome_prato||"")}">


  <select id="ca">

   ${
    CAT.map(x=>`

     <option
      ${D.categoria==x?"selected":""}>

      ${x}

     </option>

    `).join("")
   }

  </select>


  <input
   id="re"
   type="number"
   step=".001"
   placeholder="Peso total / rendimento da receita (kg)"
   value="${D.rendimento_kg||""}">


  <input
   id="po"
   type="number"
   min="1"
   step="1"
   placeholder="Quantidade de porções"
   value="${D.porcoes||1}">


  <div class="muted">

   Peso total da receita:
   <b id="pesototal">

    ${N(D.rendimento_kg)
      .toLocaleString(
       "pt-BR",
       {
        minimumFractionDigits:3,
        maximumFractionDigits:3
       }
      )}
    kg

   </b>

  </div>


  <div class="muted">

   Peso total da porção:
   <b id="pp">
    ${PG(z.peso)}
   </b>

  </div>

 </div>


 <div class="card">

  <h3>
   Composição da ficha
  </h3>


  ${
   I.length
   ?`

    <div class="form">


     <select id="si">

      ${
       I.map(i=>`

        <option
         value="${i.id}">

         ${COD(i.id)}
         · ${E(i.ingrediente)}
         · ${M(i.preco_real)}
         /${E(i.unidade)}

        </option>

       `).join("")
      }

     </select>


     <input
      id="qt"
      type="number"
      step=".001"
      placeholder="Peso líquido / quantidade utilizada">


     <select id="iu">

      ${
       U.map(x=>`

        <option>
         ${x}
        </option>

       `).join("")
      }

     </select>


     <input
      id="io"
      placeholder="Observação do ingrediente">


     <button
      class="secondary wide"
      id="ai">

      + Adicionar ingrediente

     </button>

    </div>

   `
   :`

    <p class="muted">
     Cadastre primeiro os insumos.
    </p>

   `
  }


  ${
   D.itens.map((x,n)=>{

    let i=
     I.find(
      a=>
       N(a.id)==
       N(x.insumo_id)
     )||{};


    let pb=
     N(x.qtd)*
     N(i.fc||1);


    let percentual=
     z.total>0
      ?N(x.custo)/
       z.total*100
      :0;


    return`

    <div class="ingredient">


     <div class="row">

      <b>
       ${E(x.nome)}
      </b>


      <button
       class="danger"
       onclick="RI(${n})">

       ×

      </button>

     </div>


     <div class="muted">

      ${COD(x.insumo_id)}

      · P. líq.
      ${N(x.qtd)}
      ${E(x.unidade)}

      · FC
      ${N(i.fc||1).toFixed(3)}

      · P. bruto
      ${pb.toFixed(3)}
      ${E(x.unidade)}

     </div>


     <div class="muted">

      Compra
      ${M(i.preco_compra)}
      /${E(i.unidade||"")}

      · Preço real
      ${M(i.preco_real)}
      /${E(i.unidade||"")}

     </div>


     <div class="muted">

      Custo do insumo:
      <b>
       ${M(x.custo)}
      </b>

      · % do custo:
      <b>
       ${P(percentual)}
      </b>

     </div>


     ${
      x.observacao
      ?`

       <small>
        ${E(x.observacao)}
       </small>

      `
      :""
     }

    </div>

    `
   }).join("")
  }

 </div>
 /* =========================
   RESUMO DA FICHA
========================= */

 C.innerHTML+=`

 <div class="card">

  <h3>
   Resumo da Ficha
  </h3>


  <div class="row mobile">


   <span>

    Peso total da receita

    <b id="respesototal">

     ${N(D.rendimento_kg)
       .toLocaleString(
        "pt-BR",
        {
         minimumFractionDigits:3,
         maximumFractionDigits:3
        }
       )}
     kg

    </b>

   </span>


   <span>

    Porções

    <b id="resporcoes">
     ${N(D.porcoes)||1}
    </b>

   </span>


   <span>

    Peso total da porção

    <b id="pesopor">
     ${PG(z.peso)}
    </b>

   </span>


   <span>

    Custo total

    <b>
     ${M(z.total)}
    </b>

   </span>


   <span>

    Custo por porção

    <b>
     ${M(z.cp)}
    </b>

   </span>

  </div>


  <div class="form">


   <input
    id="pv"
    type="number"
    step=".01"
    placeholder="Preço de venda por porção (R$)"
    value="${D.preco_venda||""}">


   <div>

    Preço de venda:

    <b id="vendav">
     ${M(D.preco_venda)}
    </b>

   </div>


   <div>

    CMV:

    <b
     id="cmvp"
     class="${K(z.cmv)}">

     ${P(z.cmv)}

    </b>

   </div>


   <div>

    Preço sugerido para
    CMV de 30%:

    <b id="meta">

     ${M(z.meta)}

    </b>

   </div>

  </div>

 </div>


 <div class="card form">


  <select id="st">

   ${
    [
     "Rascunho",
     "Ativa",
     "Inativa"
    ].map(x=>`

     <option
      ${D.status==x?"selected":""}>

      ${x}

     </option>

    `).join("")
   }

  </select>


  <textarea
   id="pr"
   placeholder="Modo de preparo">${E(D.modo_preparo||"")}</textarea>


  <textarea
   id="fob"
   placeholder="Observações gerais">${E(D.observacoes||"")}</textarea>


  <button
   class="primary wide"
   id="sf">

   Salvar ficha completa

  </button>

 </div>
 `;


/* =========================
   CÁLCULO AO VIVO
========================= */

 function live(){

  D.porcoes=
   $("#po").value;

  D.rendimento_kg=
   $("#re").value;

  D.preco_venda=
   $("#pv").value;


  let a=totals();


  $("#pesototal").textContent=

   N(D.rendimento_kg)
    .toLocaleString(
     "pt-BR",
     {
      minimumFractionDigits:3,
      maximumFractionDigits:3
     }
    )+
   " kg";


  $("#respesototal").textContent=

   N(D.rendimento_kg)
    .toLocaleString(
     "pt-BR",
     {
      minimumFractionDigits:3,
      maximumFractionDigits:3
     }
    )+
   " kg";


  $("#resporcoes").textContent=
   N(D.porcoes)||1;


  $("#pp").textContent=
   PG(a.peso);


  $("#pesopor").textContent=
   PG(a.peso);


  $("#vendav").textContent=
   M(D.preco_venda);


  $("#cmvp").textContent=
   P(a.cmv);


  $("#cmvp").className=
   K(a.cmv);


  $("#meta").textContent=
   M(a.meta)
 }


 ["#po","#re","#pv"]
  .forEach(s=>

   $(s).oninput=live
  );


/* =========================
   ADICIONAR INGREDIENTE
========================= */

 if($("#si")){


  $("#iu").value=
   DU(
    I.find(
     x=>
      String(x.id)==
      $("#si").value
    )?.unidade
   );


  $("#si").onchange=()=>{

   $("#iu").value=
    DU(
     I.find(
      x=>
       String(x.id)==
       $("#si").value
     )?.unidade
    )
  };


  $("#ai").onclick=()=>{

   sync();


   let i=
    I.find(
     x=>
      String(x.id)==
      $("#si").value
    );


   let q=
    N($("#qt").value);


   let u=
    $("#iu").value;


   if(!i||q<=0){

    alert(
     "Informe o ingrediente e a quantidade."
    );

    return
   }


   D.itens.push({

    insumo_id:
     i.id,

    nome:
     i.ingrediente,

    qtd:q,

    unidade:u,

    custo:
     CV(
      q,
      u,
      i.unidade
     )*
     N(i.preco_real),

    observacao:
     $("#io").value
   });


   ED()
  }
 }


 $("#sf").onclick=SAVE
}


/* =========================
   REMOVER INGREDIENTE
========================= */

window.RI=n=>{

 sync();

 D.itens.splice(n,1);

 ED()
};


/* =========================
   NOVA FICHA
========================= */

window.NF=()=>{

 D={

  itens:[],

  categoria:
   "Prato Principal",

  porcoes:1,

  status:"Ativa"

 };

 ED()
};


window.novaFicha=
 window.NF;


/* =========================
   EDITAR FICHA COMPLETA
========================= */

window.EF=async id=>{

 try{

  let f=
   await A(
    "/api/fichas/"+id
   );


  D={

   ...f,


   itens:
    f.ingredientes.map(
     x=>({

      id:
       x.id,

      insumo_id:
       x.insumo_id,

      nome:
       x.ingrediente,

      qtd:
       N(x.quantidade),

      unidade:
       x.unidade,

      custo:
       N(x.custo_item),

      observacao:
       x.observacoes||""

     })
    ),


   orig:
    f.ingredientes.map(
     x=>x.id
    )
  };


  ED()

 }catch(e){

  alert(e.message)
 }
};


/* =========================
   SALVAR FICHA
========================= */

async function SAVE(){

 try{

  sync();


  if(
   !D.nome_prato.trim()
  ){

   alert(
    "Informe o nome do prato."
   );

   return
  }


  if(
   N(D.porcoes)<=0
  ){

   alert(
    "Informe uma quantidade de porções válida."
   );

   return
  }


  let body={

   nome_prato:
    D.nome_prato,

   categoria:
    D.categoria,

   rendimento_kg:
    D.rendimento_kg,

   porcoes:
    D.porcoes,

   preco_venda:
    D.preco_venda,

   status:
    D.status,

   modo_preparo:
    D.modo_preparo,

   observacoes:
    D.observacoes
  };


  let f;


  if(D.id){

   f=await A(

    "/api/fichas/"+
    D.id,

    {

     method:"PUT",

     body:
      JSON.stringify(body)

    }
   );


   for(
    let id
    of(D.orig||[])
   ){

    await A(

     "/api/ingredientes/"+
     id,

     {
      method:"DELETE"
     }
    )
   }

  }else{

   f=await A(

    "/api/fichas",

    {

     method:"POST",

     body:
      JSON.stringify(body)

    }
   )
  }


  for(
   let [n,x]
   of D.itens.entries()
  ){

   await A(

    "/api/fichas/"+
    f.id+
    "/ingredientes",

    {

     method:"POST",

     body:
      JSON.stringify({

       insumo_id:
        x.insumo_id,

       quantidade:
        x.qtd,

       unidade:
        x.unidade,

       ordem:n,

       observacoes:
        x.observacao||""

      })
    }
   )
  }


  D=null;

  T="fichas";

  await L()

 }catch(e){

  alert(e.message)
 }
}


/* =========================
   EXCLUIR FICHA
========================= */

window.DF=async id=>{

 if(
  confirm(
   "Excluir esta ficha e seus ingredientes?"
  )
 ){

  try{

   await A(

    "/api/fichas/"+id,

    {
     method:"DELETE"
    }
   );


   await L()

  }catch(e){

   alert(e.message)
  }
 }
};


/* =========================
   VISUALIZAR FICHA
========================= */

window.OF=async id=>{

 try{

  let f=
   await A(
    "/api/fichas/"+id
   );


  let z={

   total:
    N(f.custo_total),

   cp:
    N(f.custo_por_porcao),

   cmv:
    N(f.cmv_percentual),

   meta:
    N(f.custo_por_porcao)/.30,

   peso:
    N(f.peso_por_porcao)

  };


  C.innerHTML=`

  <div class="row">


   <h2>
    ${E(f.nome_prato)}
   </h2>


   <button
    class="secondary"
    onclick="R()">

    Voltar

   </button>

  </div>


  <div class="card">

   <h3>
    Rendimento
   </h3>


   <div class="row mobile">


    <span>

     Peso total da receita

     <b>

      ${N(f.rendimento_kg)
        .toLocaleString(
         "pt-BR",
         {
          minimumFractionDigits:3,
          maximumFractionDigits:3
         }
        )}
      kg

     </b>

    </span>


    <span>

     Porções

     <b>
      ${N(f.porcoes)}
     </b>

    </span>


    <span>

     Peso total da porção

     <b>
      ${PG(z.peso)}
     </b>

    </span>

   </div>

  </div>


  <div class="card">

   <h3>
    Ingredientes
   </h3>


   ${
    f.ingredientes.map(x=>{

     let i=
      I.find(
       a=>
        N(a.id)==
        N(x.insumo_id)
      )||{};


     let pb=
      N(x.quantidade)*
      N(i.fc||1);


     let percentual=
      z.total>0
       ?N(x.custo_item)/
        z.total*100
       :0;


     return`

     <div class="ingredient">


      <b>
       ${E(x.ingrediente)}
      </b>


      <div class="muted">

       ${COD(x.insumo_id)}

       · P. líq.
       ${N(x.quantidade)}
       ${E(x.unidade)}

       · FC
       ${N(i.fc||1).toFixed(3)}

       · P. bruto
       ${pb.toFixed(3)}
       ${E(x.unidade)}

      </div>


      <div class="muted">

       Compra
       ${M(i.preco_compra)}

       · Real
       ${M(i.preco_real)}

       · Custo
       <b>
        ${M(x.custo_item)}
       </b>

       · % custo
       <b>
        ${P(percentual)}
       </b>

      </div>

     </div>

     `
    }).join("")
   }

  </div>


  <div class="card">

   <h3>
    Resumo de Custos
   </h3>


   <div class="row mobile">


    <span>

     Custo total

     <b>
      ${M(z.total)}
     </b>

    </span>


    <span>

     Custo por porção

     <b>
      ${M(z.cp)}
     </b>

    </span>


    <span>

     Preço de venda

     <b>
      ${M(f.preco_venda)}
     </b>

    </span>


    <span>

     CMV

     <b class="${K(z.cmv)}">

      ${P(z.cmv)}

     </b>

    </span>


    <span>

     Preço para CMV 30%

     <b>
      ${M(z.meta)}
     </b>

    </span>

   </div>

  </div>


  <div class="card">

   <h3>
    Modo de preparo
   </h3>

   <p>
    ${E(
     f.modo_preparo||"—"
    )}
   </p>

  </div>


  <div class="actions">

   <button
    class="primary"
    onclick="EF(${f.id})">

    Editar ficha completa

   </button>

  </div>
  `

 }catch(e){

  C.innerHTML=

   '<div class="error">'+
   E(e.message)+
   '</div>'
 }
};


/* =========================
   NAVEGAÇÃO
========================= */

document
 .querySelectorAll(
  "nav button"
 )
 .forEach(b=>{

  b.onclick=()=>{

   T=b.dataset.tab;

   D=null;

   R()
  }
 });


L();
