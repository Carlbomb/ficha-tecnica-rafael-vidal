import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const prep={id:777,nome:"Cebola refogada teste",ativo:true,rendimento:1,unidade_rendimento:"KG",custo_unitario:6.67};
const area={innerHTML:""};
const content={innerHTML:""};
const document={
  querySelector(sel){ if(sel==="#content") return content; if(sel==="#ingredientesFicha") return area; return null; },
  querySelectorAll(){ return []; },
  addEventListener(){}
};
const windowObj={PREPARACOES_PUBLIC:[]};
const context={
  console, window:windowObj, document,
  fetch:async url=>({ok:true,status:200,json:async()=>url==="/api/preparacoes"?[prep]:[]}),
  alert(){}, confirm(){return true}, location:{}, history:{},
  setTimeout, clearTimeout
};
windowObj.window=windowObj; windowObj.document=document;
vm.createContext(context);
vm.runInContext(source,context,{filename:"public/app.js"});
await new Promise(r=>setTimeout(r,0));

vm.runInContext('ITENS_FICHA=[{tipo:"insumo",id:"",peso_liquido:0,unidade:"",observacoes:""}]',context);
await context.window.alterarTipoItem(0,"preparacao");
assert.match(area.innerHTML,/Cebola refogada teste/,"A preparação precisa aparecer no seletor da Ficha Técnica.");
assert.match(area.innerHTML,/value="777"/);
console.log("OK: preparação aparece no seletor da Ficha Técnica.");
