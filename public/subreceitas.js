/* MISEVO — Preparações / Sub-receitas — Fase 2 */
(() => {
  const C=document.querySelector("#content");
  const num=v=>{const s=String(v??"").trim().replace(/\s/g,"");const n=Number(s.includes(",")?s.replace(/\./g,"").replace(",","."):s);return Number.isFinite(n)?n:0};
  const moeda=v=>num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const numero=(v,c=3)=>num(v).toLocaleString("pt-BR",{minimumFractionDigits:c,maximumFractionDigits:c});
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let PREPS=[],INSUMOS=[],ITENS=[],EDITANDO=null,BASE_ESCALA=null;

  async function apiSR(url,opt={}){const r=await fetch(url,{cache:"no-store",...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});const d=r.status===204?null:await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Não foi possível concluir a operação.");return d}
  async function carregar(){[PREPS,INSUMOS]=await Promise.all([apiSR("/api/preparacoes"),apiSR("/api/insumos")]);window.PREPARACOES_PUBLIC=PREPS}

  window.telaPreparacoes=async function(){C.innerHTML='<div class="card">Carregando preparações...</div>';try{await carregar();renderLista()}catch(e){C.innerHTML=`<div class="card"><h3>Erro</h3><p>${esc(e.message)}</p></div>`}};

  function renderLista(){
    C.innerHTML=`<div class="section-head"><div><small>FICHAS TÉCNICAS · EXPERIMENTAL</small><h2>Preparações / Sub-receitas</h2><p>Bases, molhos, caldos e pré-preparos reutilizáveis. O custo acompanha automaticamente os insumos e sub-receitas.</p></div><button class="primary" id="novaPrep">+ Nova preparação</button></div>
    <div class="card preparacoes-card"><div class="preparacoes-toolbar"><input id="buscaPrep" placeholder="Buscar preparação ou categoria..."><select id="filtroPrepCategoria"><option value="">Todas as categorias</option></select><select id="ordemPrep"><option value="az">A–Z</option><option value="custo">Maior custo</option><option value="rendimento">Maior rendimento</option></select></div><div id="listaPrep"></div></div>`;
    const cats=[...new Set(PREPS.map(p=>p.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    document.querySelector("#filtroPrepCategoria").insertAdjacentHTML("beforeend",cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(""));
    document.querySelector("#novaPrep").onclick=()=>form();
    ["#buscaPrep","#filtroPrepCategoria","#ordemPrep"].forEach(sel=>{const el=document.querySelector(sel);if(el)el.oninput=listar});
    listar();
  }
  function listar(){
    const q=(document.querySelector("#buscaPrep")?.value||"").trim().toLowerCase();
    const cat=document.querySelector("#filtroPrepCategoria")?.value||"";
    const ordem=document.querySelector("#ordemPrep")?.value||"az";
    let a=PREPS.filter(p=>(p.nome+" "+(p.categoria||"")).toLowerCase().includes(q)&&(!cat||p.categoria===cat));
    a=[...a].sort((x,y)=>ordem==="custo"?num(y.custo_total)-num(x.custo_total):ordem==="rendimento"?num(y.rendimento)-num(x.rendimento):String(x.nome).localeCompare(String(y.nome),"pt-BR"));
    const area=document.querySelector("#listaPrep");
    if(!a.length){area.innerHTML='<div class="empty">Nenhuma preparação encontrada.</div>';return}
    area.innerHTML=`<div class="preparacoes-count">${a.length} preparaç${a.length===1?"ão":"ões"}</div><div class="preparacoes-compactas">${a.map(p=>`
      <article class="preparacao-row">
        <div class="preparacao-main"><b>${esc(p.nome)}</b><span>${esc(p.categoria||"Sem categoria")} · ${numero(p.rendimento,3)} ${esc(p.unidade_rendimento||"")}</span></div>
        <div class="preparacao-cost"><small>Custo total</small><b>${moeda(p.custo_total)}</b><span>${moeda(p.custo_unitario)}/${esc(p.unidade_rendimento||"un")}</span></div>
        <button type="button" class="secondary preparacao-open" onclick="editarPreparacao(${Number(p.id)})">Abrir</button>
      </article>`).join("")}</div>`;
  }

  window.editarPreparacao=async id=>{try{const p=await apiSR(`/api/preparacoes/${id}`);EDITANDO=p;ITENS=[...(p.ingredientes||[]).map(x=>({tipo:"insumo",id:Number(x.insumo_id),quantidade:num(x.quantidade),observacoes:x.observacoes||""})),...(p.componentes||[]).map(x=>({tipo:"preparacao",id:Number(x.componente_id),quantidade:num(x.quantidade),observacoes:x.observacoes||""}))];await carregar();form(p)}catch(e){mostrarErroPrep(e.message)}};

  function mostrarErroPrep(msg){C.innerHTML=`<div class="card"><h3>Não foi possível abrir a preparação</h3><p>${esc(msg||"Erro inesperado.")}</p><div class="actions"><button type="button" class="secondary" onclick="telaPreparacoes()">← Voltar às preparações</button></div></div>`}

  function renderUsadoEm(p){
    const fichas=Array.isArray(p?.usado_em_fichas)?p.usado_em_fichas:[],preps=Array.isArray(p?.usado_em_preparacoes)?p.usado_em_preparacoes:[];
    const total=fichas.length+preps.length;
    return `<div class="card prep-usado-em"><div class="section-head"><div><small>DEPENDÊNCIAS</small><h3>Usado em</h3><p>${total?esc(total+" vínculo"+(total===1?"":"s")+" encontrado"+(total===1?"":"s")):"Esta preparação ainda não é utilizada em outra ficha ou preparação."}</p></div></div>${fichas.length?`<div class="prep-uso-grupo"><b>Fichas Técnicas</b>${fichas.map(x=>`<div class="prep-uso-item"><span>${esc(x.nome)}</span><small>${numero(x.quantidade,3)} ${esc(p.unidade_rendimento||"")}</small></div>`).join("")}</div>`:""}${preps.length?`<div class="prep-uso-grupo"><b>Preparações</b>${preps.map(x=>`<div class="prep-uso-item"><span>${esc(x.nome)}</span><small>${numero(x.quantidade,3)} ${esc(p.unidade_rendimento||"")}</small></div>`).join("")}</div>`:""}</div>`;
  }

  function form(p=null){
    EDITANDO=p;if(!p)ITENS=[];BASE_ESCALA=null;
    C.innerHTML=`<div class="section-head"><div><small>SUB-RECEITA</small><h2>${p?esc(p.nome):"Nova Preparação"}</h2><p>Use insumos e também outras preparações como componentes.</p></div><button class="secondary" id="voltarPrep">← Voltar</button></div>
    <form id="formPrep" class="ficha-aberta-planilha"><div class="card form-grid">
    <label>Nome da preparação<input id="prepNome" required value="${esc(p?.nome||"")}"></label>
    <label>Categoria<select id="prepCategoria">${["Bases e Fundos","Molhos","Carnes e Aves","Pescados e Frutos do Mar","Massas","Arroz e Cereais","Guarnições","Vegetais e Saladas","Padaria","Confeitaria e Sobremesas","Marinadas e Condimentos","Pré-preparos"].map(x=>`<option ${p?.categoria===x?"selected":""}>${x}</option>`).join("")}</select></label>
    <label>Rendimento final<input id="prepRendimento" type="number" min=".0001" step=".0001" required readonly value="${p?.rendimento??1}"><small>Calculado pela soma dos componentes compatíveis</small></label>
    <label>Unidade do rendimento<select id="prepUnidade">${["KG","L","UN","PORÇÃO"].map(x=>`<option ${p?.unidade_rendimento===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
    <div class="card prep-ficha-rendimento"><div class="section-head"><div><small>RENDIMENTO DA RECEITA</small><h3>Porcionamento</h3></div></div><div class="prep-ficha-grid"><label>Quantidade de Porções<input id="prepQtdPorcoesInput" type="number" min=".0001" step="any" placeholder="Ex.: 40" value="${p?.quantidade_porcoes??""}"></label><label>Peso da Porção <span id="prepPorcaoUnidade">KG</span><input id="prepPesoPorcao" type="number" min=".0001" step="any" placeholder="Ex.: 0,200" value="${p?.peso_porcao??""}"></label><div><small>Custo por porção</small><strong id="prepCustoPorcao">—</strong></div></div><p class="prep-rendimento-aviso" id="prepPorcaoAjuda">Informe a quantidade de porções ou o peso da porção. O outro valor será calculado automaticamente.</p></div>
    <div class="card prep-escalonamento"><div class="section-head"><div><small>ESCALONAMENTO</small><h3>Planejar produção</h3><p>Defina a produção desejada e todos os insumos e subpreparações serão recalculados automaticamente.</p></div><button type="button" class="secondary" id="prepResetEscala">Restaurar base</button></div><div class="prep-escala-grid"><label>Escalonar por<select id="prepEscalaModo"><option value="rendimento">Rendimento desejado</option><option value="porcoes">Quantidade de porções</option></select></label><label><span id="prepEscalaRotulo">Rendimento desejado</span><input id="prepEscalaValor" type="number" min=".001" step=".001" placeholder="0,000"></label><div><small>Fator de escala</small><strong id="prepEscalaFator">1,000×</strong></div></div><p class="prep-rendimento-aviso">Escalonamento automático aplicado a 100% dos componentes. As proporções da receita-base são preservadas.</p></div><div class="card"><div class="section-head"><div><small>COMPOSIÇÃO</small><h3>Ingredientes e preparações</h3></div><button type="button" class="primary" id="addPrepItem">+ Componente</button></div><div id="prepItens"></div></div>
    <div class="card"><div class="summary-grid"><div><span>Custo Total</span><strong id="prepCustoTotal">R$ 0,00</strong></div><div><span id="prepCustoUnitLabel">Custo por unidade</span><strong id="prepCustoUnit">R$ 0,00</strong></div><div><span>Rendimento</span><strong id="prepRendResumo">0</strong></div></div></div><div class="card prep-comercial"><div class="section-head"><div><small>PREÇO E CMV</small><h3>Comercialização da preparação</h3></div></div><div class="prep-comercial-grid"><label>Preço de Venda / Porção<input id="prepPrecoVenda" type="number" min="0" step=".01" value="${p?.preco_venda_porcao??""}" placeholder="R$ 0,00"></label><label>Meta de CMV (%)<input id="prepMetaCmv" type="number" min=".001" step=".001" value="${p?.meta_cmv??30}"></label><div><small>CMV real</small><strong id="prepCmvReal">—</strong></div><div><small>Preço sugerido</small><strong id="prepPrecoSugerido">—</strong></div></div></div>
    ${p?`<div class="card"><div class="section-head"><div><small>RESULTADO DA PRODUÇÃO</small><h3>Banco de Insumos</h3><p>Crie ou atualize o insumo produzido usando o custo unitário calculado desta produção.</p></div><button type="button" class="primary" id="vincularInsumoProd">Vincular ao Banco de Insumos</button></div><div id="statusInsumoProd"></div></div>`:""}
    ${p?renderUsadoEm(p):""}
    <div class="card"><label>Modo de preparo<textarea id="prepModo">${esc(p?.modo_preparo||"")}</textarea></label><label style="margin-top:13px">Observações<textarea id="prepObs">${esc(p?.observacoes||"")}</textarea></label></div>
    <div class="actions"><button type="button" class="secondary" id="cancelPrep">Cancelar</button>${p?'<button type="button" class="danger" id="delPrep">Excluir</button>':""}<button class="primary" type="submit">Salvar preparação</button></div></form>`;
    if(p){const vb=document.querySelector("#vincularInsumoProd");if(vb)vb.onclick=async()=>{const st=document.querySelector("#statusInsumoProd");try{vb.disabled=true;if(st)st.innerHTML='<p>Sincronizando custo...</p>';const x=await apiSR(`/api/preparacoes/${p.id}/vincular-insumo`,{method:"POST",body:"{}"});if(st)st.innerHTML=`<p><b>${esc(x.ingrediente)}</b> vinculado ao grupo <b>PRODUÇÕES</b> · ${moeda(x.preco_real)}/${esc(x.unidade)}</p>`;await carregar()}catch(e){if(st)st.innerHTML=`<p class="error">${esc(e.message)}</p>`}finally{vb.disabled=false}}}
    document.querySelector("#voltarPrep").onclick=window.telaPreparacoes;document.querySelector("#cancelPrep").onclick=window.telaPreparacoes;
    document.querySelector("#addPrepItem").onclick=()=>{ITENS.push({tipo:"insumo",id:"",quantidade:0,observacoes:""});BASE_ESCALA=null;renderItens()};document.querySelector("#prepEscalaModo").onchange=atualizarEscalaUI;document.querySelector("#prepEscalaValor").oninput=aplicarEscala;document.querySelector("#prepResetEscala").onclick=restaurarEscala;
    document.querySelector("#prepUnidade").onchange=()=>atualizarRendimentoAutomatico();document.querySelector("#prepPesoPorcao").oninput=()=>sincronizarPorcao("peso");document.querySelector("#prepQtdPorcoesInput").oninput=()=>sincronizarPorcao("qtd");document.querySelector("#prepPrecoVenda").oninput=calcular;document.querySelector("#prepMetaCmv").oninput=calcular;document.querySelector("#formPrep").onsubmit=salvar;if(p)document.querySelector("#delPrep").onclick=excluir;renderItens();atualizarRendimentoAutomatico();
  }

  function garantirBaseEscala(){if(BASE_ESCALA)return;BASE_ESCALA={rendimento:num(document.querySelector("#prepRendimento")?.value),porcoes:num(document.querySelector("#prepQtdPorcoesInput")?.value),peso:num(document.querySelector("#prepPesoPorcao")?.value),itens:ITENS.map(x=>({...x,quantidade:num(x.quantidade)}))}}
  function atualizarEscalaUI(){const m=document.querySelector("#prepEscalaModo")?.value||"rendimento",r=document.querySelector("#prepEscalaRotulo");if(r)r.textContent=m==="porcoes"?"Quantidade de porções":"Rendimento desejado";const v=document.querySelector("#prepEscalaValor");if(v)v.placeholder=m==="porcoes"?"Ex.: 50,000":"Ex.: 10,000"}
  function aplicarEscala(){garantirBaseEscala();const alvo=num(document.querySelector("#prepEscalaValor")?.value),modo=document.querySelector("#prepEscalaModo")?.value||"rendimento",base=modo==="porcoes"?num(BASE_ESCALA.porcoes):num(BASE_ESCALA.rendimento);if(!(alvo>0&&base>0))return;const fator=alvo/base;ITENS=BASE_ESCALA.itens.map(x=>({...x,quantidade:num(x.quantidade)*fator}));const rend=BASE_ESCALA.rendimento*fator,por=BASE_ESCALA.porcoes*fator;document.querySelector("#prepRendimento").value=rend.toFixed(3);if(document.querySelector("#prepQtdPorcoesInput"))document.querySelector("#prepQtdPorcoesInput").value=por>0?por.toFixed(3):"";if(document.querySelector("#prepPesoPorcao"))document.querySelector("#prepPesoPorcao").value=BASE_ESCALA.peso>0?BASE_ESCALA.peso.toFixed(3):"";const fe=document.querySelector("#prepEscalaFator");if(fe)fe.textContent=numero(fator,3)+"×";renderItens();calcular()}
  function restaurarEscala(){if(!BASE_ESCALA)return;ITENS=BASE_ESCALA.itens.map(x=>({...x}));document.querySelector("#prepRendimento").value=BASE_ESCALA.rendimento;document.querySelector("#prepQtdPorcoesInput").value=BASE_ESCALA.porcoes||"";document.querySelector("#prepPesoPorcao").value=BASE_ESCALA.peso||"";document.querySelector("#prepEscalaValor").value="";document.querySelector("#prepEscalaFator").textContent="1,000×";BASE_ESCALA=null;renderItens();calcular()}

  function fonte(it){
    if(it.tipo==="preparacao")return PREPS.find(x=>Number(x.id)===Number(it.id));
    return INSUMOS.find(x=>Number(x.id)===Number(it.id));
  }
  function preco(it){const x=fonte(it);return it.tipo==="preparacao"?num(x?.custo_unitario):num(x?.preco_real)}
  function unidade(it){const x=fonte(it);return it.tipo==="preparacao"?(x?.unidade_rendimento||"—"):(x?.unidade||"—")}

  function renderItens(){
    const area=document.querySelector("#prepItens");if(!area)return;
    if(!ITENS.length){area.innerHTML='<div class="empty">Nenhum componente adicionado. Clique em "+ Componente".</div>';calcular();return}
    area.innerHTML=`<div class="table-wrap ficha-planilha"><table>
      <thead><tr>
        <th>Tipo</th><th>Código</th><th>Ingrediente / Preparação</th><th>Peso Líquido</th><th>Unidade</th>
        <th>FC</th><th>Peso Bruto</th><th>Preço de Compra</th><th>Preço Real</th><th>Custo do Insumo</th><th>Observação</th><th></th>
      </tr></thead><tbody>${ITENS.map((it,k)=>{
        const x=fonte(it),ehPrep=it.tipo==="preparacao";
        const q=num(it.quantidade),fc=ehPrep?1:num(x?.fc),bruto=q*fc,precoCompra=ehPrep?null:num(x?.preco_compra),precoReal=preco(it),custo=q*precoReal;
        const codigo=ehPrep?"—":(x?.codigo||x?.id||"—");
        const opcoes=(ehPrep?PREPS.filter(y=>!EDITANDO||Number(y.id)!==Number(EDITANDO.id)):INSUMOS.filter(y=>y.ativo!==false))
          .map(y=>`<option value="${y.id}" ${Number(y.id)===Number(it.id)?"selected":""}>${esc(ehPrep?y.nome:y.ingrediente)}</option>`).join("");
        return `<tr data-prep-row="${k}">
          <td><select onchange="prepTipo(${k},this.value)"><option value="insumo" ${!ehPrep?"selected":""}>Insumo</option><option value="preparacao" ${ehPrep?"selected":""}>Preparação</option></select></td>
          <td><b>${esc(codigo)}</b></td>
          <td><select onchange="prepFonte(${k},this.value)"><option value="">Selecione...</option>${opcoes}</select></td>
          <td><input class="prep-qtd ficha-qtd" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${it.quantidade?String(it.quantidade).replace(".",","):""}" oninput="prepQtd(${k},this.value)"></td>
          <td><b>${esc(unidade(it))}</b></td>
          <td>${ehPrep?"—":numero(fc,3)}</td>
          <td>${ehPrep?"—":numero(bruto,3)}</td>
          <td>${ehPrep?"—":moeda(precoCompra)}</td>
          <td>${moeda(precoReal)}</td>
          <td><b data-custo-item>${moeda(custo)}</b></td>
          <td><input value="${esc(it.observacoes||"")}" placeholder="Opcional" oninput="prepObsItem(${k},this.value)"></td>
          <td><button type="button" class="danger" aria-label="Remover componente" title="Remover componente" onclick="prepRemover(${k})">×</button></td>
        </tr>`;
      }).join("")}</tbody></table></div><div class="ficha-scroll-hint">← DESLIZE A TABELA PARA VER TODAS AS COLUNAS →</div>`;
    calcular();
  }
  window.prepTipo=(k,v)=>{BASE_ESCALA=null;ITENS[k].tipo=v;ITENS[k].id="";renderItens();atualizarRendimentoAutomatico()};
  window.prepFonte=(k,v)=>{BASE_ESCALA=null;ITENS[k].id=v?Number(v):"";renderItens();atualizarRendimentoAutomatico()};
  window.prepQtd=(k,v)=>{
    BASE_ESCALA=null;
    const bruto=String(v??"").trim().replace(/\s/g,"");
    const normalizado=bruto.includes(",") ? bruto.replace(/\./g,"").replace(",",".") : bruto;
    const valor=parseFloat(normalizado);
    ITENS[k].quantidade=Number.isFinite(valor)?valor:0;
    atualizarTotaisLinha(k);
    atualizarRendimentoAutomatico();
    calcular();
  };
  function atualizarTotaisLinha(k){
    const row=document.querySelector(`[data-prep-row="${k}"]`);
    if(!row)return;
    const custo=row.querySelector("[data-custo-item]");
    if(custo)custo.textContent=moeda(num(ITENS[k].quantidade)*preco(ITENS[k]));
  }
  window.prepObsItem=(k,v)=>ITENS[k].observacoes=v;
  window.prepRemover=k=>{BASE_ESCALA=null;ITENS.splice(k,1);renderItens();atualizarRendimentoAutomatico()};

  function atualizarRendimentoAutomatico(){
    const el=document.querySelector("#prepRendimento"),u=document.querySelector("#prepUnidade")?.value||"";
    if(!el)return;
    const validos=ITENS.filter(it=>it.id&&it.quantidade>0),compativeis=validos.filter(it=>String(unidade(it)).toUpperCase()===u);
    if(validos.length&&compativeis.length===validos.length)el.value=String(compativeis.reduce((s,it)=>s+num(it.quantidade),0));
    sincronizarPorcao("rendimento");
  }

  function sincronizarPorcao(origem){
    const r=num(document.querySelector("#prepRendimento")?.value),u=document.querySelector("#prepUnidade")?.value||"",pesoEl=document.querySelector("#prepPesoPorcao"),qtdEl=document.querySelector("#prepQtdPorcoesInput");
    if(u==="KG"||u==="L"){
      if(origem==="qtd"&&num(qtdEl?.value)>0&&r>0)pesoEl.value=(r/num(qtdEl.value)).toFixed(3);
      else if((origem==="peso"||origem==="rendimento"||origem==="unidade")&&num(pesoEl?.value)>0&&r>0)qtdEl.value=(r/num(pesoEl.value)).toFixed(3);
    }else if(u==="UN"||u==="PORÇÃO"){
      if(r>0)qtdEl.value=String(r);
      pesoEl.value="";
    }
    calcular();
  }

  function calcular(){
    const total=ITENS.reduce((s,it)=>s+num(it.quantidade)*preco(it),0),r=num(document.querySelector("#prepRendimento")?.value),u=document.querySelector("#prepUnidade")?.value||"",rotulo=u==="PORÇÃO"?"Custo por porção":u==="KG"?"Custo por kg":u==="L"?"Custo por litro":u==="UN"?"Custo por unidade":"Custo unitário";
    if(document.querySelector("#prepCustoTotal"))document.querySelector("#prepCustoTotal").textContent=moeda(total);
    if(document.querySelector("#prepCustoUnit"))document.querySelector("#prepCustoUnit").textContent=moeda(r>0?total/r:0);
    if(document.querySelector("#prepCustoUnitLabel"))document.querySelector("#prepCustoUnitLabel").textContent=rotulo;
    if(document.querySelector("#prepRendResumo"))document.querySelector("#prepRendResumo").textContent=`${numero(r,u==="PORÇÃO"||u==="UN"?0:3)} ${u}`;
    const peso=num(document.querySelector("#prepPesoPorcao")?.value),qtd=num(document.querySelector("#prepQtdPorcoesInput")?.value),pu=document.querySelector("#prepPorcaoUnidade"),cp=document.querySelector("#prepCustoPorcao"),aj=document.querySelector("#prepPorcaoAjuda");
    if(pu)pu.textContent=u||"";
    const custoPorcao=qtd>0?total/qtd:0;if(cp)cp.textContent=custoPorcao>0?moeda(custoPorcao):"—";const pv=num(document.querySelector("#prepPrecoVenda")?.value),meta=num(document.querySelector("#prepMetaCmv")?.value),cmv=pv>0?custoPorcao/pv*100:0,sug=meta>0?custoPorcao/(meta/100):0,cmvEl=document.querySelector("#prepCmvReal"),sugEl=document.querySelector("#prepPrecoSugerido");if(cmvEl)cmvEl.textContent=pv>0?numero(cmv,3)+"%":"—";if(sugEl)sugEl.textContent=custoPorcao>0&&meta>0?moeda(sug):"—";
    if(aj)aj.textContent=(u==="KG"||u==="L")?"Quantidade de porções e peso da porção permanecem vinculados ao rendimento final.":"Para UN/PORÇÃO, o rendimento já representa a quantidade produzida.";
  }

  async function salvar(e){
    e.preventDefault();
    const validos=ITENS.filter(x=>x.id&&x.quantidade>0);
    if(!validos.length)return alert("Adicione pelo menos um componente.");
    if(BASE_ESCALA)restaurarEscala();
    const payload={nome:document.querySelector("#prepNome").value.trim(),categoria:document.querySelector("#prepCategoria").value,rendimento:num(document.querySelector("#prepRendimento").value),unidade_rendimento:document.querySelector("#prepUnidade").value,quantidade_porcoes:num(document.querySelector("#prepQtdPorcoesInput").value)||null,peso_porcao:num(document.querySelector("#prepPesoPorcao").value)||null,preco_venda_porcao:num(document.querySelector("#prepPrecoVenda").value)||null,meta_cmv:num(document.querySelector("#prepMetaCmv").value)||30,modo_preparo:document.querySelector("#prepModo").value.trim(),observacoes:document.querySelector("#prepObs").value.trim(),
      ingredientes:validos.filter(x=>x.tipo==="insumo").map(x=>({insumo_id:x.id,quantidade:num(x.quantidade),observacoes:x.observacoes})),
      componentes:validos.filter(x=>x.tipo==="preparacao").map(x=>({preparacao_id:x.id,quantidade:num(x.quantidade),observacoes:x.observacoes}))};
    try{await apiSR(EDITANDO?`/api/preparacoes/${EDITANDO.id}`:"/api/preparacoes",{method:EDITANDO?"PUT":"POST",body:JSON.stringify(payload)});await window.telaPreparacoes()}catch(e){alert(e.message)}
  }
  async function excluir(){if(!EDITANDO||!confirm(`Excluir "${EDITANDO.nome}"?`))return;try{await apiSR(`/api/preparacoes/${EDITANDO.id}`,{method:"DELETE"});await window.telaPreparacoes()}catch(e){alert(e.message)}}
})();