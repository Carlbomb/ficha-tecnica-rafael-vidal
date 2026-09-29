import fs from "node:fs";
import assert from "node:assert/strict";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const backend=["server.js","auth.js","multitenancy.js","preparacoes.js","categorias.js","estoque.js","producao.js","operacao.js","operacao-completa.js","tenant-admin.js","importacao.js"];
const frontend=["public/app.js","public/escalonamento.js","public/permissions.js","public/menu.js","public/subreceitas.js","public/categorias.js","public/unidades.js","public/estoque.js","public/producao.js","public/grupos-insumos.js","public/operacao.js","public/extras.js","public/importacao.js","public/router.js","public/ui-consolidado.js"];

const all=[...backend,...frontend].map(p=>[p,read(p)]);
for(const [p,s] of all){
  assert.ok(!s.includes("/api/fichas"),p+" ainda referencia /api/fichas");
  assert.ok(!s.includes("/api/producao/planejar-fichas"),p+" ainda referencia rota antiga de planejamento");
  assert.ok(!s.includes("/api/producao/ordens/:id/finalizar"),p+" ainda registra finalizacao aposentada");
  assert.ok(!s.includes("/api/producao/ordens/:id/entrada-preparacao"),p+" ainda registra entrada aposentada");
}
for(const p of backend){
  const s=read(p);
  assert.ok(!/(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX)/i.test(s),p+" possui DDL fora de migrations.js");
}
const index=read("public/index.html");
assert.match(index,/\/misevo\.css\?v=1/);
assert.match(index,/\/ui-consolidado\.js\?v=1/);
assert.ok(!/ui-v2[1-4]\.css|ui-v2[1-4]\.js|importacao-experimental/.test(index),"index carrega artefato antigo");
const observers=frontend.reduce((n,[p,s])=>n,0);
const observerFiles=frontend.filter(p=>read(p).includes("MutationObserver"));
assert.deepEqual(observerFiles,["public/ui-consolidado.js"],"MutationObserver deve existir somente na camada visual consolidada");
assert.match(read("producao.js"),/\/api\/producao\/planejar-preparacoes/);
assert.match(read("public/producao.js"),/\/api\/producao\/planejar-preparacoes/);
console.log("OK: arquitetura MISEVO consolidada.");
