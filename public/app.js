const $ = selector => document.querySelector(selector);

const C = $("#content");

let INSUMOS = [];
let FICHAS = [];
let EDITANDO_INSUMO = null;
let EDITANDO_FICHA = null;
let ITENS_FICHA = [];

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
  const config = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  const response = await fetch(url, config);

  if (response.status === 204) {
    return null;
  }

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

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
   CARREGAMENTO GERAL
========================================================= */

async function carregarDados() {
  try {
    const [insumos, fichas] = await Promise.all([
      api("/api/insumos"),
      api("/api/fichas")
    ]);

    INSUMOS = insumos || [];
    FICHAS = fichas || [];

    atualizarPainel();
  } catch (error) {
    erro(error);
  }
}

function atualizarPainel() {
  const ni = $("#ni");
  const nf = $("#nf");
  const avg = $("#avg");

  if (ni) {
    ni.textContent = INSUMOS.filter(
      item => item.ativo !== false
    ).length;
  }

  if (nf) {
    nf.textContent = FICHAS.filter(
      item => item.ativo !== false
    ).length;
  }

  const validas = FICHAS.filter(
    ficha => num(ficha.cmv_percentual) > 0
  );

  const media = validas.length
    ? validas.reduce(
        (soma, ficha) =>
          soma + num(ficha.cmv_percentual),
        0
      ) / validas.length
    : 0;

  if (avg) {
    avg.textContent =
      `${numero(media, 1)}%`;
  }
}

/* =========================================================
   NAVEGAÇÃO
========================================================= */

document.addEventListener("click", event => {
  const botao =
    event.target.closest("nav button[data-tab]");

  if (!botao) return;

  document
    .querySelectorAll("nav button[data-tab]")
    .forEach(item =>
      item.classList.remove("active")
    );

  botao.classList.add("active");

  const tab = botao.dataset.tab;

  if (tab === "insumos") {
    telaInsumos();
  }

  if (tab === "fichas") {
    telaFichas();
  }

  if (tab === "cmv") {
    telaCMV();
  }
});

/* =========================================================
   BANCO DE DADOS
========================================================= */

function telaInsumos() {
  EDITANDO_INSUMO = null;

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>BANCO DE DADOS</small>
        <h2>Insumos Base</h2>
        <p>
          Cadastro utilizado automaticamente
          pelas fichas técnicas.
        </p>
      </div>

      <button
        class="primary"
        id="novoInsumo"
      >
        + Novo insumo
      </button>
    </div>

    <div class="card">
      <div class="toolbar">
        <input
          id="buscaInsumo"
          placeholder="Buscar código, ingrediente ou fornecedor..."
        >
      </div>

      <div id="listaInsumos"></div>
    </div>
  `;

  $("#novoInsumo").onclick =
    () => formularioInsumo();

  $("#buscaInsumo").oninput =
    listarInsumos;

  listarInsumos();
}

function listarInsumos() {
  const busca =
    String($("#buscaInsumo")?.value || "")
      .trim()
      .toLowerCase();

  const lista = INSUMOS.filter(item => {
    const texto = [
      item.codigo,
      item.ingrediente,
      item.fornecedor,
      item.unidade
    ]
      .join(" ")
      .toLowerCase();

    return texto.includes(busca);
  });

  if (!lista.length) {
    $("#listaInsumos").innerHTML = `
      <div class="empty">
        Nenhum insumo encontrado.
      </div>
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
              <td>
                <b>${esc(item.codigo)}</b>
              </td>

              <td>
                <b>${esc(item.ingrediente)}</b>
              </td>

              <td>
                ${esc(item.unidade)}
              </td>

              <td>
                ${numero(item.peso_bruto)}
              </td>

              <td>
                ${numero(item.peso_liquido)}
              </td>

              <td>
                ${numero(item.fc, 3)}
              </td>

              <td>
                ${moeda(item.preco_compra)}
              </td>

              <td>
                <b>${moeda(item.preco_real)}</b>
              </td>

              <td>
                ${esc(item.fornecedor || "—")}
              </td>

              <td>
                ${item.data_cotacao
                  ? esc(
                      String(
                        item.data_cotacao
                      ).slice(0, 10)
                    )
                  : "—"}
              </td>

              <td>
                <button
                  class="ghost small"
                  onclick="editarInsumo(${item.id})"
                >
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

/* =========================================================
   NOVO / EDITAR INSUMO
========================================================= */

window.editarInsumo = function(id) {
  const item = INSUMOS.find(
    insumo => Number(insumo.id) === Number(id)
  );

  if (!item) return;

  formularioInsumo(item);
};

function formularioInsumo(item = null) {
  EDITANDO_INSUMO = item;

  const novo = !item;

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>BANCO DE DADOS</small>
        <h2>
          ${novo
            ? "Novo Insumo"
            : "Editar Insumo"}
        </h2>
      </div>

      <button
        class="ghost"
        id="voltarInsumos"
      >
        ← Voltar
      </button>
    </div>

    <form
      id="formInsumo"
      class="card form-grid"
    >

      ${!novo ? `
        <label>
          Código
          <input
            value="${esc(item.codigo)}"
            disabled
          >
        </label>
      ` : ""}

      <label class="span-2">
        Ingrediente
        <input
          id="ingrediente"
          required
          value="${esc(item?.ingrediente || "")}"
          placeholder="Ex.: Farinha de trigo"
        >
      </label>

      <label>
        Unidade
        <select id="unidade">
          ${[
            "KG",
            "L",
            "UN",
            "MC",
            "PCT"
          ].map(unidade => `
            <option
              value="${unidade}"
              ${
                String(
                  item?.unidade || "KG"
                ).toUpperCase() === unidade
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
        <input
          id="fc"
          value="${numero(item?.fc ?? 1, 4)}"
          disabled
        >
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
        <input
          id="precoReal"
          value="${moeda(item?.preco_real ?? 0)}"
          disabled
        >
      </label>

      <label class="span-2">
        Fornecedor
        <input
          id="fornecedor"
          value="${esc(item?.fornecedor || "")}"
          placeholder="Fornecedor"
        >
      </label>

      <label>
        Data da Cotação
        <input
          id="dataCotacao"
          type="date"
          value="${
            item?.data_cotacao
              ? String(
                  item.data_cotacao
                ).slice(0, 10)
              : ""
          }"
        >
      </label>

      <label class="span-2">
        Observações
        <textarea
          id="observacoesInsumo"
          rows="3"
        >${esc(item?.observacoes || "")}</textarea>
      </label>

      <div class="calc-box span-2">
        <div>
          <span>Fator de Correção</span>
          <strong id="previewFC">
            ${numero(item?.fc ?? 1, 4)}
          </strong>
        </div>

        <div>
          <span>Preço Real</span>
          <strong id="previewReal">
            ${moeda(item?.preco_real ?? 0)}
          </strong>
        </div>
      </div>

      <div class="actions span-2">
        <button
          type="button"
          class="ghost"
          id="cancelarInsumo"
        >
          Cancelar
        </button>

        ${
          !novo
            ? `
              <button
                type="button"
                class="danger"
                id="excluirInsumo"
              >
                Excluir
              </button>
            `
            : ""
        }

        <button
          type="submit"
          class="primary"
        >
          ${novo
            ? "Salvar insumo"
            : "Salvar alterações"}
        </button>
      </div>
    </form>
  `;

  const atualizarCalculo = () => {
    const bruto =
      num($("#pesoBruto").value);

    const liquido =
      num($("#pesoLiquido").value);

    const compra =
      num($("#precoCompra").value);

    const fc =
      liquido > 0
        ? bruto / liquido
        : 0;

    const real =
      compra * fc;

    $("#fc").value =
      numero(fc, 4);

    $("#precoReal").value =
      moeda(real);

    $("#previewFC").textContent =
      numero(fc, 4);

    $("#previewReal").textContent =
      moeda(real);
  };

  $("#pesoBruto").oninput =
    atualizarCalculo;

  $("#pesoLiquido").oninput =
    atualizarCalculo;

  $("#precoCompra").oninput =
    atualizarCalculo;

  $("#voltarInsumos").onclick =
    telaInsumos;

  $("#cancelarInsumo").onclick =
    telaInsumos;

  if (!novo) {
    $("#excluirInsumo").onclick =
      excluirInsumo;
  }

  $("#formInsumo").onsubmit =
    salvarInsumo;

  atualizarCalculo();
}

/* =========================================================
   SALVAR INSUMO
========================================================= */

async function salvarInsumo(event) {
  event.preventDefault();

  const payload = {
    ingrediente:
      $("#ingrediente").value.trim(),

    unidade:
      $("#unidade").value,

    peso_bruto:
      num($("#pesoBruto").value),

    peso_liquido:
      num($("#pesoLiquido").value),

    preco_compra:
      num($("#precoCompra").value),

    fornecedor:
      $("#fornecedor").value.trim(),

    data_cotacao:
      $("#dataCotacao").value || null,

    observacoes:
      $("#observacoesInsumo").value.trim(),

    ativo: true
  };

  try {
    if (EDITANDO_INSUMO) {
      await api(
        `/api/insumos/${EDITANDO_INSUMO.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );
    } else {
      await api(
        "/api/insumos",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
    }

    await carregarDados();

    telaInsumos();

  } catch (error) {
    erro(error);
  }
}

/* =========================================================
   EXCLUIR INSUMO
========================================================= */

async function excluirInsumo() {
  if (!EDITANDO_INSUMO) return;

  const confirmar = confirm(
    `Excluir "${EDITANDO_INSUMO.ingrediente}" do Banco de Dados?`
  );

  if (!confirmar) return;

  try {
    await api(
      `/api/insumos/${EDITANDO_INSUMO.id}`,
      {
        method: "DELETE"
      }
    );

    await carregarDados();

    telaInsumos();

  } catch (error) {
    erro(error);
  }
}

/* =========================================================
   FIM DA PARTE 1

   A PARTE 2 COMEÇA EM:
   FICHAS TÉCNICAS
========================================================= */
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
        <p>
          Custos calculados automaticamente
          pelo Banco de Dados.
        </p>
      </div>

      <button
        class="primary"
        id="novaFichaBtn"
      >
        + Nova ficha
      </button>
    </div>

    <div class="card">
      <div class="toolbar">
        <input
          id="buscaFicha"
          placeholder="Buscar preparação ou categoria..."
        >
      </div>

      <div id="listaFichas"></div>
    </div>
  `;

  $("#novaFichaBtn").onclick =
    () => novaFicha();

  $("#buscaFicha").oninput =
    listarFichas;

  listarFichas();
}

function listarFichas() {
  const busca =
    String($("#buscaFicha")?.value || "")
      .trim()
      .toLowerCase();

  const lista = FICHAS.filter(ficha => {
    const texto = [
      ficha.nome_prato,
      ficha.categoria,
      ficha.status
    ]
      .join(" ")
      .toLowerCase();

    return texto.includes(busca);
  });

  if (!lista.length) {
    $("#listaFichas").innerHTML = `
      <div class="empty">
        Nenhuma ficha técnica encontrada.
      </div>
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
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${lista.map(ficha => `
            <tr>
              <td>
                <b>${esc(ficha.nome_prato)}</b>
              </td>

              <td>
                ${esc(ficha.categoria || "—")}
              </td>

              <td>
                ${numero(ficha.rendimento_kg)}
              </td>

              <td>
                ${numero(ficha.porcoes, 0)}
              </td>

              <td>
                ${moeda(ficha.custo_total)}
              </td>

              <td>
                <b>
                  ${moeda(ficha.custo_por_porcao)}
                </b>
              </td>

              <td>
                ${moeda(ficha.preco_venda)}
              </td>

              <td>
                <b>
                  ${numero(
                    ficha.cmv_percentual,
                    1
                  )}%
                </b>
              </td>

              <td>
                <button
                  class="ghost small"
                  onclick="editarFicha(${ficha.id})"
                >
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

/* =========================================================
   NOVA FICHA
========================================================= */

window.novaFicha = function() {
  EDITANDO_FICHA = null;
  ITENS_FICHA = [];

  formularioFicha();
};

/* =========================================================
   EDITAR FICHA
========================================================= */

window.editarFicha = async function(id) {
  try {
    const ficha =
      await api(`/api/fichas/${id}`);

    EDITANDO_FICHA = ficha;

    ITENS_FICHA =
      (ficha.ingredientes || []).map(item => ({
        insumo_id:
          Number(item.insumo_id),

        peso_liquido:
          num(item.peso_liquido),

        observacoes:
          item.observacoes || ""
      }));

    formularioFicha(ficha);

  } catch (error) {
    erro(error);
  }
};

/* =========================================================
   FORMULÁRIO DA FICHA
========================================================= */

function formularioFicha(ficha = null) {
  const editando = Boolean(ficha);

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>FICHA TÉCNICA</small>

        <h2>
          ${editando
            ? esc(ficha.nome_prato)
            : "Nova Ficha Técnica"}
        </h2>

        <p>
          Ficha Técnica de Produção
        </p>
      </div>

      <button
        class="ghost"
        id="voltarFichas"
      >
        ← Voltar
      </button>
    </div>

    <form id="formFicha">

      <div class="card form-grid">

        <label class="span-2">
          Nome do Prato / Preparação
          <input
            id="nomePrato"
            required
            value="${esc(
              ficha?.nome_prato || ""
            )}"
            placeholder="Nome da preparação"
          >
        </label>

        <label>
          Categoria
          <select id="categoria">
            ${[
              "Entrada",
              "Prato Principal",
              "Acompanhamento",
              "Molho",
              "Sobremesa",
              "Bebida",
              "Outros"
            ].map(categoria => `
              <option
                value="${categoria}"
                ${
                  String(
                    ficha?.categoria ||
                    "Outros"
                  ) === categoria
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
            step="0.001"
            min="0"
            value="${
              ficha?.rendimento_kg ?? 0
            }"
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
          <input
            id="pesoPorcao"
            disabled
          >
        </label>

        <label>
          Preço de Venda / Porção
          <input
            id="precoVenda"
            type="number"
            step="0.01"
            min="0"
            value="${
              ficha?.preco_venda ?? 0
            }"
          >
        </label>

      </div>

      <div class="card">

        <div class="section-head compact">
          <div>
            <small>INGREDIENTES</small>
            <h3>Composição da Receita</h3>
          </div>

          <button
            type="button"
            class="primary"
            id="adicionarItem"
          >
            + Ingrediente
          </button>
        </div>

        <div
          id="ingredientesFicha"
        ></div>

      </div>

      <div class="card">

        <h3>Resumo da Receita</h3>

        <div class="summary-grid">

          <div>
            <span>Custo Total</span>
            <strong id="resumoTotal">
              R$ 0,00
            </strong>
          </div>

          <div>
            <span>Custo por Porção</span>
            <strong id="resumoPorcao">
              R$ 0,00
            </strong>
          </div>

          <div>
            <span>Preço de Venda</span>
            <strong id="resumoVenda">
              R$ 0,00
            </strong>
          </div>

          <div>
            <span>CMV</span>
            <strong id="resumoCMV">
              0,0%
            </strong>
          </div>

          <div>
            <span>Meta de CMV</span>
            <strong>
              30%
            </strong>
          </div>

          <div>
            <span>
              Preço para CMV de 30%
            </span>
            <strong id="resumoMeta">
              R$ 0,00
            </strong>
          </div>

        </div>
      </div>

      <div class="card form-grid">

        <label class="span-2">
          Modo de Preparo
          <textarea
            id="modoPreparo"
            rows="6"
            placeholder="Descreva o modo de preparo..."
          >${esc(
            ficha?.modo_preparo || ""
          )}</textarea>
        </label>

        <label class="span-2">
          Observações
          <textarea
            id="observacoesFicha"
            rows="3"
          >${esc(
            ficha?.observacoes || ""
          )}</textarea>
        </label>

        <div class="actions span-2">

          <button
            type="button"
            class="ghost"
            id="cancelarFicha"
          >
            Cancelar
          </button>

          ${
            editando
              ? `
                <button
                  type="button"
                  class="danger"
                  id="excluirFicha"
                >
                  Excluir ficha
                </button>
              `
              : ""
          }

          <button
            type="submit"
            class="primary"
          >
            ${
              editando
                ? "Salvar alterações"
                : "Salvar ficha técnica"
            }
          </button>

        </div>
      </div>

    </form>
  `;

  $("#voltarFichas").onclick =
    telaFichas;

  $("#cancelarFicha").onclick =
    telaFichas;

  $("#adicionarItem").onclick =
    () => {
      ITENS_FICHA.push({
        insumo_id: null,
        peso_liquido: 0,
        observacoes: ""
      });

      renderItensFicha();
    };

  $("#rendimento").oninput =
    calcularFicha;

  $("#porcoes").oninput =
    calcularFicha;

  $("#precoVenda").oninput =
    calcularFicha;

  if (editando) {
    $("#excluirFicha").onclick =
      excluirFicha;
  }

  $("#formFicha").onsubmit =
    salvarFicha;

  if (!ITENS_FICHA.length) {
    ITENS_FICHA.push({
      insumo_id: null,
      peso_liquido: 0,
      observacoes: ""
    });
  }

  renderItensFicha();
}

/* =========================================================
   DADOS DO INSUMO
========================================================= */

function obterInsumo(id) {
  return INSUMOS.find(
    item =>
      Number(item.id) === Number(id)
  );
}

/* =========================================================
   TABELA DE INGREDIENTES

   P. BRUTO = P. LÍQUIDO × FC
   CUSTO = P. LÍQUIDO × PREÇO REAL
========================================================= */

function renderItensFicha() {
  const area =
    $("#ingredientesFicha");

  if (!area) return;

  area.innerHTML = `
    <div class="table-wrap">
      <table class="ingredients-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Ingrediente</th>
            <th>P. Líq.</th>
            <th>Unid.</th>
            <th>FC</th>
            <th>P. Bruto</th>
            <th>Preço Compra</th>
            <th>Preço Real</th>
            <th>Custo Insumo</th>
            <th>Observação</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${ITENS_FICHA.map(
            (item, index) => {

              const insumo =
                obterInsumo(
                  item.insumo_id
                );

              const pesoLiquido =
                num(item.peso_liquido);

              const fc =
                num(insumo?.fc);

              const pesoBruto =
                pesoLiquido * fc;

              const precoCompra =
                num(
                  insumo?.preco_compra
                );

              const precoReal =
                num(
                  insumo?.preco_real
                );

              const custo =
                pesoLiquido *
                precoReal;

              return `
                <tr>

                  <td>
                    <select
                      class="item-codigo"
                      data-index="${index}"
                    >
                      <option value="">
                        —
                      </option>

                      ${INSUMOS
                        .filter(
                          i =>
                            i.ativo !== false
                        )
                        .map(i => `
                          <option
                            value="${i.id}"
                            ${
                              Number(
                                item.insumo_id
                              ) ===
                              Number(i.id)
                                ? "selected"
                                : ""
                            }
                          >
                            ${esc(i.codigo)}
                          </option>
                        `)
                        .join("")}
                    </select>
                  </td>

                  <td>
                    <select
                      class="item-insumo"
                      data-index="${index}"
                    >
                      <option value="">
                        Selecione...
                      </option>

                      ${INSUMOS
                        .filter(
                          i =>
                            i.ativo !== false
                        )
                        .map(i => `
                          <option
                            value="${i.id}"
                            ${
                              Number(
                                item.insumo_id
                              ) ===
                              Number(i.id)
                                ? "selected"
                                : ""
                            }
                          >
                            ${esc(
                              i.ingrediente
                            )}
                          </option>
                        `)
                        .join("")}
                    </select>
                  </td>

                  <td>
                    <input
                      class="item-peso"
                      data-index="${index}"
                      type="number"
                      min="0"
                      step="0.0001"
                      value="${
                        item.peso_liquido ?? 0
                      }"
                    >
                  </td>

                  <td>
                    ${esc(
                      insumo?.unidade ||
                      "—"
                    )}
                  </td>

                  <td>
                    ${insumo
                      ? numero(fc, 4)
                      : "—"}
                  </td>

                  <td>
                    ${insumo
                      ? numero(
                          pesoBruto,
                          4
                        )
                      : "—"}
                  </td>

                  <td>
                    ${insumo
                      ? moeda(
                          precoCompra
                        )
                      : "—"}
                  </td>

                  <td>
                    ${insumo
                      ? moeda(
                          precoReal
                        )
                      : "—"}
                  </td>

                  <td>
                    <b>
                      ${insumo
                        ? moeda(custo)
                        : "—"}
                    </b>
                  </td>

                  <td>
                    <input
                      class="item-obs"
                      data-index="${index}"
                      value="${esc(
                        item.observacoes ||
                        ""
                      )}"
                      placeholder="Observação"
                    >
                  </td>

                  <td>
                    <button
                      type="button"
                      class="danger small item-remove"
                      data-index="${index}"
                    >
                      ×
                    </button>
                  </td>

                </tr>
              `;
            }
          ).join("")}

        </tbody>
      </table>
    </div>
  `;

  document
    .querySelectorAll(
      ".item-codigo, .item-insumo"
    )
    .forEach(select => {
      select.onchange = event => {
        const index =
          Number(
            event.target.dataset.index
          );

        ITENS_FICHA[index].insumo_id =
          event.target.value
            ? Number(
                event.target.value
              )
            : null;

        renderItensFicha();
      };
    });

  document
    .querySelectorAll(".item-peso")
    .forEach(input => {
      input.oninput = event => {
        const index =
          Number(
            event.target.dataset.index
          );

        ITENS_FICHA[index]
          .peso_liquido =
            num(event.target.value);

        calcularFicha();
        atualizarLinhaFicha(index);
      };
    });

  document
    .querySelectorAll(".item-obs")
    .forEach(input => {
      input.oninput = event => {
        const index =
          Number(
            event.target.dataset.index
          );

        ITENS_FICHA[index]
          .observacoes =
            event.target.value;
      };
    });

  document
    .querySelectorAll(".item-remove")
    .forEach(button => {
      button.onclick = event => {
        const index =
          Number(
            event.currentTarget.dataset.index
          );

        ITENS_FICHA.splice(
          index,
          1
        );

        if (!ITENS_FICHA.length) {
          ITENS_FICHA.push({
            insumo_id: null,
            peso_liquido: 0,
            observacoes: ""
          });
        }

        renderItensFicha();
      };
    });

  calcularFicha();
}

/* =========================================================
   ATUALIZAÇÃO DA LINHA

   Mantemos o valor digitado sem reconstruir toda
   a tabela a cada tecla.
========================================================= */

function atualizarLinhaFicha(index) {
  const item =
    ITENS_FICHA[index];

  const insumo =
    obterInsumo(
      item?.insumo_id
    );

  if (!insumo) return;

  const peso =
    num(item.peso_liquido);

  const fc =
    num(insumo.fc);

  const bruto =
    peso * fc;

  const custo =
    peso *
    num(insumo.preco_real);

  const linha =
    document
      .querySelector(
        `.item-peso[data-index="${index}"]`
      )
      ?.closest("tr");

  if (!linha) return;

  const cells =
    linha.querySelectorAll("td");

  if (cells[5]) {
    cells[5].textContent =
      numero(bruto, 4);
  }

  if (cells[8]) {
    cells[8].innerHTML =
      `<b>${moeda(custo)}</b>`;
  }
}

/* =========================================================
   CÁLCULOS DA FICHA
========================================================= */

function calcularFicha() {
  let custoTotal = 0;
  let rendimento = 0;

  ITENS_FICHA.forEach(item => {
    const insumo =
      obterInsumo(item.insumo_id);

    const pesoLiquido =
      num(item.peso_liquido);

    rendimento += pesoLiquido;

    if (!insumo) return;

    custoTotal +=
      pesoLiquido *
      num(insumo.preco_real);
  });

  const porcoes =
    num($("#porcoes")?.value);

  const pesoPorcao =
    porcoes > 0
      ? rendimento / porcoes
      : 0;

  const custoPorcao =
    porcoes > 0
      ? custoTotal / porcoes
      : 0;

  const precoVenda =
    custoPorcao > 0
      ? custoPorcao / 0.30
      : 0;

  const cmv =
    precoVenda > 0
      ? (custoPorcao / precoVenda) * 100
      : 0;

  const rendimentoEl =
    $("#rendimento");

  const pesoEl =
    $("#pesoPorcao");

  const precoVendaEl =
    $("#precoVenda");

  const totalEl =
    $("#resumoTotal");

  const porcaoEl =
    $("#resumoPorcao");

  const vendaEl =
    $("#resumoVenda");

  const cmvEl =
    $("#resumoCMV");

  const metaEl =
    $("#resumoMeta");

  if (rendimentoEl) {
    rendimentoEl.value =
      rendimento.toFixed(4);
  }

  if (pesoEl) {
    pesoEl.value =
      pesoPorcao.toFixed(4);
  }

  if (precoVendaEl) {
    precoVendaEl.value =
      precoVenda.toFixed(2);
  }

  if (totalEl) {
    totalEl.textContent =
      moeda(custoTotal);
  }

  if (porcaoEl) {
    porcaoEl.textContent =
      moeda(custoPorcao);
  }

  if (vendaEl) {
    vendaEl.textContent =
      moeda(precoVenda);
  }

  if (cmvEl) {
    cmvEl.textContent =
      `${numero(cmv, 1)}%`;
  }

  if (metaEl) {
    metaEl.textContent =
      moeda(precoVenda);
  }
  let custoTotal = 0;

  ITENS_FICHA.forEach(item => {
    const insumo =
      obterInsumo(
        item.insumo_id
      );

    if (!insumo) return;

    custoTotal +=
      num(item.peso_liquido) *
      num(insumo.preco_real);
  });

  const rendimento =
    num(
      $("#rendimento")?.value
    );

  const porcoes =
    num(
      $("#porcoes")?.value
    );

  const precoVenda =
    num(
      $("#precoVenda")?.value
    );

  const pesoPorcao =
    porcoes > 0
      ? rendimento / porcoes
      : 0;

  const custoPorcao =
    porcoes > 0
      ? custoTotal / porcoes
      : 0;

  const cmv =
    precoVenda > 0
      ? (
          custoPorcao /
          precoVenda
        ) * 100
      : 0;

  const precoMeta =
    custoPorcao > 0
      ? custoPorcao / 0.30
      : 0;

  const peso =
    $("#pesoPorcao");

  if (peso) {
    peso.value =
      numero(
        pesoPorcao,
        4
      );
  }

/* =========================================================
   SALVAR FICHA
========================================================= */

async function salvarFicha(event) {
  event.preventDefault();

  const itensValidos =
    ITENS_FICHA.filter(
      item =>
        item.insumo_id &&
        num(item.peso_liquido) > 0
    );

  if (!itensValidos.length) {
    alert(
      "Adicione pelo menos um ingrediente à ficha técnica."
    );

    return;
  }

  const payload = {
    nome_prato:
      $("#nomePrato").value.trim(),

    categoria:
      $("#categoria").value,

    rendimento_kg:
      num($("#rendimento").value),

    porcoes:
      num($("#porcoes").value),

    preco_venda:
      num($("#precoVenda").value),

    modo_preparo:
      $("#modoPreparo").value.trim(),

    observacoes:
      $("#observacoesFicha").value.trim(),

    status: "Ativa",

    ativo: true,

    ingredientes:
      itensValidos.map(item => ({
        insumo_id:
          item.insumo_id,

        peso_liquido:
          num(item.peso_liquido),

        observacoes:
          item.observacoes || ""
      }))
  };

  try {
    if (EDITANDO_FICHA) {
      await api(
        `/api/fichas/${EDITANDO_FICHA.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );
    } else {
      await api(
        "/api/fichas",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
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

  const confirmar =
    confirm(
      `Excluir a ficha "${EDITANDO_FICHA.nome_prato}"?`
    );

  if (!confirmar) return;

  try {
    await api(
      `/api/fichas/${EDITANDO_FICHA.id}`,
      {
        method: "DELETE"
      }
    );

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
  const validas =
    FICHAS.filter(
      ficha =>
        num(ficha.custo_por_porcao) > 0
    );

  const cmvMedio =
    validas.length
      ? validas.reduce(
          (soma, ficha) =>
            soma +
            num(ficha.cmv_percentual),
          0
        ) / validas.length
      : 0;

  C.innerHTML = `
    <div class="section-head">
      <div>
        <small>GESTÃO DE CUSTOS</small>
        <h2>CMV</h2>
        <p>
          Acompanhamento dos custos
          das fichas técnicas.
        </p>
      </div>
    </div>

    <div class="summary-grid">

      <div class="card">
        <span>Fichas Técnicas</span>
        <strong>
          ${FICHAS.length}
        </strong>
      </div>

      <div class="card">
        <span>CMV Médio</span>
        <strong>
          ${numero(cmvMedio, 1)}%
        </strong>
      </div>

      <div class="card">
        <span>Meta</span>
        <strong>
          30%
        </strong>
      </div>

    </div>

    <div class="card">
      ${
        !FICHAS.length
          ? `
            <div class="empty">
              Nenhuma ficha cadastrada.
            </div>
          `
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Preparação</th>
                    <th>Custo Total</th>
                    <th>Custo/Porção</th>
                    <th>Venda</th>
                    <th>CMV</th>
                    <th>Venda p/ 30%</th>
                  </tr>
                </thead>

                <tbody>

                  ${FICHAS.map(
                    ficha => {

                      const custo =
                        num(
                          ficha.custo_por_porcao
                        );

                      const meta =
                        custo > 0
                          ? custo / 0.30
                          : 0;

                      return `
                        <tr>

                          <td>
                            <b>
                              ${esc(
                                ficha.nome_prato
                              )}
                            </b>
                          </td>

                          <td>
                            ${moeda(
                              ficha.custo_total
                            )}
                          </td>

                          <td>
                            ${moeda(custo)}
                          </td>

                          <td>
                            ${moeda(
                              ficha.preco_venda
                            )}
                          </td>

                          <td>
                            <b>
                              ${numero(
                                ficha.cmv_percentual,
                                1
                              )}%
                            </b>
                          </td>

                          <td>
                            ${moeda(meta)}
                          </td>

                        </tr>
                      `;
                    }
                  ).join("")}

                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function iniciar() {
  C.innerHTML = `
    <div class="card">
      Carregando...
    </div>
  `;

  await carregarDados();

  telaInsumos();
}

iniciar();
