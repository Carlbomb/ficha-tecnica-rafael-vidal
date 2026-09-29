const $ = selector => document.querySelector(selector);
const C = $("#content");

let INSUMOS = [];
let EDITANDO_INSUMO = null;
let EDITANDO_FICHA = null;
let ITENS_FICHA = [];
let PREPARACOES = [];

/* =========================================================
   UTILIDADES
========================================================= */

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const moeda = value =>
  num(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const parseValorMonetario = value => {
  const texto = String(value ?? "").trim().replace(/\s/g, "").replace("R$", "");
  if (!texto) return 0;
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  return num(normalizado);
};

const numero = (value, casas = 3) =>
  num(value).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });

const esc = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.detail ||
      "Não foi possível concluir a operação."
    );
  }

  return data;
}

function erro(error) {
  console.error(error);
  alert(error.message || "Ocorreu um erro.");
}

/* =========================================================
   DADOS
========================================================= */

async function carregarDados() {
  const [insumos, preparacoes] = await Promise.all([
    api("/api/insumos"),
    api("/api/preparacoes")
  ]);

  INSUMOS = insumos || [];
  PREPARACOES = preparacoes || [];
  window.PREPARACOES_PUBLIC = PREPARACOES;
  atualizarPainel();
}

function atualizarPainel() {
  const ni = $("#ni");
  const nf = $("#nf");
  const avg = $("#avg");

  if (ni) {
    ni.textContent = INSUMOS.filter(i => i.ativo !== false).length;
  }

  if (nf) {
    nf.textContent = PREPARACOES.filter(p => p.ativo !== false).length;
  }

  if (avg) {
    avg.textContent = "—";
  }
}

/* =========================================================
   NAVEGAÇÃO
========================================================= */

document.addEventListener("click", event => {
  const botao = event.target.closest("nav button[data-tab]");
  if (!botao) return;

  document
    .querySelectorAll("nav button[data-tab]")
    .forEach(b => b.classList.remove("active"));

  botao.classList.add("active");

  if (botao.dataset.tab === "painel") telaPainel();
  if (botao.dataset.tab === "insumos") telaInsumos();
  if (botao.dataset.tab === "preparacoes") telaPreparacoes();
  if (botao.dataset.tab === "cmv") telaCMV();
  if (botao.dataset.tab === "usuarios") telaUsuarios();
});


/* =========================================================
   PAINEL
========================================================= */

async function telaPainel() {
  const fichasAtivas = PREPARACOES.filter(f => f.ativo !== false);
  const insumosAtivos = INSUMOS.filter(i => i.ativo !== false);
  const custoMedio = fichasAtivas.length ? fichasAtivas.reduce((s,f)=>s+num(f.custo_unitario),0)/fichasAtivas.length : 0;
  const [estoqueReq,validadesReq,producaoReq]=await Promise.allSettled([api("/api/estoque/resumo"),api("/api/etiquetas"),api("/api/producao/ordens")]);
  const estoqueResumo=estoqueReq.status==="fulfilled"?estoqueReq.value:null;
  const etiquetas=validadesReq.status==="fulfilled"&&Array.isArray(validadesReq.value)?validadesReq.value:null;
  const abaixoMinimo=estoqueResumo?num(estoqueResumo.abaixo_minimo):null;
  const vencimentosProximos=etiquetas?etiquetas.filter(x=>["vencendo","vence_hoje"].includes(x.status_calculado)).reduce((s,x)=>s+Math.max(1,num(x.quantidade)),0):null;
  const recentes=[...fichasAtivas].sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR")).slice(0,5);
  const ordens=producaoReq.status==="fulfilled"&&Array.isArray(producaoReq.value)?producaoReq.value:[];
  const producaoDia=ordens.filter(x=>!["anulada","cancelada","concluida","finalizada"].includes(x.status));
  const statusProducao=s=>s==="em_producao"?"Em produção":"Pendente";
  const ni=$("#ni"),nf=$("#nf"),avg=$("#avg");
  if(ni)ni.textContent=insumosAtivos.length;
  if(nf)nf.textContent=fichasAtivas.length;
  if(avg){avg.closest("article")?.querySelector("span")&&(avg.closest("article").querySelector("span").textContent="CUSTO MÉDIO / UNIDADE");avg.textContent=moeda(custoMedio)}
  C.innerHTML=`
    <div class="section-head"><div><small>PAINEL</small><h2>Visão Geral</h2><p>Indicadores das fichas técnicas, estoque e vencimentos.</p></div></div>
    <div class="summary-grid painel-kpis">
      <div><span>Fichas Técnicas</span><strong>${fichasAtivas.length}</strong></div>
      <div><span>Custo médio / unidade</span><strong>${moeda(custoMedio)}</strong></div>
      <div><span>Itens abaixo do mínimo</span><strong>${abaixoMinimo===null?"—":abaixoMinimo}</strong></div>
      <div><span>Vencimentos próximos</span><strong>${vencimentosProximos===null?"—":vencimentosProximos}</strong></div>
    </div>
    <div class="card painel-producao" style="margin-top:16px"><div class="section-head"><div><small>OPERAÇÃO DA COZINHA</small><h3>Produção do Dia</h3></div><button type="button" class="secondary" id="painelVerProducao">Ver toda</button></div>
      ${producaoDia.length?`<div class="painel-producao-lista">${producaoDia.slice(0,6).map(o=>`<button type="button" class="painel-producao-item" data-op="${Number(o.id)}"><span><b>${esc(o.item_nome||o.preparacao_nome||o.ficha_nome||"Produção")}</b><small>${numero(o.quantidade_planejada,3)} ${esc(o.unidade||"")} · ${statusProducao(o.status)}</small></span><strong>›</strong></button>`).join("")}</div>`:`<div class="empty">Nenhuma produção programada para hoje.<div style="margin-top:12px"><button type="button" class="primary" id="painelPlanejarProducao">Planejar produção</button></div></div>`}
    </div>
    <div class="card" style="margin-top:16px"><div class="section-head"><div><small>FICHAS TÉCNICAS</small><h3>Fichas cadastradas</h3></div><button type="button" class="secondary" id="painelVerFichas">Ver todas</button></div>
      ${recentes.length?`<div class="table-wrap"><table><thead><tr><th>Ficha</th><th>Categoria</th><th>Rendimento</th><th>Custo</th><th></th></tr></thead><tbody>${recentes.map(x=>`<tr><td><b>${esc(x.nome)}</b></td><td>${esc(x.categoria||"—")}</td><td>${numero(x.rendimento,3)} ${esc(x.unidade_rendimento||"")}</td><td>${moeda(x.custo_total)}</td><td><button type="button" onclick="editarPreparacao(${Number(x.id)})">Abrir</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Nenhuma ficha técnica cadastrada.</div>'}
    </div>`;
  $("#painelVerProducao")?.addEventListener("click",()=>window.telaProducao?.());
  $("#painelPlanejarProducao")?.addEventListener("click",()=>window.telaProducao?.());
  document.querySelectorAll(".painel-producao-item").forEach(b=>b.addEventListener("click",()=>{window.telaProducao?.();}));
  $("#painelVerFichas")?.addEventListener("click",()=>window.telaPreparacoes());
}

/* =========================================================
   BANCO DE DADOS / INSUMOS
========================================================= */

let grupoInsumosAberto = "";
function telaInsumos() {
  EDITANDO_INSUMO = null;
  grupoInsumosAberto = "";

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>BANCO DE DADOS</small>
        <h2>Insumos Base</h2>
        <p>Cadastro utilizado automaticamente pelas fichas técnicas.</p>
      </div>

      <button type="button" class="primary" id="novoInsumo">
        + Novo insumo
      </button>
    </div>

    <div class="card">
      <input
        id="buscaInsumo"
        placeholder="Buscar código, ingrediente ou fornecedor..."
      >
      <div id="listaInsumos" style="margin-top:12px"></div>
    </div>
  `;

  $("#novoInsumo").onclick = () => formularioInsumo();
  $("#buscaInsumo").oninput = listarInsumos;
  listarInsumos();
}

function listarInsumos() {
  const busca=String($("#buscaInsumo")?.value||"").trim().toLowerCase();
  const lista=INSUMOS.filter(item=>[item.codigo,item.ingrediente,item.fornecedor,item.unidade,item.grupo||"Outros"].join(" ").toLowerCase().includes(busca));
  const area=$("#listaInsumos");if(!area)return;
  if(!grupoInsumosAberto&&!busca){
    const m=new Map();lista.forEach(x=>{const g=String(x.grupo||"Outros").trim()||"Outros",v=m.get(g)||{nome:g,itens:0};v.itens++;m.set(g,v)});
    const grupos=[...m.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
    area.innerHTML=!grupos.length?'<div class="empty">Nenhum grupo encontrado.</div>':`<div class="insumos-grupos">${grupos.map(g=>`<button type="button" class="insumo-grupo-card" data-insumo-grupo="${esc(g.nome)}"><span><b>${esc(g.nome)}</b><small>${g.itens} insumo${g.itens===1?"":"s"}</small></span><strong>›</strong></button>`).join("")}</div>`;
    area.querySelectorAll("[data-insumo-grupo]").forEach(b=>b.onclick=()=>{grupoInsumosAberto=b.dataset.insumoGrupo;listarInsumos()});return;
  }
  const itens=grupoInsumosAberto?lista.filter(x=>(String(x.grupo||"Outros").trim()||"Outros")===grupoInsumosAberto):lista;
  area.innerHTML=`${grupoInsumosAberto?`<div class="insumo-grupo-head"><button type="button" class="secondary" id="voltarGruposInsumos">← Grupos</button><div><small>GRUPO</small><h3>${esc(grupoInsumosAberto)}</h3></div></div>`:""}
  ${!itens.length?'<div class="empty">Nenhum insumo encontrado.</div>':`<div id="insumoBatch" class="batch-actions" hidden><b id="insumoBatchCount">0 selecionados</b><div class="batch-actions-buttons"><button type="button" class="secondary" id="moverInsumosGrupo">Mover para grupo</button></div></div><div class="insumos-grupo-lista">${itens.map(item=>`<article class="insumo-base-card"><label class="insumo-base-check"><input type="checkbox" class="insumo-base-item-check" value="${Number(item.id)}"></label><div class="insumo-base-main"><b>${esc(item.ingrediente)}</b><small>#${esc(item.codigo)} · ${esc(item.unidade)} · ${esc(item.grupo||"Outros")}</small></div><div class="insumo-base-preco"><small>Preço real</small><b>${moeda(item.preco_real)}</b></div><button type="button" class="secondary" onclick="editarInsumo(${item.id})">Editar</button></article>`).join("")}</div>`}`;
  $("#voltarGruposInsumos")?.addEventListener("click",()=>{grupoInsumosAberto="";listarInsumos()});
  const checks=[...area.querySelectorAll(".insumo-base-item-check")],bar=$("#insumoBatch"),cnt=$("#insumoBatchCount");const sync=()=>{const n=checks.filter(x=>x.checked).length;if(bar)bar.hidden=n===0;if(cnt)cnt.textContent=n+` selecionado${n===1?"":"s"}`};checks.forEach(x=>x.onchange=sync);sync();
  $("#moverInsumosGrupo")?.addEventListener("click",async()=>{const ids=checks.filter(x=>x.checked).map(x=>Number(x.value));if(!ids.length)return;try{const grupos=await fetch("/api/estoque/grupos").then(r=>r.json()),destino=prompt("Mover "+ids.length+" insumo(s) para qual grupo?\n\n"+grupos.join("\n"),grupoInsumosAberto||grupos[0]);if(!destino)return;const g=grupos.find(x=>x.toLowerCase()===destino.trim().toLowerCase());if(!g)return alert("Escolha um grupo existente exatamente como aparece na lista.");for(const id of ids){const rr=await fetch(`/api/estoque/insumos/${id}/grupo`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({grupo:g})});if(!rr.ok)throw new Error((await rr.json().catch(()=>({}))).error||"Erro ao mover insumo.")}await carregarDados();grupoInsumosAberto=g;listarInsumos()}catch(e){alert(e.message)}});
}
window.editarInsumo = function(id) {
  const item = INSUMOS.find(i => Number(i.id) === Number(id));
  if (item) formularioInsumo(item);
};

function formularioInsumo(item = null) {
  EDITANDO_INSUMO = item;
  const novo = !item;

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>BANCO DE DADOS</small>
        <h2>${novo ? "Novo Insumo" : "Editar Insumo"}</h2>
      </div>

      <button type="button" class="secondary" id="voltarInsumos">
        ← Voltar
      </button>
    </div>

    <form id="formInsumo" class="card">
      <div class="form-grid">

        ${!novo ? `
          <label>
            Código
            <input value="${esc(item.codigo)}" disabled>
          </label>
        ` : ""}

        <label>
          Ingrediente
          <input
            id="ingrediente"
            required
            value="${esc(item?.ingrediente || "")}"
          >
        </label>

        <label>
          Unidade
          <select id="unidade">
            ${["KG", "L", "UN", "MC", "PCT"].map(unidade => `
              <option
                value="${unidade}"
                ${
                  String(item?.unidade || "KG").toUpperCase() === unidade
                    ? "selected"
                    : ""
                }
              >
                ${unidade}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Peso Bruto
          <input
            id="pesoBruto"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value="${item?.peso_bruto ?? 1}"
          >
        </label>

        <label>
          Peso Líquido
          <input
            id="pesoLiquido"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value="${item?.peso_liquido ?? 1}"
          >
        </label>

        <label>
          FC
          <input id="fc" disabled>
        </label>

        <label>
          Preço Compra / Unid.
          <input
            id="precoCompra"
            type="number"
            step="0.01"
            min="0"
            required
            value="${item?.preco_compra ?? 0}"
          >
        </label>

        <label>
          Preço Real
          <input id="precoReal" disabled>
        </label>

        <label>
          Fornecedor
          <input
            id="fornecedor"
            value="${esc(item?.fornecedor || "")}"
          >
        </label>

        <label>
          Data da Cotação
          <input
            id="dataCotacao"
            type="date"
            value="${
              item?.data_cotacao
                ? String(item.data_cotacao).slice(0, 10)
                : ""
            }"
          >
        </label>
      </div>

      <label style="margin-top:13px">
        Observações
        <textarea id="observacoesInsumo">${esc(item?.observacoes || "")}</textarea>
      </label>

      <div class="actions">
        <button type="button" class="secondary" id="cancelarInsumo">
          Cancelar
        </button>

        ${!novo ? `
          <button type="button" class="danger" id="excluirInsumo">
            Excluir
          </button>
        ` : ""}

        <button type="submit" class="primary">
          Salvar
        </button>
      </div>
    </form>
  `;

  function atualizarInsumo() {
    const bruto = num($("#pesoBruto").value);
    const liquido = num($("#pesoLiquido").value);
    const compra = num($("#precoCompra").value);

    const fc = liquido > 0 ? bruto / liquido : 0;
    const real = compra * fc;

    $("#fc").value = numero(fc, 3);
    $("#precoReal").value = moeda(real);
  }

  $("#pesoBruto").oninput = atualizarInsumo;
  $("#pesoLiquido").oninput = atualizarInsumo;
  $("#precoCompra").oninput = atualizarInsumo;
  $("#voltarInsumos").onclick = telaInsumos;
  $("#cancelarInsumo").onclick = telaInsumos;

  if (!novo) {
    $("#excluirInsumo").onclick = excluirInsumo;
  }

  $("#formInsumo").onsubmit = salvarInsumo;
  atualizarInsumo();
}

async function salvarInsumo(event) {
  event.preventDefault();

  const payload = {
    ingrediente: $("#ingrediente").value.trim(),
    unidade: $("#unidade").value,
    peso_bruto: num($("#pesoBruto").value),
    peso_liquido: num($("#pesoLiquido").value),
    preco_compra: num($("#precoCompra").value),
    fornecedor: $("#fornecedor").value.trim(),
    data_cotacao: $("#dataCotacao").value || null,
    observacoes: $("#observacoesInsumo").value.trim(),
    ativo: true
  };

  try {
    if (EDITANDO_INSUMO) {
      await api(`/api/insumos/${EDITANDO_INSUMO.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/insumos", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    await carregarDados();
    telaPainel();
  } catch (error) {
    erro(error);
  }
}

async function excluirInsumo() {
  if (!EDITANDO_INSUMO) return;

  if (!confirm(`Excluir "${EDITANDO_INSUMO.ingrediente}"?`)) {
    return;
  }

  try {
    await api(`/api/insumos/${EDITANDO_INSUMO.id}`, {
      method: "DELETE"
    });

    await carregarDados();
    telaPainel();
  } catch (error) {
    erro(error);
  }
}

/* =========================================================
   UNIDADES E CONVERSÕES — MISEVO V18
========================================================= */
const UNIDADES_PADRAO = ["KG","G","L","ML","UN"];
function grupoUnidade(u){
  u=String(u||"").toUpperCase();
  if(["KG","G"].includes(u)) return "massa";
  if(["L","ML"].includes(u)) return "volume";
  if(u==="UN") return "unidade";
  return "outro";
}
function unidadesCompativeis(u){
  const g=grupoUnidade(u);
  return g==="massa"?["KG","G"]:g==="volume"?["L","ML"]:g==="unidade"?["UN"]:[String(u||"KG").toUpperCase()];
}
function converterQuantidade(valor,de,para){
  valor=num(valor); de=String(de||"").toUpperCase(); para=String(para||"").toUpperCase();
  if(de===para) return valor;
  if(grupoUnidade(de)!==grupoUnidade(para)) return NaN;
  const f={KG:1000,G:1,L:1000,ML:1,UN:1};
  return valor*(f[de]/f[para]);
}
function quantidadeNaUnidadeBase(item){
  const fonte=fonteFicha(item);
  if(!fonte) return num(item.peso_liquido);
  const base=item.tipo==="preparacao"?(fonte.unidade_rendimento||"UN"):(fonte.unidade||"KG");
  const usada=String(item.unidade||base).toUpperCase();
  if(item.tipo==="preparacao" && usada==="PORÇÃO") return num(item.peso_liquido);
  const c=converterQuantidade(item.peso_liquido,usada,base);
  return Number.isFinite(c)?c:num(item.peso_liquido);
}

/* =========================================================
   INGREDIENTES E PREPARAÇÕES
========================================================= */

function obterInsumo(id) {
  return INSUMOS.find(item => Number(item.id) === Number(id));
}

function preparacoesDisponiveisFicha() {
  const compartilhadas = Array.isArray(window.PREPARACOES_PUBLIC)
    ? window.PREPARACOES_PUBLIC
    : [];
  // A tela de Preparações mantém a fonte compartilhada atualizada.
  // Unifica as duas fontes por id para evitar que um estado local antigo
  // deixe o seletor da Ficha Técnica vazio.
  const porId = new Map();
  [...PREPARACOES, ...compartilhadas].forEach(item => {
    if (item && item.id != null) porId.set(Number(item.id), item);
  });
  return [...porId.values()].filter(item => item.ativo !== false);
}

function obterPreparacao(id) {
  return preparacoesDisponiveisFicha().find(item => Number(item.id) === Number(id));
}

function fonteFicha(item) {
  return item.tipo === "preparacao"
    ? obterPreparacao(item.id)
    : obterInsumo(item.id);
}

function precoFicha(item) {
  const fonte = fonteFicha(item);
  if (item.tipo !== "preparacao") return num(fonte?.preco_real);
  const porcoes = num(fonte?.quantidade_porcoes);
  const pesoPorcao = num(fonte?.peso_porcao) || (porcoes > 0 ? num(fonte?.rendimento) / porcoes : 0);
  const usada = String(item.unidade || fonte?.unidade_rendimento || "UN").toUpperCase();
  /* Preparações porcionadas: a ficha usa custo por porção quando a quantidade
     lançada corresponde ao peso de uma ou mais porções, mesmo em fichas antigas
     que foram salvas em KG antes de existir a unidade PORÇÃO. */
  if (porcoes > 0 && pesoPorcao > 0) {
    if (usada === "PORÇÃO") return num(fonte?.custo_total) / porcoes;
    const qtdBase = quantidadeNaUnidadeBaseSemPorcao(item);
    const qtdPorcoes = qtdBase / pesoPorcao;
    if (Math.abs(qtdPorcoes - Math.round(qtdPorcoes)) < 0.002)
      return qtdBase > 0 ? (num(fonte?.custo_total) / porcoes * qtdPorcoes) / qtdBase : 0;
  }
  return num(fonte?.custo_unitario);
}

function quantidadeNaUnidadeBaseSemPorcao(item){
  const fonte=fonteFicha(item);
  if(!fonte) return num(item.peso_liquido);
  const base=item.tipo==="preparacao"?(fonte.unidade_rendimento||"UN"):(fonte.unidade||"KG");
  const usada=String(item.unidade||base).toUpperCase();
  const c=converterQuantidade(item.peso_liquido,usada,base);
  return Number.isFinite(c)?c:num(item.peso_liquido);
}

function unidadeFicha(item) {
  const fonte = fonteFicha(item);
  return item.tipo === "preparacao"
    ? (fonte?.unidade_rendimento || "—")
    : (fonte?.unidade || "—");
}

function adicionarIngrediente() {
  ITENS_FICHA.push({ tipo: "insumo", id: "", peso_liquido: 0, unidade: "", observacoes: "" });
  renderizarIngredientes();
}

function removerIngrediente(index) {
  ITENS_FICHA.splice(index, 1);
  renderizarIngredientes();
}
window.removerIngrediente = removerIngrediente;

async function alterarTipoItem(index, value) {
  ITENS_FICHA[index].tipo = value;
  ITENS_FICHA[index].id = "";
  ITENS_FICHA[index].unidade = "";

  // Garante lista fresca quando o usuário troca Insumo -> Preparação.
  if (value === "preparacao") {
    try {
      PREPARACOES = (await api("/api/preparacoes")) || [];
      window.PREPARACOES_PUBLIC = PREPARACOES;
    } catch (e) {
      console.error("Não foi possível atualizar as preparações:", e);
    }
  }
  renderizarIngredientes();
}
window.alterarTipoItem = alterarTipoItem;

function alterarInsumo(index, value) {
  ITENS_FICHA[index].id = value ? Number(value) : "";
  const fonte = fonteFicha(ITENS_FICHA[index]);
  ITENS_FICHA[index].unidade = ITENS_FICHA[index].tipo === "preparacao"
    ? (num(fonte?.quantidade_porcoes)>0 ? "PORÇÃO" : (fonte?.unidade_rendimento || ""))
    : (fonte?.unidade || "");
  renderizarIngredientes();
}
window.alterarInsumo = alterarInsumo;

function alterarPesoLiquido(index, value) {
  const bruto = String(value ?? "").replace(/\s/g, "");
  ITENS_FICHA[index].peso_liquido_texto = bruto;
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const valor = parseFloat(normalizado);
  ITENS_FICHA[index].peso_liquido = Number.isFinite(valor) ? valor : 0;
  atualizarLinhaFicha(index);
  calcularFicha();
}
function atualizarLinhaFicha(index) {
  const row = document.querySelector(`[data-ficha-row="${index}"]`);
  if (!row) return;
  const item = ITENS_FICHA[index];
  const fonte = fonteFicha(item);
  const ehPrep = item.tipo === "preparacao";
  const q = num(item.peso_liquido);
  const qBase = quantidadeNaUnidadeBase(item);
  const fc = ehPrep ? 1 : num(fonte?.fc);
  const bruto = qBase * fc;
  const custo = qBase * precoFicha(item);
  const brutoEl = row.querySelector("[data-ficha-bruto]");
  const custoEl = row.querySelector("[data-ficha-custo]");
  if (brutoEl) brutoEl.textContent = ehPrep ? "—" : numero(bruto, 3);
  if (custoEl) custoEl.textContent = moeda(custo);
}
window.alterarPesoLiquido = alterarPesoLiquido;
function alterarUnidadeFicha(index,value){
  ITENS_FICHA[index].unidade=String(value||"").toUpperCase();
  atualizarLinhaFicha(index); calcularFicha();
}
window.alterarUnidadeFicha=alterarUnidadeFicha;

function alterarObservacao(index, value) {
  ITENS_FICHA[index].observacoes = value;
}
window.alterarObservacao = alterarObservacao;

function renderizarIngredientes() {
  const area = $("#ingredientesFicha");
  if (!area) return;

  if (!ITENS_FICHA.length) {
    area.innerHTML = `<div class="empty">Nenhum componente adicionado. Clique em "+ Componente".</div>`;
    calcularFicha();
    return;
  }

  area.innerHTML = `
    <div class="table-wrap ficha-planilha"><table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Código</th>
          <th>Ingrediente / Preparação</th>
          <th>Peso Líquido</th>
          <th>Unidade</th>
          <th>FC</th>
          <th>Peso Bruto</th>
          <th>Preço de Compra</th>
          <th>Preço Real</th>
          <th>Custo do Insumo</th>
          <th>Observação</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
      ${ITENS_FICHA.map((item,index)=>{
        const fonte=fonteFicha(item);
        const ehPrep=item.tipo==="preparacao";
        const q=num(item.peso_liquido);
        const qBase=quantidadeNaUnidadeBase(item);
        const fc=ehPrep?1:num(fonte?.fc);
        const bruto=qBase*fc;
        const precoCompra=ehPrep?null:num(fonte?.preco_compra);
        const precoReal=precoFicha(item);
        const custo=qBase*precoReal;
        const codigo=ehPrep?"—":(fonte?.codigo||"—");
        const opcoes=ehPrep
          ? preparacoesDisponiveisFicha().map(p=>`<option value="${p.id}" ${Number(item.id)===Number(p.id)?"selected":""}>${esc(p.nome)}</option>`).join("")
          : INSUMOS.filter(i=>i.ativo!==false).map(i=>`<option value="${i.id}" ${Number(item.id)===Number(i.id)?"selected":""}>${esc(i.ingrediente)}</option>`).join("");

        return `<tr data-ficha-row="${index}">
          <td><select onchange="alterarTipoItem(${index},this.value)"><option value="insumo" ${!ehPrep?"selected":""}>Insumo</option><option value="preparacao" ${ehPrep?"selected":""}>Preparação</option></select></td>
          <td data-ficha-codigo><b>${esc(codigo)}</b></td>
          <td><select onchange="alterarInsumo(${index},this.value)"><option value="">Selecione...</option>${opcoes}</select></td>
          <td><input class="ficha-qtd" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${esc(item.peso_liquido_texto !== undefined ? item.peso_liquido_texto : (item.peso_liquido?String(item.peso_liquido).replace(".",","):""))}" oninput="alterarPesoLiquido(${index},this.value)"></td>
          <td data-ficha-unidade><select class="ficha-unidade-select" aria-label="Unidade" onchange="alterarUnidadeFicha(${index},this.value)">${(ehPrep && num(fonte?.quantidade_porcoes)>0 ? [...unidadesCompativeis(unidadeFicha(item)),"PORÇÃO"] : unidadesCompativeis(unidadeFicha(item))).map(u=>`<option value="${u}" ${(item.unidade||unidadeFicha(item))===u?"selected":""}>${u}</option>`).join("")}</select></td>
          <td data-ficha-fc>${ehPrep?"—":numero(fc,3)}</td>
          <td data-ficha-bruto>${ehPrep?"—":numero(bruto,3)}</td>
          <td data-ficha-compra>${ehPrep?"—":moeda(precoCompra)}</td>
          <td data-ficha-real>${moeda(precoReal)}</td>
          <td><b data-ficha-custo>${moeda(custo)}</b></td>
          <td><input value="${esc(item.observacoes||"")}" oninput="alterarObservacao(${index},this.value)"></td>
          <td><button type="button" class="danger" aria-label="Remover componente" title="Remover componente" onclick="removerIngrediente(${index})">×</button></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table></div><div class="ficha-scroll-hint">← DESLIZE A TABELA PARA VER TODAS AS COLUNAS →</div>`;
  calcularFicha();
}
function calcularFicha() {
  let custoTotal = 0;
  let rendimento = 0;

  ITENS_FICHA.forEach(item => {
    const quantidade = num(item.peso_liquido);
    const fonte = fonteFicha(item);
    if (!fonte) return;
    const base = item.tipo==="preparacao" ? (fonte.unidade_rendimento||"UN") : (fonte.unidade||"KG");
    const usada = item.unidade || base;
    const grupo = grupoUnidade(usada);
    if (grupo==="massa") rendimento += converterQuantidade(quantidade,usada,"KG");
    else if (grupo==="volume") rendimento += converterQuantidade(quantidade,usada,"L");
    else rendimento += quantidade;
    custoTotal += quantidadeNaUnidadeBase(item) * precoFicha(item);
  });

  const porcoes=num($("#porcoes")?.value);
  const precoVenda=parseValorMonetario($("#precoVenda")?.value);
  const metaCMV=num($("#metaCMV")?.value)||30;
  const pesoPorcao=porcoes>0?rendimento/porcoes:0;
  const custoPorcao=porcoes>0?custoTotal/porcoes:0;
  const cmv=precoVenda>0?(custoPorcao/precoVenda)*100:0;
  const precoSugerido=custoPorcao>0&&metaCMV>0?custoPorcao/(metaCMV/100):0;

  if($("#rendimento"))$("#rendimento").value=rendimento.toFixed(3);
  if($("#pesoPorcao"))$("#pesoPorcao").value=pesoPorcao.toFixed(3);
  if($("#resumoTotal"))$("#resumoTotal").textContent=moeda(custoTotal);
  if($("#resumoPorcao"))$("#resumoPorcao").textContent=moeda(custoPorcao);
  if($("#resumoVenda"))$("#resumoVenda").textContent=moeda(precoVenda);
  if($("#resumoCMV"))$("#resumoCMV").textContent=`${numero(cmv,3)}%`;
  if($("#resumoMetaPercentual"))$("#resumoMetaPercentual").textContent=`${numero(metaCMV,3)}%`;
  if($("#resumoMeta"))$("#resumoMeta").textContent=moeda(precoSugerido);

  return {rendimento,porcoes,pesoPorcao,custoTotal,custoPorcao,precoVenda,metaCMV,precoSugerido,cmv};
}

/* =========================================================
   SALVAR FICHA
========================================================= */

/* =========================================================
   CMV
========================================================= */

/* =========================================================
   USUÁRIOS E PERMISSÕES
========================================================= */

const PERFIS_USUARIO = {
  admin: "Administrador",
  chef: "Gestor / Chef",
  subchef: "Subchef",
  cozinha: "Cozinha",
  estoque: "Estoque"
};

async function telaUsuarios() {
  if (window.USUARIO_ATUAL?.perfil !== "admin") {
    C.innerHTML = `<div class="card"><h3>Acesso restrito</h3><p>Somente o administrador pode gerenciar usuários.</p></div>`;
    return;
  }

  C.innerHTML = `<div class="card">Carregando usuários...</div>`;

  try {
    const usuarios = await api("/api/auth/usuarios");
    C.innerHTML = `
      <div class="section-head">
        <div>
          <small>ACESSO AO SISTEMA</small>
          <h2>Usuários e Permissões</h2>
          <p>Cadastre a equipe e defina o nível de acesso de cada usuário.</p>
        </div>
        <button type="button" class="primary" id="novoUsuario">+ Novo usuário</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${usuarios.map(u => `
                <tr>
                  <td><b>${esc(u.nome)}</b></td>
                  <td>${esc(u.email)}</td>
                  <td>${esc(PERFIS_USUARIO[u.perfil] || u.perfil)}</td>
                  <td>${u.ativo ? "Ativo" : "Inativo"}</td>
                  <td><button type="button" onclick="editarUsuario(${Number(u.id)})">Editar</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;

    $("#novoUsuario").onclick = () => formularioUsuario();
    window.__USUARIOS = usuarios;
  } catch (error) { erro(error); }
}

window.editarUsuario = function(id) {
  const usuario = (window.__USUARIOS || []).find(u => Number(u.id) === Number(id));
  if (usuario) formularioUsuario(usuario);
};

function formularioUsuario(usuario = null) {
  const editando = Boolean(usuario);
  C.innerHTML = `
    <div class="section-head">
      <div><small>USUÁRIOS</small><h2>${editando ? "Editar Usuário" : "Novo Usuário"}</h2></div>
      <button type="button" class="secondary" id="voltarUsuarios">← Voltar</button>
    </div>
    <form id="formUsuario" class="card">
      <div class="form-grid">
        <label>Nome<input id="usuarioNome" required value="${esc(usuario?.nome || "")}"></label>
        <label>E-mail<input id="usuarioEmail" type="email" required value="${esc(usuario?.email || "")}"></label>
        <label>Perfil
          <select id="usuarioPerfil">
            ${Object.entries(PERFIS_USUARIO).map(([valor,rotulo]) =>
              `<option value="${valor}" ${String(usuario?.perfil || "cozinha") === valor ? "selected" : ""}>${rotulo}</option>`
            ).join("")}
          </select>
        </label>
        <label>${editando ? "Nova senha (opcional)" : "Senha"}
          <span class="password-field"><input id="usuarioSenha" type="password" minlength="8" ${editando ? "" : "required"} autocomplete="new-password" placeholder="Mínimo de 8 caracteres"><button type="button" class="password-toggle" aria-label="Mostrar senha" onclick="window.MISEVO_TOGGLE_PASSWORD(this)">👁</button></span>
        </label>
        ${editando ? `<label>Status
          <select id="usuarioAtivo">
            <option value="true" ${usuario.ativo ? "selected" : ""}>Ativo</option>
            <option value="false" ${!usuario.ativo ? "selected" : ""}>Inativo</option>
          </select>
        </label>` : ""}
      </div>
      <div class="card permission-help">
        <b>Permissões</b>
        <p><strong>Administrador:</strong> acesso total e gestão de usuários.</p>
        <p><strong>Gestor / Chef:</strong> acesso operacional completo, sem gestão de usuários.</p>
        <p><strong>Cozinha:</strong> consulta de fichas, insumos e painel.</p>
        <p><strong>Estoque:</strong> consulta de insumos e painel.</p>
      </div>
      <div class="actions">
        <button type="button" class="secondary" id="cancelarUsuario">Cancelar</button>
        <button type="submit" class="primary">${editando ? "Salvar alterações" : "Criar usuário"}</button>
      </div>
    </form>`;

  $("#voltarUsuarios").onclick = telaUsuarios;
  $("#cancelarUsuario").onclick = telaUsuarios;
  $("#formUsuario").onsubmit = async event => {
    event.preventDefault();
    const senha = $("#usuarioSenha").value;
    const payload = {
      nome: $("#usuarioNome").value.trim(),
      email: $("#usuarioEmail").value.trim(),
      perfil: $("#usuarioPerfil").value
    };
    if (senha) payload.senha = senha;
    if (editando) payload.ativo = $("#usuarioAtivo").value === "true";

    try {
      await api(editando ? `/api/auth/usuarios/${usuario.id}` : "/api/auth/usuarios", {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      await telaUsuarios();
    } catch (error) { erro(error); }
  };
}


/* =========================================================
   BOTÃO GLOBAL NOVA FICHA
========================================================= */

const botaoNovaFicha = $("#newFicha");

if (botaoNovaFicha) {
  botaoNovaFicha.onclick = () => {
    const abaFichas = document.querySelector(
      'nav button[data-tab="fichas"]'
    );

    document
      .querySelectorAll("nav button[data-tab]")
      .forEach(botao => botao.classList.remove("active"));

    if (abaFichas) {
      abaFichas.classList.add("active");
    }

    novaFicha();
  };
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function iniciar() {
  try {
    C.innerHTML = `
      <div class="card">
        Carregando...
      </div>
    `;

    await carregarDados();
    telaPainel();
  } catch (error) {
    console.error(error);

    C.innerHTML = `
      <div class="card">
        <h3>Não foi possível carregar o aplicativo.</h3>
        <p>${esc(error.message || "Erro desconhecido.")}</p>
      </div>
    `;
  }
}

iniciar();
