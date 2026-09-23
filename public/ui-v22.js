/* MISEVO V22 — comportamento visual inspirado na referência */
(()=>{
 const C=()=>document.querySelector("#content");
 const labels=()=>{
  document.querySelectorAll(".content-area table").forEach(t=>{
   const hs=[...t.querySelectorAll("thead th")].map(x=>x.textContent.trim());
   t.querySelectorAll("tbody tr").forEach(r=>[...r.children].forEach((td,i)=>td.dataset.v22Label=hs[i]||""));
  });
 };
 const syncBottom=tab=>document.querySelectorAll(".v22-bottom button").forEach(b=>b.classList.toggle("active",b.dataset.v21Tab===tab));
 const obs=new MutationObserver(()=>{labels();});
 function start(){if(C())obs.observe(C(),{childList:true,subtree:true});labels();const a=document.querySelector(".main-nav [data-tab].active");syncBottom(a?.dataset.tab||"insumos")}
 document.addEventListener("click",e=>{
   const b=e.target.closest(".v22-bottom [data-v21-tab]");
   if(b){document.querySelector(`.main-nav [data-tab="${b.dataset.v21Tab}"]`)?.click();syncBottom(b.dataset.v21Tab)}
   const t=e.target.closest(".main-nav [data-tab]");if(t)syncBottom(t.dataset.tab);
 });
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
