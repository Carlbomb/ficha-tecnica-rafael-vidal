/* MISEVO — Preparações / Sub-receitas — Fase 2 */
(() => {
  const C=document.querySelector("#content");
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const moeda=v=>num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const numero=(v,c=3)=>num(v).toLocaleString("pt-BR",{minimumFractionDigits:c,maximumFractionDigits:c});
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let PREPS=[],INSUMOS=[],ITENS=[],EDITANDO=null;

  async function apiSR(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=r.status===204?null:await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Não foi possível concluir a operação.");return d}
  async function carregar(){[PREPS,INSUMOS]=await Promise.all([apiSR("/api/preparacoes"),apiSR("/api/insumos")]);window.PREPARACOES_PUBLIC=PREPS}

  window.telaPreparacoes=async function(){C.innerHTML='<div class="card">Carregando preparações...</div>';try{await carregar();renderLista()}catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}};

  function renderLista(){
    C.innerHTML=`<div class="section-head"><div><small>FICHAS TÉCNICAS</small><h2>Preparações / Sub-receitas</h2><p>Bases, molhos, caldos e pré-preparos reutilizáveis. O custo acompanha automaticamente os insumos e sub-receitas.</p></div><button class="primary" id="novaPrep">+ Nova preparação</button></div>
    <div class="card"><input id="buscaPrep" placeholder="Buscar preparação ou categoria..."><div id="listaPrep" style="margin-top:12px"></div></div>`;
    document.querySelector("#novaPrep").onclick=()=>form();document.querySelector("#buscaPrep").oninput=listar;listar();
  }
  function listar(){
    const q=(document.querySelector("#buscaPrep")?.value||"").toLowerCase(),a=PREPS.filter(p=>(p.nome+" "+(p.categoria||"")).toLowerCase().includes(q));
    document.querySelector("#listaPrep").innerHTML=!a.length?'<div class="empty">Nenhuma preparação cadastrada.</div>':`<div class="table-wrap"><table><thead><tr><th>Preparação</th><th>Categoria</th><th>Rendimento</th><th>Unid.</th><th>Custo Total</th><th>Custo/Unid.</th><th></th></tr></thead><tbody>${a.map(p=>`<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria||"—")}</td><td>${numero(p.rendimento,4)}</td><td>${esc(p.unidade_rendimento)}</td><td>${moeda(p.custo_total)}</td><td><b>${moeda(p.custo_unitario)}</b></td><td><button onclick="editarPreparacao(${p.id})">Abrir</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  window.editarPreparacao=async id=>{try{const p=await apiSR(`/api/preparacoes/${id}`);EDITANDO=p;ITENS=[...(p.ingredientes||[]).map(x=>({tipo:"insumo",id:Number(x.insumo_id),quantidade:num(x.quantidade),observacoes:x.observacoes||""})),...(p.componentes||[]).map(x=>({tipo:"preparacao",id:Number(x.componente_id),quantidade:num(x.quantidade),observacoes:x.observacoes||""}))];await carregar();form(p)}catch(e){alert(e.message)}};

  function form(p=null){
    EDITANDO=p;if(!p)ITENS=[];
    C.innerHTML=`<div class="section-head"><div><small>SUB-RECEITA</small><h2>${p?esc(p.nome):"Nova Preparação"}</h2><p>Use insumos e também outras preparações como componentes.</p></div><button class="secondary" id="voltarPrep">← Voltar</button></div>
    <form id="formPrep"><div class="card form-grid">
    <label>Nome da preparação<input id="prepNome" required value="${esc(p?.nome||"")}"></label>
    <label>Categoria<select id="prepCategoria">${["Base","Molho","Caldo","Pré-preparo","Massa","Recheio","Outros"].map(x=>`<option ${p?.categoria===x?"selected":""}>${x}</option>`).join("")}</select></label>
    <label>Rendimento final<input id="prepRendimento" type="number" min=".0001" step=".0001" required value="${p?.rendimento??1}"></label>
    <label>Unidade do rendimento<select id="prepUnidade">${["KG","L","UN"].map(x=>`<option ${p?.unidade_rendimento===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
    <div class="card"><div class="section-head"><div><small>COMPOSIÇÃO</small><h3>Ingredientes e preparações</h3></div><button type="button" class="primary" id="addPrepItem">+ Componente</button></div><div id="prepItens"></div></div>
    <div class="card"><div class="summary-grid"><div><span>Custo Total</span><strong id="prepCustoTotal">R$ 0,00</strong></div><div><span>Custo por unidade</span><strong id="prepCustoUnit">R$ 0,00</strong></div><div><span>Rendimento</span><strong id="prepRendResumo">0</strong></div></div></div>
    <div class="card"><label>Modo de preparo<textarea id="prepModo">${esc(p?.modo_preparo||"")}</textarea></label><label style="margin-top:13px">Observações<textarea id="prepObs">${esc(p?.observacoes||"")}</textarea></label></div>
    <div class="actions"><button type="button" class="secondary" id="cancelPrep">Cancelar</button>${p?'<button type="button" class="danger" id="delPrep">Excluir</button>':""}<button class="primary" type="submit">Salvar preparação</button></div></form>`;
    document.querySelector("#voltarPrep").onclick=window.telaPreparacoes;document.querySelector("#cancelPrep").onclick=window.telaPreparacoes;
    document.querySelector("#addPrepItem").onclick=()=>{ITENS.push({tipo:"insumo",id:"",quantidade:0,observacoes:""});renderItens()};
    document.querySelector("#prepRendimento").oninput=calcular;document.querySelector("#prepUnidade").onchange=calcular;document.querySelector("#formPrep").onsubmit=salvar;if(p)document.querySelector("#delPrep").onclick=excluir;renderItens();
  }

  function fonte(it){
    if(it.tipo==="preparacao")return PREPS.find(x=>Number(x.id)===Number(it.id));
    return INSUMOS.find(x=>Number(x.id)===Number(it.id));
  }
  function preco(it){const x=fonte(it);return it.tipo==="preparacao"?num(x?.custo_unitario):num(x?.preco_real)}
  function unidade(it){const x=fonte(it);return it.tipo==="preparacao"?(x?.unidade_rendimento||"—"):(x?.unidade||"—")}

  function renderItens(){
    const area=document.querySelector("#prepItens");if(!area)return;
    if(!ITENS.length){area.innerHTML='<div class="empty">Adicione insumos ou preparações.</div>';calcular();return}
    area.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Componente</th><th>Quantidade</th><th>Unid.</th><th>Custo/Unid.</th><th>Custo</th><th>Observação</th><th></th></tr></thead><tbody>
    ${ITENS.map((it,k)=>`<tr data-prep-row="${k}">
      <td><select onchange="prepTipo(${k},this.value)"><option value="insumo" ${it.tipo==="insumo"?"selected":""}>Insumo</option><option value="preparacao" ${it.tipo==="preparacao"?"selected":""}>Preparação</option></select></td>
      <td><select onchange="prepFonte(${k},this.value)"><option value="">Selecione...</option>${(it.tipo==="preparacao"?PREPS.filter(x=>!EDITANDO||Number(x.id)!==Number(EDITANDO.id)):INSUMOS.filter(x=>x.ativo!==false)).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(it.id)?"selected":""}>${esc(it.tipo==="preparacao"?x.nome:x.ingrediente)}</option>`).join("")}</select></td>
      <td><input class="prep-qtd" type="number" inputmode="decimal" min="0" step="0.0001" value="${it.quantidade||""}" oninput="prepQtd(${k},this.value)"></td>
      <td>${esc(unidade(it))}</td><td>${moeda(preco(it))}</td><td><b data-custo-item>${moeda(num(it.quantidade)*preco(it))}</b></td>
      <td><input value="${esc(it.observacoes)}" oninput="prepObsItem(${k},this.value)"></td><td><button type="button" class="danger" onclick="prepRemover(${k})">×</button></td></tr>`).join("")}</tbody></table></div>`;calcular();
  }
  window.prepTipo=(k,v)=>{ITENS[k].tipo=v;ITENS[k].id="";renderItens()};
  window.prepFonte=(k,v)=>{ITENS[k].id=v?Number(v):"";renderItens()};
  window.prepQtd=(k,v)=>{
    ITENS[k].quantidade=num(String(v).replace(",","."));
    atualizarTotaisLinha(k);
    calcular();
  };
  function atualizarTotaisLinha(k){
    const row=document.querySelector(`[data-prep-row="${k}"]`);
    if(!row)return;
    const custo=row.querySelector("[data-custo-item]");
    if(custo)custo.textContent=moeda(num(ITENS[k].quantidade)*preco(ITENS[k]));
  }
  window.prepObsItem=(k,v)=>ITENS[k].observacoes=v;
  window.prepRemover=k=>{ITENS.splice(k,1);renderItens()};

  function calcular(){const total=ITENS.reduce((s,it)=>s+num(it.quantidade)*preco(it),0),r=num(document.querySelector("#prepRendimento")?.value);if(document.querySelector("#prepCustoTotal"))document.querySelector("#prepCustoTotal").textContent=moeda(total);if(document.querySelector("#prepCustoUnit"))document.querySelector("#prepCustoUnit").textContent=moeda(r>0?total/r:0);if(document.querySelector("#prepRendResumo"))document.querySelector("#prepRendResumo").textContent=`${numero(r,4)} ${document.querySelector("#prepUnidade")?.value||""}`}

  async function salvar(e){
    e.preventDefault();
    const validos=ITENS.filter(x=>x.id&&x.quantidade>0);
    if(!validos.length)return alert("Adicione pelo menos um componente.");
    const payload={nome:document.querySelector("#prepNome").value.trim(),categoria:document.querySelector("#prepCategoria").value,rendimento:num(document.querySelector("#prepRendimento").value),unidade_rendimento:document.querySelector("#prepUnidade").value,modo_preparo:document.querySelector("#prepModo").value.trim(),observacoes:document.querySelector("#prepObs").value.trim(),
      ingredientes:validos.filter(x=>x.tipo==="insumo").map(x=>({insumo_id:x.id,quantidade:x.quantidade,observacoes:x.observacoes})),
      componentes:validos.filter(x=>x.tipo==="preparacao").map(x=>({preparacao_id:x.id,quantidade:x.quantidade,observacoes:x.observacoes}))};
    try{await apiSR(EDITANDO?`/api/preparacoes/${EDITANDO.id}`:"/api/preparacoes",{method:EDITANDO?"PUT":"POST",body:JSON.stringify(payload)});await window.telaPreparacoes()}catch(e){alert(e.message)}
  }
  async function excluir(){if(!EDITANDO||!confirm(`Excluir "${EDITANDO.nome}"?`))return;try{await apiSR(`/api/preparacoes/${EDITANDO.id}`,{method:"DELETE"});await window.telaPreparacoes()}catch(e){alert(e.message)}}
})();