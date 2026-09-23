/* MISEVO V21 — camada visual global */
(()=>{
 const $=s=>document.querySelector(s);
 const tabs={painel:"painel",insumos:"insumos",fichas:"fichas",preparacoes:"preparacoes",categorias:"categorias"};
 function sync(tab){
  document.querySelectorAll(".mobile-bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.v21Tab===tab));
 }
 document.addEventListener("click",e=>{
  const b=e.target.closest("[data-v21-tab]");
  if(b){
   const tab=b.dataset.v21Tab;
   const target=document.querySelector(`.main-nav [data-tab="${tab}"]`);
   if(target){target.click();sync(tab)}
  }
  const t=e.target.closest(".main-nav [data-tab]");
  if(t&&tabs[t.dataset.tab])sync(t.dataset.tab);
 });
 function boot(){
  const active=document.querySelector(".main-nav [data-tab].active");
  sync(active?.dataset.tab||"insumos");
  document.querySelectorAll('button').forEach(b=>{
   if(b.textContent.trim()==="Editar") b.setAttribute("aria-label","Editar");
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
