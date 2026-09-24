(() => {
  const content = () => document.getElementById("content");
  const get = async (url) => (await fetch(url)).json();

  window.telaFornecedores = async () => {
    const rows = await get("/api/fornecedores");
    content().innerHTML = "<div class='page-head'><div><small>COMPRAS</small><h2>Fornecedores</h2></div></div><div class='card'>" +
      (rows.length ? rows.map(x => "<p><b>"+x.nome+"</b> · "+(x.telefone||x.email||"Sem contato")+"</p>").join("") : "Nenhum fornecedor cadastrado.") + "</div>";
  };

  window.telaCompras = async () => {
    const rows = await get("/api/compras");
    content().innerHTML = "<div class='page-head'><div><small>SUPRIMENTOS</small><h2>Compras e notas</h2></div></div><div class='card'>" +
      (rows.length ? rows.map(x => "<p><b>"+(x.fornecedor||"Fornecedor")+"</b> · "+(x.numero_documento||"Sem documento")+" · R$ "+Number(x.total||0).toFixed(2)+" · "+x.status+"</p>").join("") : "Nenhuma compra registrada.") + "</div>";
  };

  window.telaInventario = async () => {
    const rows = await get("/api/insumos");
    content().innerHTML = "<div class='page-head'><div><small>ESTOQUE</small><h2>Inventário</h2></div></div><div class='card'><p>Contagem física integrada ao estoque.</p>" +
      rows.map(x => "<p>"+x.ingrediente+" · "+x.unidade+"</p>").join("") + "</div>";
  };

  window.telaPerdas = async () => {
    content().innerHTML = "<div class='page-head'><div><small>CONTROLE</small><h2>Perdas e desperdícios</h2></div></div><div class='card'><p>Registro de perdas integrado ao estoque e ao custo real.</p></div>";
  };

  window.telaDocumentos = async () => {
    const rows = await get("/api/documentos-operacionais");
    content().innerHTML = "<div class='page-head'><div><small>SEGURANÇA DOS ALIMENTOS</small><h2>Documentos e HACCP</h2></div></div><div class='card'>" +
      (rows.length ? rows.map(x => "<p><b>"+x.nome+"</b> · "+x.tipo+" · "+x.status_calculado+"</p>").join("") : "Nenhum documento cadastrado.") + "</div>";
  };

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-tab]");
    if (!el) return;
    const routes = { fornecedores:telaFornecedores, compras:telaCompras, inventario:telaInventario, perdas:telaPerdas, documentos:telaDocumentos };
    const fn = routes[el.dataset.tab];
    if (fn) { e.preventDefault(); fn(); }
  });
})();