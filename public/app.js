let insumos = [], fichas = [], tab = "insumos";
const c = document.querySelector("#content");

const money = n =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const num = n => Number(n || 0);
const pct = n => num(n).toFixed(1) + "%";

async function api(url, opt = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opt
  });

  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || "Falha na operação");
  }

  return r.status === 204 ? null : r.json();
}

async function load() {
  try {
    [insumos, fichas] = await Promise.all([
      api("/api/insumos"),
      api("/api/fichas")
    ]);

    render();
  } catch (e) {
    c.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

function stats() {
  document.querySelector("#ni").textContent = insumos.length;
  document.querySelector("#nf").textContent = fichas.length;

  const valores = fichas
    .filter(f => num(f.preco_venda) > 0)
    .map(f => num(f.cmv_percentual));

  const media = valores.length
    ? valores.reduce((a, b) => a + b, 0) / valores.length
    : 0;

  document.querySelector("#avg").textContent = pct(media);
}

function cmvClass(v) {
  v = num(v);
  return v <= 30 ? "good" : v <= 35 ? "warn" : "bad";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function render() {
  stats();

  document.querySelectorAll("nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (tab === "insumos") {
    c.innerHTML = `
      <div class="row">
        <h2>Banco de Insumos</h2>
        <button class="primary" onclick="novoInsumo()">+ Insumo</button>
      </div>
    ` + (
      insumos.map(i => `
        <div class="card row mobile">
          <div>
            <b>${esc(i.ingrediente)}</b>
            <div class="muted">
              ${esc(i.unidade)} ·
              FC ${num(i.fc).toFixed(3)} ·
              compra ${money(i.preco_compra)}
            </div>
            <small>${esc(i.fornecedor || "")}</small>
          </div>

          <div class="actions">
            <span class="price">${money(i.preco_real)}</span>
            <button class="secondary
