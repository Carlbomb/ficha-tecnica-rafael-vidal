(() => {
const q=s=>document.querySelector(s), C=q("#content");
function fechar(){document.body.classList.remove("menu-open");q("#menuToggle")?.setAttribute("aria-expanded","false")}
q("#menuToggle")?.addEventListener("click",()=>{const abrir=!document.body.classList.contains("menu-open");document.body.classList.toggle("menu-open",abrir);q("#menuToggle")?.setAttribute("aria-expanded",String(abrir))});
q("#menuBackdrop")?.addEventListener("click",fechar);
document.addEventListener("click",e=>{
 const g=e.target.closest(".nav-group-toggle"); if(g){g.closest(".nav-group")?.classList.toggle("open");return}
 const x=e.target.closest("[data-coming]"); if(x){document.querySelectorAll(".main-nav [data-tab],.main-nav [data-coming]").forEach(b=>b.classList.remove("active"));x.classList.add("active");const n=x.dataset.coming;C.innerHTML=`<div class="card coming-card"><small>MISEVO 1.0</small><h2>${n}</h2><p>Módulo preparado para a próxima etapa de desenvolvimento.</p></div>`;fechar();return}
 const t=e.target.closest(".main-nav [data-tab]"); if(t){
   t.closest(".nav-group")?.classList.add("open");
   document.querySelectorAll(".main-nav [data-tab],.main-nav [data-coming]").forEach(b=>b.classList.remove("active"));
   t.classList.add("active");
   fechar();
 }
});
window.addEventListener("resize",()=>{if(innerWidth>700)fechar()});
})();