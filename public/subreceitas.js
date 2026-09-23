/* MISEVO — Preparações / Sub-receitas */
(() => {
  const C = document.querySelector("#content");
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const moeda = v => num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const numero = (v,c=3) => num(v).toLocaleString("pt-BR",{minimumFractionDigits:c,maximumFractionDigits:c});
  const esc = v => String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let PREPS=[], ITENS=[], EDITANDO=null;

  async function apiSR(url,opt={}) {
    const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});
    const d=r.status===204?null:await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error||"Não foi possível concluir a operação.");
    return d;
  }

  async function carregar(){ PREPS=await apiSR("/api/preparacoes"); }

  window.telaPreparacoes=async function(){
    C.innerHTML='<div class="card">Carregando preparações...</div>';
    try{await carregar(); renderLista();}catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}
  };

  function renderLista(){
    C.innerHTML=`
      <div class="section-head"><div><small>FICHAS TÉCNICAS</small><h2>Preparações / Sub-receitas</h2><p>Cadastre bases, molhos, caldos e pré-preparos reutilizáveis em outras receitas.</p></div>
      <button class="primary" id="novaPrep">+ Nova preparação</button></div>
      <div class="card"><input id="buscaPrep" placeholder="Buscar preparação ou categoria..."><div id="listaPrep" style="margin-top:12px"></div></div>`;
    document.querySelector("#novaPrep").onclick=()=>form();
    document.querySelector("#buscaPrep").oninput=listar;
    listar();
  }

  function listar(){
    const q=(document.querySelector("#buscaPrep")?.value||"").toLowerCase();
    const a=PREPS.filter(p=>(p.nome+" "+(p.categoria||"")).toLowerCase().includes(q));
    document.querySelector("#listaPrep").innerHTML=!a.length?'<div class="empty">Nenhuma preparação cadastrada.</div>':`
      <div class="table-wrap"><table><thead><tr><th>Preparação</th><th>Categoria</th><th>Rendimento</th><th>Unid.</th><th>Custo Total</th><th>Custo/Unid.</th><th></th></tr></thead><tbody>
      ${a.map(p=>`<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria||"—")}</td><td>${numero(p.rendimento,4)}</td><td>${esc(p.unidade_rendimento)}</td><td>${moeda(p.custo_total)}</td><td><b>${moeda(p.custo_unitario)}</b></td><td><button onclick="editarPreparacao(${p.id})">Abrir</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }

  window.editarPreparacao=async id=>{
    try{
      const p=await apiSR(`/api/preparacoes/${id}`); EDITANDO=p;
      ITENS=(p.ingredientes||[]).map(x=>({insumo_id:Number(x.insumo_id),quantidade:num(x.quantidade),observacoes:x.observacoes||""}));
      form(p);
    }catch(e){alert(e.message)}
  };

  function form(p=null){
    EDITANDO=p; if(!p) ITENS=[];
    C.innerHTML=`
      <div class="section-head"><div><small>SUB-RECEITA</small><h2>${p?esc(p.nome):"Nova Preparação"}</h2><p>O custo é recalculado a partir dos preços atuais dos insumos.</p></div><button class="secondary" id="voltarPrep">← Voltar</button></div>
      <form id="formPrep">
      <div class="card form-grid">
        <label>Nome da preparação<input id="prepNome" required value="${esc(p?.nome||"")}"></label>
        <label>Categoria<select id="prepCategoria">${["Base","Molho","Caldo","Pré-preparo","Massa","Recheio","Outros"].map(x=>`<option ${p?.categoria===x?"selected":""}>${x}</option>`).join("")}</select></label>
        <label>Rendimento final<input id="prepRendimento" type="number" min=".0001" step=".0001" required value="${p?.rendimento??1}"></label>
        <label>Unidade do rendimento<select id="prepUnidade">${["KG","L","UN"].map(x=>`<option ${p?.unidade_rendimento===x?"selected":""}>${x}</option>`).join("")}</select></label>
      </div>
      <div class="card"><div class="section-head"><div><small>COMPOSIÇÃO</small><h3>Ingredientes</h3></div><button type="button" class="primary" id="addPrepItem">+ Ingrediente</button></div><div id="prepItens"></div></div>
      <div class="card"><div class="summary-grid"><div><span>Custo Total</span><strong id="prepCustoTotal">R$ 0,00</strong></div><div><span>Custo por unidade</span><strong id="prepCustoUnit">R$ 0,00</strong></div><div><span>Rendimento</span><strong id="prepRendResumo">0</strong></div></div></div>
      <div class="card"><label>Modo de preparo<textarea id="prepModo">${esc(p?.modo_preparo||"")}</textarea></label><label style="margin-top:13px">Observações<textarea id="prepObs">${esc(p?.observacoes||"")}</textarea></label></div>
      <div class="actions"><button type="button" class="secondary" id="cancelPrep">Cancelar</button>${p?'<button type="button" class="danger" id="delPrep">Excluir</button>':""}<button class="primary" type="submit">Salvar preparação</button></div>
      </form>`;
    document.querySelector("#voltarPrep").onclick=window.telaPreparacoes;
    document.querySelector("#cancelPrep").onclick=window.telaPreparacoes;
    document.querySelector("#addPrepItem").onclick=()=>{ITENS.push({insumo_id:"",quantidade:0,observacoes:""}); renderItens()};
    document.querySelector("#prepRendimento").oninput=calcular;
    document.querySelector("#formPrep").onsubmit=salvar;
    if(p) document.querySelector("#delPrep").onclick=excluir;
    renderItens();
  }

  function insumo(id){return (window.INSUMOS_PUBLIC||[]).find(i=>Number(i.id)===Number(id))}
  async function garantirInsumos(){
    if(!window.INSUMOS_PUBLIC) window.INSUMOS_PUBLIC=await apiSR("/api/insumos");
  }
  async function renderItens(){
    await garantirInsumos();
    const area=document.querySelector("#prepItens"); if(!area)return;
    if(!ITENS.length){area.innerHTML='<div class="empty">Adicione os ingredientes da preparação.</div>';calcular();return}
    area.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Quantidade</th><th>Unid.</th><th>Preço Real</th><th>Custo</th><th>Observação</th><th></th></tr></thead><tbody>
      ${ITENS.map((it,k)=>{const i=insumo(it.insumo_id);return `<tr><td><select onchange="prepInsumo(${k},this.value)"><option value="">Selecione...</option>${window.INSUMOS_PUBLIC.filter(x=>x.ativo!==false).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(it.insumo_id)?"selected":""}>${esc(x.ingrediente)}</option>`).join("")}</select></td><td><input type="number" min="0" step=".0001" value="${it.quantidade||""}" oninput="prepQtd(${k},this.value)"></td><td>${esc(i?.unidade||"—")}</td><td>${moeda(i?.preco_real)}</td><td><b>${moeda(num(it.quantidade)*num(i?.preco_real))}</b></td><td><input value="${esc(it.observacoes)}" oninput="prepObsItem(${k},this.value)"></td><td><button type="button" class="danger" onclick="prepRemover(${k})">×</button></td></tr>`}).join("")}
      </tbody></table></div>`; calcular();
  }
  window.prepInsumo=(k,v)=>{ITENS[k].insumo_id=v?Number(v):"";renderItens()};
  window.prepQtd=(k,v)=>{ITENS[k].quantidade=num(v);renderItens()};
  window.prepObsItem=(k,v)=>ITENS[k].observacoes=v;
  window.prepRemover=k=>{ITENS.splice(k,1);renderItens()};

  function calcular(){
    const total=ITENS.reduce((s,it)=>s+num(it.quantidade)*num(insumo(it.insumo_id)?.preco_real),0);
    const r=num(document.querySelector("#prepRendimento")?.value);
    if(document.querySelector("#prepCustoTotal"))document.querySelector("#prepCustoTotal").textContent=moeda(total);
    if(document.querySelector("#prepCustoUnit"))document.querySelector("#prepCustoUnit").textContent=moeda(r>0?total/r:0);
    if(document.querySelector("#prepRendResumo"))document.querySelector("#prepRendResumo").textContent=`${numero(r,4)} ${document.querySelector("#prepUnidade")?.value||""}`;
  }

  async function salvar(e){
    e.preventDefault();
    const payload={nome:document.querySelector("#prepNome").value.trim(),categoria:document.querySelector("#prepCategoria").value,rendimento:num(document.querySelector("#prepRendimento").value),unidade_rendimento:document.querySelector("#prepUnidade").value,modo_preparo:document.querySelector("#prepModo").value.trim(),observacoes:document.querySelector("#prepObs").value.trim(),ingredientes:ITENS.filter(x=>x.insumo_id&&x.quantidade>0)};
    if(!payload.ingredientes.length)return alert("Adicione pelo menos um ingrediente.");
    try{await apiSR(EDITANDO?`/api/preparacoes/${EDITANDO.id}`:"/api/preparacoes",{method:EDITANDO?"PUT":"POST",body:JSON.stringify(payload)});await window.telaPreparacoes()}catch(e){alert(e.message)}
  }
  async function excluir(){
    if(!EDITANDO||!confirm(`Excluir "${EDITANDO.nome}"?`))return;
    try{await apiSR(`/api/preparacoes/${EDITANDO.id}`,{method:"DELETE"});await window.telaPreparacoes()}catch(e){alert(e.message)}
  }
})();