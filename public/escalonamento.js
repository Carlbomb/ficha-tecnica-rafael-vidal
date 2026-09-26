/* MISEVO — Piloto de escalonamento temporário de receitas */
(()=>{
  const state={ativo:false,modo:"rendimento",valor:"",itemIndex:null,unidade:""};

  const q=s=>document.querySelector(s);
  const flex=(v,max=3)=>num(v).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:max});

  function parseValor(v){
    let s=String(v??"").trim().replace(/\s/g,"");
    if(!s)return 0;
    if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");
    const n=Number(s);
    return Number.isFinite(n)?n:0;
  }

  function qtdLegivel(v,u){
    v=num(v);u=String(u||"").toUpperCase();
    if(u==="KG"&&v>0&&v<1)return flex(v*1000)+" G";
    if(u==="G"&&Math.abs(v)>=1000)return flex(v/1000)+" KG";
    if(u==="L"&&v>0&&v<1)return flex(v*1000)+" ML";
    if(u==="ML"&&Math.abs(v)>=1000)return flex(v/1000)+" L";
    return flex(v)+" "+(u||"UN");
  }

  function fichaAberta(){
    try{return !!EDITANDO_FICHA&&!!q("#formFicha")}catch{return false}
  }

  function refs(){
    try{
      return ITENS_FICHA.map((item,index)=>({item,index,fonte:fonteFicha(item)}))
        .filter(x=>x.item.tipo==="insumo"&&x.fonte&&num(x.item.peso_liquido)>0);
    }catch{return []}
  }

  function mount(){
    const form=q("#formFicha");
    if(!form||form.dataset.escalaMounted==="1"||!fichaAberta())return;
    form.dataset.escalaMounted="1";

    const voltar=q("#voltarFichas");
    if(voltar&&!q("#escalonarFicha")){
      const b=document.createElement("button");
      b.type="button";
      b.className="primary";
      b.id="escalonarFicha";
      b.textContent="Escalonar receita";
      voltar.parentElement?.insertBefore(b,voltar);
      b.addEventListener("click",abrir);
    }

    const primeira=form.querySelector(".card.form-grid");
    if(primeira&&!q("#painelEscalonamento")){
      const p=document.createElement("div");
      p.id="painelEscalonamento";
      primeira.insertAdjacentElement("afterend",p);
    }
  }

  function abrir(){
    if(!fichaAberta())return;
    state.ativo=true;
    state.modo="rendimento";
    state.itemIndex=null;
    state.unidade="";
    const base=calcularFicha();
    state.valor=String(base.rendimento||0).replace(".",",");
    render(base);
    q("#painelEscalonamento")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function fechar(){
    state.ativo=false;
    state.modo="rendimento";
    state.valor="";
    state.itemIndex=null;
    state.unidade="";
    const p=q("#painelEscalonamento");
    if(p)p.innerHTML="";
  }

  function render(base){
    const area=q("#painelEscalonamento");
    if(!area||!state.ativo)return;
    base=base||calcularFicha();

    const referencias=refs();
    if(state.modo==="ingrediente"&&!referencias.some(x=>x.index===Number(state.itemIndex))){
      state.itemIndex=referencias[0]?.index??null;
    }
    const ref=referencias.find(x=>x.index===Number(state.itemIndex));
    if(state.modo==="ingrediente"&&ref&&!state.unidade){
      state.unidade=ref.item.unidade||unidadeFicha(ref.item);
    }

    let campos="";
    if(state.modo==="ingrediente"){
      const opcoes=referencias.length
        ? referencias.map(x=>'<option value="'+x.index+'" '+(x.index===Number(state.itemIndex)?"selected":"")+'>'+esc(x.fonte.ingrediente)+'</option>').join("")
        : '<option value="">Nenhum insumo disponível</option>';
      const unidades=ref
        ? unidadesCompativeis(ref.item.unidade||unidadeFicha(ref.item))
            .map(u=>'<option value="'+u+'" '+(u===(state.unidade||ref.item.unidade||unidadeFicha(ref.item))?"selected":"")+'>'+u+'</option>').join("")
        : "";
      campos=
        '<label>Ingrediente de referência<select id="escalaItem" '+(referencias.length?"":"disabled")+'>'+opcoes+'</select></label>'+
        '<label>Quantidade disponível<input id="escalaValor" type="text" inputmode="decimal" value="'+esc(state.valor)+'" placeholder="0,000"></label>'+
        '<label>Unidade<select id="escalaUnidade" '+(ref?"":"disabled")+'>'+unidades+'</select></label>';
    }else{
      campos=
        '<label>'+(state.modo==="porcoes"?"Porções desejadas":"Rendimento desejado")+
        '<input id="escalaValor" type="text" inputmode="decimal" value="'+esc(state.valor)+'" placeholder="0,000"></label>';
    }

    area.innerHTML=
      '<div class="card">'+
        '<div class="section-head"><div><small>SIMULAÇÃO DE PRODUÇÃO</small><h3>Escalonar receita</h3>'+
        '<p>Recalcule a ficha para outra produção sem alterar a receita original.</p></div>'+
        '<button type="button" class="secondary" id="fecharEscala">Fechar</button></div>'+
        '<div class="form-grid">'+
          '<label>Calcular por<select id="escalaModo">'+
            '<option value="rendimento" '+(state.modo==="rendimento"?"selected":"")+'>Rendimento desejado</option>'+
            '<option value="porcoes" '+(state.modo==="porcoes"?"selected":"")+'>Número de porções</option>'+
            '<option value="ingrediente" '+(state.modo==="ingrediente"?"selected":"")+'>Ingrediente disponível</option>'+
          '</select></label>'+campos+
        '</div>'+
        '<div class="summary-grid" id="escalaResumo" style="margin-top:16px"></div>'+
        '<div style="margin-top:18px"><div class="section-head"><div><small>QUANTIDADES</small>'+
        '<h3>Ingredientes para esta produção</h3></div></div><div id="escalaResultado"></div></div>'+
        '<div class="empty" style="margin-top:14px">Simulação temporária: nenhum valor escalonado é salvo na ficha técnica.</div>'+
      '</div>';

    q("#fecharEscala").onclick=fechar;
    q("#escalaModo").onchange=e=>{
      state.modo=e.target.value;
      state.itemIndex=state.modo==="ingrediente"?(referencias[0]?.index??null):null;
      state.unidade="";
      state.valor=state.modo==="porcoes"
        ?String(base.porcoes||0).replace(".",",")
        :state.modo==="rendimento"
          ?String(base.rendimento||0).replace(".",",")
          :"";
      render(base);
    };

    q("#escalaValor")?.addEventListener("input",e=>{
      state.valor=e.target.value;
      atualizar(base);
    });

    q("#escalaItem")?.addEventListener("change",e=>{
      state.itemIndex=Number(e.target.value);
      const item=ITENS_FICHA[state.itemIndex];
      state.unidade=item?.unidade||unidadeFicha(item);
      state.valor="";
      render(base);
    });

    q("#escalaUnidade")?.addEventListener("change",e=>{
      state.unidade=e.target.value;
      atualizar(base);
    });

    atualizar(base);
  }

  function atualizar(base){
    if(!state.ativo)return;
    const resumo=q("#escalaResumo"),resultado=q("#escalaResultado");
    if(!resumo||!resultado)return;
    base=base||calcularFicha();

    const alvo=parseValor(state.valor);
    let fator=0,mensagem="";

    if(state.modo==="rendimento"){
      if(base.rendimento>0&&alvo>0)fator=alvo/base.rendimento;
      else mensagem="Informe um rendimento maior que zero.";
    }else if(state.modo==="porcoes"){
      if(base.porcoes>0&&alvo>0)fator=alvo/base.porcoes;
      else mensagem="Informe uma quantidade de porções maior que zero.";
    }else{
      const item=ITENS_FICHA[Number(state.itemIndex)];
      const fonte=item?fonteFicha(item):null;
      if(!item||!fonte||num(item.peso_liquido)<=0)mensagem="Selecione um ingrediente válido.";
      else if(alvo<=0)mensagem="Informe a quantidade disponível.";
      else{
        const unidadeBase=item.unidade||unidadeFicha(item);
        const unidadeEntrada=state.unidade||unidadeBase;
        const convertido=converterQuantidade(alvo,unidadeEntrada,unidadeBase);
        if(Number.isFinite(convertido)&&convertido>0)fator=convertido/num(item.peso_liquido);
        else mensagem="A unidade informada não é compatível com o ingrediente.";
      }
    }

    if(!(fator>0)||!Number.isFinite(fator)){
      resumo.innerHTML=
        '<div><span>Rendimento base</span><strong>'+flex(base.rendimento)+'</strong></div>'+
        '<div><span>Porções base</span><strong>'+flex(base.porcoes)+'</strong></div>'+
        '<div><span>Fator de escala</span><strong>—</strong></div>'+
        '<div><span>Custo estimado</span><strong>—</strong></div>';
      resultado.innerHTML='<div class="empty">'+esc(mensagem||"Informe a quantidade desejada.")+'</div>';
      return;
    }

    resumo.innerHTML=
      '<div><span>Fator de escala</span><strong>'+flex(fator)+'×</strong></div>'+
      '<div><span>Rendimento estimado</span><strong>'+flex(base.rendimento*fator)+'</strong></div>'+
      '<div><span>Porções estimadas</span><strong>'+flex(base.porcoes*fator)+'</strong></div>'+
      '<div><span>Custo estimado</span><strong>'+moeda(base.custoTotal*fator)+'</strong></div>';

    const linhas=ITENS_FICHA.map(item=>{
      const fonte=fonteFicha(item);
      if(!fonte||num(item.peso_liquido)<=0)return "";
      const unidade=item.unidade||unidadeFicha(item);
      const nome=item.tipo==="preparacao"?fonte.nome:fonte.ingrediente;
      const baseQtd=num(item.peso_liquido);
      return '<tr><td><b>'+esc(nome||"—")+'</b>'+(item.tipo==="preparacao"?'<small>Preparação / sub-receita</small>':"")+
        '</td><td>'+qtdLegivel(baseQtd,unidade)+'</td><td><b>'+qtdLegivel(baseQtd*fator,unidade)+'</b></td></tr>';
    }).join("");

    resultado.innerHTML=linhas
      ?'<div class="table-wrap"><table><thead><tr><th>Componente</th><th>Receita base</th><th>Produção</th></tr></thead><tbody>'+linhas+'</tbody></table></div>'
      :'<div class="empty">Nenhum componente válido na ficha.</div>';
  }

  const content=q("#content");
  if(content){
    new MutationObserver(()=>mount()).observe(content,{childList:true,subtree:true});
    mount();
  }

  document.addEventListener("input",e=>{
    if(!state.ativo||!e.target.closest("#formFicha")||e.target.closest("#painelEscalonamento"))return;
    setTimeout(()=>{if(state.ativo)atualizar(calcularFicha())},0);
  });

  document.addEventListener("change",e=>{
    if(!state.ativo||!e.target.closest("#formFicha")||e.target.closest("#painelEscalonamento"))return;
    setTimeout(()=>{if(state.ativo)atualizar(calcularFicha())},0);
  });
})();