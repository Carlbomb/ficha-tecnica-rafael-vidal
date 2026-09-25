const $ = selector => document.querySelector(selector);
const C = $("#content");

let INSUMOS = [];
let FICHAS = [];
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
  const [insumos, fichas] = await Promise.all([
    api("/api/insumos"),
    api("/api/fichas")
  ]);

  INSUMOS = insumos || [];
  FICHAS = fichas || [];
  atualizarPainel();

  PREPARACOES = await api("/api/preparacoes");
  window.PREPARACOES_PUBLIC = PREPARACOES;
}

function atualizarPainel() {
  const ni = $("#ni");
  const nf = $("#nf");
  const avg = $("#avg");

  if (ni) {
    ni.textContent = INSUMOS.filter(i => i.ativo !== false).length;
  }

  if (nf) {
    nf.textContent = FICHAS.filter(f => f.ativo !== false).length;
  }

  const validas = FICHAS.filter(f => num(f.cmv_percentual) > 0);
  const media = validas.length
    ? validas.reduce((soma, f) => soma + num(f.cmv_percentual), 0) / validas.length
    : 0;

  if (avg) {
    avg.textContent = `${numero(media, 1)}%`;
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
  if (botao.dataset.tab === "fichas") telaFichas();
  if (botao.dataset.tab === "preparacoes") telaPreparacoes();
  if (botao.dataset.tab === "cmv") telaCMV();
  if (botao.dataset.tab === "usuarios") telaUsuarios();
});


/* =========================================================
   PAINEL
========================================================= */

function telaPainel() {
  const fichasAtivas = FICHAS.filter(f => f.ativo !== false);
  const insumosAtivos = INSUMOS.filter(i => i.ativo !== false);
  const preparacoesAtivas = PREPARACOES.filter(p => p.ativo !== false);

  const fichasComCMV = fichasAtivas.filter(f => num(f.cmv_percentual) > 0);
  const cmvMedio = fichasComCMV.length
    ? fichasComCMV.reduce((s, f) => s + num(f.cmv_percentual), 0) / fichasComCMV.length
    : 0;

  const acimaMeta = fichasAtivas.filter(f => {
    const cmv = num(f.cmv_percentual);
    const meta = num(f.meta_cmv) || 30;
    return cmv > 0 && cmv > meta;
  });

  const dentroMeta = fichasComCMV.filter(f => {
    const meta = num(f.meta_cmv) || 30;
    return num(f.cmv_percentual) <= meta;
  });

  const custoMedioPorcao = fichasAtivas.length
    ? fichasAtivas.reduce((s, f) => s + num(f.custo_por_porcao), 0) / fichasAtivas.length
    : 0;

  const recentes = [...fichasAtivas]
    .sort((a,b) => {
      const da = new Date(a.updated_at || a.created_at || 0).getTime();
      const db = new Date(b.updated_at || b.created_at || 0).getTime();
      return db - da || Number(b.id) - Number(a.id);
    })
    .slice(0,5);

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>PAINEL</small>
        <h2>Visão Geral</h2>
        <p>Indicadores rápidos para acompanhar fichas, custos e preparações.</p>
      </div>
    </div>

    <div class="summary-grid painel-kpis">
      <div><span>Insumos</span><strong>${insumosAtivos.length}</strong></div>
      <div><span>Fichas Técnicas</span><strong>${fichasAtivas.length}</strong></div>
      <div><span>Preparações</span><strong>${preparacoesAtivas.length}</strong></div>
      <div><span>CMV Médio</span><strong>${numero(cmvMedio,1)}%</strong></div>
      <div><span>Acima da Meta</span><strong>${acimaMeta.length}</strong></div>
      <div><span>Custo Médio / Porção</span><strong>${moeda(custoMedioPorcao)}</strong></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head">
        <div>
          <small>ATENÇÃO NECESSÁRIA</small>
          <h3>Resumo de CMV</h3>
        </div>
      </div>
      <div class="summary-grid">
        <div><span>Dentro da meta</span><strong>${dentroMeta.length}</strong></div>
        <div><span>Acima da meta</span><strong>${acimaMeta.length}</strong></div>
        <div><span>Sem CMV calculado</span><strong>${fichasAtivas.length - fichasComCMV.length}</strong></div>
      </div>
      ${acimaMeta.length ? `
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead><tr><th>Ficha</th><th>CMV Atual</th><th>Meta</th><th></th></tr></thead>
            <tbody>
              ${acimaMeta.slice(0,5).map(f => `
                <tr>
                  <td><b>${esc(f.nome_prato)}</b></td>
                  <td>${numero(f.cmv_percentual,1)}%</td>
                  <td>${numero(f.meta_cmv || 30,1)}%</td>
                  <td><button type="button" onclick="editarFicha(${Number(f.id)})">Abrir</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<div class="empty" style="margin-top:16px">Nenhuma ficha está acima da meta de CMV.</div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head">
        <div><small>ACESSO RÁPIDO</small><h3>Ações frequentes</h3></div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <button type="button" class="primary" onclick="novaFicha()">+ Nova Ficha</button>
        <button type="button" class="secondary" id="painelNovoInsumo">+ Novo Insumo</button>
        <button type="button" class="secondary" id="painelNovaPreparacao">+ Nova Preparação</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-head">
        <div><small>RECENTES</small><h3>Últimas Fichas</h3></div>
      </div>
      ${recentes.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Preparação</th><th>Categoria</th><th>Custo/Porção</th><th>CMV</th><th></th></tr></thead>
            <tbody>
              ${recentes.map(f => `
                <tr>
                  <td><b>${esc(f.nome_prato)}</b></td>
                  <td>${esc(f.categoria || "—")}</td>
                  <td>${moeda(f.custo_por_porcao)}</td>
                  <td>${numero(f.cmv_percentual,1)}%</td>
                  <td><button type="button" onclick="editarFicha(${Number(f.id)})">Abrir</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<div class="empty">Nenhuma ficha técnica cadastrada.</div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <small>PRÓXIMOS INDICADORES</small>
      <p style="margin-bottom:0">Estoque baixo, validades, produção do dia e perdas aparecerão aqui conforme esses módulos forem ativados.</p>
    </div>
  `;

  const novoInsumo = $("#painelNovoInsumo");
  if (novoInsumo) novoInsumo.onclick = () => formularioInsumo();

  const novaPrep = $("#painelNovaPreparacao");
  if (novaPrep) novaPrep.onclick = () => {
    const botao = document.querySelector('nav button[data-tab="preparacoes"]');
    if (botao) botao.click();
  };
}

/* =========================================================
   BANCO DE DADOS / INSUMOS
========================================================= */

function telaInsumos() {
  EDITANDO_INSUMO = null;

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
  const busca = String($("#buscaInsumo")?.value || "")
    .trim()
    .toLowerCase();

  const lista = INSUMOS.filter(item => {
    const texto = [
      item.codigo,
      item.ingrediente,
      item.fornecedor,
      item.unidade
    ].join(" ").toLowerCase();

    return texto.includes(busca);
  });

  if (!lista.length) {
    $("#listaInsumos").innerHTML = `
      <div class="empty">Nenhum insumo encontrado.</div>
    `;
    return;
  }

  $("#listaInsumos").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cód.</th>
            <th>Ingrediente</th>
            <th>Unid.</th>
            <th>P. Bruto</th>
            <th>P. Líquido</th>
            <th>FC</th>
            <th>Preço Compra</th>
            <th>Preço Real</th>
            <th>Fornecedor</th>
            <th>Data Cotação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(item => `
            <tr>
              <td><b>${esc(item.codigo)}</b></td>
              <td><b>${esc(item.ingrediente)}</b></td>
              <td>${esc(item.unidade)}</td>
              <td>${numero(item.peso_bruto)}</td>
              <td>${numero(item.peso_liquido)}</td>
              <td>${numero(item.fc, 4)}</td>
              <td>${moeda(item.preco_compra)}</td>
              <td><b>${moeda(item.preco_real)}</b></td>
              <td>${esc(item.fornecedor || "—")}</td>
              <td>${
                item.data_cotacao
                  ? esc(String(item.data_cotacao).slice(0, 10))
                  : "—"
              }</td>
              <td>
                <button type="button" onclick="editarInsumo(${item.id})">
                  Editar
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
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

    $("#fc").value = numero(fc, 4);
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
   FICHAS TÉCNICAS
========================================================= */

function telaFichas() {
  EDITANDO_FICHA = null;
  ITENS_FICHA = [];

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>FICHAS TÉCNICAS</small>
        <h2>Fichas de Produção</h2>
        <p>Custos e CMV calculados automaticamente pelo Banco de Dados.</p>
      </div>

      <button type="button" class="primary" id="novaFichaBtn">
        + Nova ficha
      </button>
    </div>

    <div class="card">
      <input
        id="buscaFicha"
        placeholder="Buscar preparação ou categoria..."
      >
      <div id="listaFichas" style="margin-top:12px"></div>
    </div>
  `;

  $("#novaFichaBtn").onclick = novaFicha;
  $("#buscaFicha").oninput = listarFichas;
  listarFichas();
}

function listarFichas() {
  const busca = String($("#buscaFicha")?.value || "")
    .trim()
    .toLowerCase();

  const lista = FICHAS.filter(ficha =>
    [ficha.nome_prato, ficha.categoria]
      .join(" ")
      .toLowerCase()
      .includes(busca)
  );

  if (!lista.length) {
    $("#listaFichas").innerHTML = `
      <div class="empty">Nenhuma ficha técnica encontrada.</div>
    `;
    return;
  }

  $("#listaFichas").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Preparação</th>
            <th>Categoria</th>
            <th>Rendimento</th>
            <th>Porções</th>
            <th>Custo Total</th>
            <th>Custo/Porção</th>
            <th>Preço Venda</th>
            <th>CMV</th>
            <th>Meta</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(ficha => `
            <tr>
              <td><b>${esc(ficha.nome_prato)}</b></td>
              <td>${esc(ficha.categoria || "—")}</td>
              <td>${numero(ficha.rendimento_kg, 4)}</td>
              <td>${numero(ficha.porcoes, 0)}</td>
              <td>${moeda(ficha.custo_total)}</td>
              <td>${moeda(ficha.custo_por_porcao)}</td>
              <td>${moeda(ficha.preco_venda)}</td>
              <td><b>${numero(ficha.cmv_percentual, 1)}%</b></td>
              <td>${numero(ficha.meta_cmv ?? 30, 1)}%</td>
              <td>
                <button type="button" onclick="editarFicha(${ficha.id})">
                  Abrir
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

window.novaFicha = function() {
  EDITANDO_FICHA = null;
  ITENS_FICHA = [];
  formularioFicha();
};

window.editarFicha = async function(id) {
  try {
    const ficha = await api(`/api/fichas/${id}`);
    EDITANDO_FICHA = ficha;

    ITENS_FICHA = [
      ...(ficha.ingredientes || []).map(item => ({
        tipo: "insumo",
        id: Number(item.insumo_id),
        peso_liquido: num(item.peso_liquido),
        unidade: item.unidade || unidadeFicha(item),
        observacoes: item.observacoes || ""
      })),
      ...(ficha.preparacoes || []).map(item => ({
        tipo: "preparacao",
        id: Number(item.preparacao_id),
        peso_liquido: num(item.quantidade),
        observacoes: item.observacoes || ""
      }))
    ];

    formularioFicha(ficha);
  } catch (error) {
    erro(error);
  }
};

/* =========================================================
   FORMULÁRIO DA FICHA
========================================================= */

async function formularioFicha(ficha = null) {
  const editando = Boolean(ficha);

  // Recarrega as preparações ao abrir a ficha. Assim uma sub-receita criada
  // nesta mesma sessão aparece imediatamente no seletor da Ficha Técnica.
  try {
    PREPARACOES = (await api("/api/preparacoes")) || [];
    window.PREPARACOES_PUBLIC = PREPARACOES;
  } catch (e) {
    console.error("Não foi possível atualizar as preparações da ficha:", e);
  }

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>FICHA TÉCNICA</small>
        <h2>${editando ? esc(ficha.nome_prato) : "Nova Ficha Técnica"}</h2>
        <p>Ficha Técnica de Produção</p>
      </div>

      <button type="button" class="secondary" id="voltarFichas">
        ← Voltar
      </button>
    </div>

    <form id="formFicha">

      <div class="card form-grid">

        <label>
          Nome do Prato / Preparação
          <input
            id="nomePrato"
            required
            value="${esc(ficha?.nome_prato || "")}"
            placeholder="Nome da preparação"
          >
        </label>

        <label>
          Categoria
          <select id="categoria">
            ${[
              "Bases e Fundos",
              "Molhos",
              "Carnes e Aves",
              "Pescados e Frutos do Mar",
              "Massas",
              "Arroz e Cereais",
              "Guarnições",
              "Vegetais e Saladas",
              "Padaria",
              "Confeitaria e Sobremesas",
              "Marinadas e Condimentos",
              "Pré-preparos"
            ].concat(
              ficha?.categoria && ![
                "Bases e Fundos","Molhos","Carnes e Aves","Pescados e Frutos do Mar",
                "Massas","Arroz e Cereais","Guarnições","Vegetais e Saladas",
                "Padaria","Confeitaria e Sobremesas","Marinadas e Condimentos","Pré-preparos"
              ].includes(ficha.categoria) ? [ficha.categoria] : []
            ).map(categoria => `
              <option
                value="${categoria}"
                ${
                  String(ficha?.categoria || "Pré-preparos") === categoria
                    ? "selected"
                    : ""
                }
              >
                ${categoria}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Rendimento da Receita
          <input
            id="rendimento"
            type="number"
            step="0.0001"
            value="0"
            disabled
          >
        </label>

        <label>
          Quantidade de Porções
          <input
            id="porcoes"
            type="number"
            step="1"
            min="1"
            required
            value="${ficha?.porcoes ?? 1}"
          >
        </label>

        <label>
          Peso da Porção
          <input id="pesoPorcao" value="0" disabled>
        </label>

        <label>
          Preço de Venda / Porção
          <input
            id="precoVenda"
            type="number"
            step="0.01"
            min="0"
            value="${ficha?.preco_venda ?? 0}"
          >
        </label>

        <label>
          Meta de CMV (%)
          <input
            id="metaCMV"
            type="number"
            step="0.1"
            min="0.1"
            max="100"
            value="${ficha?.meta_cmv ?? 30}"
          >
        </label>

      </div>

      <div class="card">
        <div class="section-head">
          <div>
            <small>COMPOSIÇÃO</small>
            <h3>Insumos e Preparações</h3>
          </div>

          <button type="button" class="primary" id="adicionarItem">
            + Componente
          </button>
        </div>

        <div id="ingredientesFicha"></div>
      </div>

      <div class="card">
        <h3>Resumo da Receita</h3>

        <div class="summary-grid">
          <div>
            <span>Custo Total</span>
            <strong id="resumoTotal">R$ 0,00</strong>
          </div>

          <div>
            <span>Custo por Porção</span>
            <strong id="resumoPorcao">R$ 0,00</strong>
          </div>

          <div>
            <span>Preço de Venda</span>
            <strong id="resumoVenda">R$ 0,00</strong>
          </div>

          <div>
            <span>CMV Atual</span>
            <strong id="resumoCMV">0,0%</strong>
          </div>

          <div>
            <span>Meta CMV</span>
            <strong id="resumoMetaPercentual">30,0%</strong>
          </div>

          <div>
            <span>Preço Sugerido</span>
            <strong id="resumoMeta">R$ 0,00</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <label>
          Modo de Preparo
          <textarea
            id="modoPreparo"
            rows="7"
            placeholder="Descreva o modo de preparo..."
          >${esc(ficha?.modo_preparo || "")}</textarea>
        </label>

        <label style="margin-top:15px">
          Observações
          <textarea
            id="observacoesFicha"
            rows="4"
          >${esc(ficha?.observacoes || "")}</textarea>
        </label>
      </div>

      <div class="actions">
        <button type="button" class="secondary" id="cancelarFicha">
          Cancelar
        </button>

        ${editando ? `
          <button type="button" class="danger" id="excluirFicha">
            Excluir ficha
          </button>
        ` : ""}

        <button type="submit" class="primary">
          ${editando ? "Salvar alterações" : "Salvar ficha"}
        </button>
      </div>

    </form>
  `;

  $("#voltarFichas").onclick = telaFichas;
  $("#cancelarFicha").onclick = telaFichas;
  $("#adicionarItem").onclick = adicionarIngrediente;
  $("#porcoes").oninput = calcularFicha;
  $("#precoVenda").oninput = calcularFicha;
  $("#metaCMV").oninput = calcularFicha;
  $("#formFicha").onsubmit = salvarFicha;

  if (editando) {
    $("#excluirFicha").onclick = excluirFicha;
  }

  renderizarIngredientes();
  calcularFicha();
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
  const usada=item.unidade||base;
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
  return item.tipo === "preparacao"
    ? num(fonte?.custo_unitario)
    : num(fonte?.preco_real);
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
    ? (fonte?.unidade_rendimento || "")
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
  if (brutoEl) brutoEl.textContent = ehPrep ? "—" : numero(bruto, 4);
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
          <td data-ficha-unidade><select class="ficha-unidade-select" aria-label="Unidade" onchange="alterarUnidadeFicha(${index},this.value)">${unidadesCompativeis(unidadeFicha(item)).map(u=>`<option value="${u}" ${(item.unidade||unidadeFicha(item))===u?"selected":""}>${u}</option>`).join("")}</select></td>
          <td data-ficha-fc>${ehPrep?"—":numero(fc,4)}</td>
          <td data-ficha-bruto>${ehPrep?"—":numero(bruto,4)}</td>
          <td data-ficha-compra>${ehPrep?"—":moeda(precoCompra)}</td>
          <td data-ficha-real>${moeda(precoReal)}</td>
          <td><b data-ficha-custo>${moeda(custo)}</b></td>
          <td><input value="${esc(item.observacoes||"")}" oninput="alterarObservacao(${index},this.value)"></td>
          <td><button type="button" class="danger" onclick="removerIngrediente(${index})">×</button></td>
        </tr>`;
      }).join("")}
      </tbody>
    </table></div>`;
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
  const precoVenda=num($("#precoVenda")?.value);
  const metaCMV=num($("#metaCMV")?.value)||30;
  const pesoPorcao=porcoes>0?rendimento/porcoes:0;
  const custoPorcao=porcoes>0?custoTotal/porcoes:0;
  const cmv=precoVenda>0?(custoPorcao/precoVenda)*100:0;
  const precoSugerido=custoPorcao>0&&metaCMV>0?custoPorcao/(metaCMV/100):0;

  if($("#rendimento"))$("#rendimento").value=rendimento.toFixed(4);
  if($("#pesoPorcao"))$("#pesoPorcao").value=pesoPorcao.toFixed(4);
  if($("#resumoTotal"))$("#resumoTotal").textContent=moeda(custoTotal);
  if($("#resumoPorcao"))$("#resumoPorcao").textContent=moeda(custoPorcao);
  if($("#resumoVenda"))$("#resumoVenda").textContent=moeda(precoVenda);
  if($("#resumoCMV"))$("#resumoCMV").textContent=`${numero(cmv,1)}%`;
  if($("#resumoMetaPercentual"))$("#resumoMetaPercentual").textContent=`${numero(metaCMV,1)}%`;
  if($("#resumoMeta"))$("#resumoMeta").textContent=moeda(precoSugerido);

  return {rendimento,porcoes,pesoPorcao,custoTotal,custoPorcao,precoVenda,metaCMV,precoSugerido,cmv};
}

/* =========================================================
   SALVAR FICHA
========================================================= */

async function salvarFicha(event) {
  event.preventDefault();

  const itensValidos = ITENS_FICHA.filter(
    item => item.id && num(item.peso_liquido) > 0
  );

  if (!itensValidos.length) {
    alert("Adicione pelo menos um insumo ou preparação à ficha técnica.");
    return;
  }

  const calculos = calcularFicha();

  if (calculos.porcoes <= 0) {
    alert("Informe uma quantidade de porções maior que zero.");
    return;
  }

  if (calculos.metaCMV <= 0 || calculos.metaCMV > 100) {
    alert("A meta de CMV deve estar entre 0,1% e 100%.");
    return;
  }

  const payload = {
    nome_prato: $("#nomePrato").value.trim(),
    categoria: $("#categoria").value,
    rendimento_kg: calculos.rendimento,
    porcoes: calculos.porcoes,
    preco_venda: calculos.precoVenda,
    meta_cmv: calculos.metaCMV,
    modo_preparo: $("#modoPreparo").value.trim(),
    observacoes: $("#observacoesFicha").value.trim(),
    status: "Ativa",
    ativo: true,

    ingredientes: itensValidos
      .filter(item => item.tipo !== "preparacao")
      .map(item => ({
        insumo_id: item.id,
        peso_liquido: num(item.peso_liquido),
        observacoes: item.observacoes || ""
      })),

    preparacoes: itensValidos
      .filter(item => item.tipo === "preparacao")
      .map(item => ({
        preparacao_id: item.id,
        quantidade: num(item.peso_liquido),
        observacoes: item.observacoes || ""
      }))
  };

  try {
    if (EDITANDO_FICHA) {
      await api(`/api/fichas/${EDITANDO_FICHA.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/fichas", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    await carregarDados();
    telaFichas();
  } catch (error) {
    erro(error);
  }
}

/* =========================================================
   EXCLUIR FICHA
========================================================= */

async function excluirFicha() {
  if (!EDITANDO_FICHA) return;

  const confirmar = confirm(
    `Excluir a ficha "${EDITANDO_FICHA.nome_prato}"?`
  );

  if (!confirmar) return;

  try {
    await api(`/api/fichas/${EDITANDO_FICHA.id}`, {
      method: "DELETE"
    });

    await carregarDados();
    telaFichas();
  } catch (error) {
    erro(error);
  }
}

/* =========================================================
   CMV
========================================================= */

function telaCMV() {
  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>CONTROLE DE CMV</small>
        <h2>Análise das Fichas</h2>
        <p>
          Compare o CMV atual de cada preparação com a meta definida na ficha.
        </p>
      </div>
    </div>

    <div class="card">
      ${
        !FICHAS.length
          ? `
            <div class="empty">
              Nenhuma ficha técnica cadastrada.
            </div>
          `
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Preparação</th>
                    <th>Custo Total</th>
                    <th>Porções</th>
                    <th>Custo/Porção</th>
                    <th>Preço Venda</th>
                    <th>CMV Atual</th>
                    <th>Meta</th>
                    <th>Preço Sugerido</th>
                  </tr>
                </thead>

                <tbody>
                  ${FICHAS.map(ficha => {
                    const meta = num(ficha.meta_cmv) || 30;
                    const custoPorcao = num(ficha.custo_por_porcao);
                    const precoSugerido =
                      meta > 0
                        ? custoPorcao / (meta / 100)
                        : 0;

                    return `
                      <tr>
                        <td><b>${esc(ficha.nome_prato)}</b></td>
                        <td>${moeda(ficha.custo_total)}</td>
                        <td>${numero(ficha.porcoes, 0)}</td>
                        <td>${moeda(ficha.custo_por_porcao)}</td>
                        <td>${moeda(ficha.preco_venda)}</td>
                        <td><b>${numero(ficha.cmv_percentual, 1)}%</b></td>
                        <td>${numero(meta, 1)}%</td>
                        <td><b>${moeda(precoSugerido)}</b></td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}


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
