(() => {
const MODULOS = [
 ["painel","Painel"],["insumos","Insumos"],["fichas","Fichas Técnicas"],["preparacoes","Preparações / Sub-receitas"],
 ["estoque","Estoque da Cozinha"],["producao","Produção"],["etiquetas","Etiquetas"],["perdas","Perdas"],
 ["custos","Custos / CMV"],["configuracoes","Configurações"]
];
const ACOES=[["visualizar","Visualizar"],["criar","Criar"],["editar","Editar"],["excluir","Excluir"],["executar","Executar"]];
const PERFIS={admin:"Administrador",chef:"Chef / Chef Executivo",subchef:"Subchef / Líder",cozinha:"Cozinha",estoque:"Estoque",consulta:"Consulta"};
const PRESETS={
 admin:{"*":ACOES.map(a=>a[0])},
 chef:{painel:["visualizar"],insumos:["visualizar","criar","editar"],fichas:["visualizar","criar","editar","excluir"],preparacoes:["visualizar","criar","editar","excluir"],estoque:["visualizar","criar","editar","executar"],producao:["visualizar","criar","editar","executar"],etiquetas:["visualizar","criar","executar"],perdas:["visualizar","criar","editar"],custos:["visualizar"],configuracoes:["visualizar"]},
 subchef:{painel:["visualizar"],insumos:["visualizar"],fichas:["visualizar"],preparacoes:["visualizar","criar","editar"],estoque:["visualizar"],producao:["visualizar","criar","editar","executar"],etiquetas:["visualizar","criar","executar"],perdas:["visualizar","criar"]},
 cozinha:{painel:["visualizar"],insumos:["visualizar"],fichas:["visualizar"],preparacoes:["visualizar"],producao:["visualizar","executar"],etiquetas:["visualizar","executar"],perdas:["criar"]},
 estoque:{painel:["visualizar"],insumos:["visualizar"],estoque:["visualizar","criar","editar","executar"],etiquetas:["visualizar","executar"],perdas:["visualizar","criar"]},
 consulta:{painel:["visualizar"],fichas:["visualizar"],preparacoes:["visualizar"]}
};
const esc2=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function permsFor(u){return (u?.permissoes&&Object.keys(u.permissoes).length)?u.permissoes:(PRESETS[u?.perfil]||{});}
function has(p,m,a){return p["*"]?.includes(a)||p[m]?.includes(a);}
function collect(){
 const out={};
 document.querySelectorAll("[data-perm]").forEach(x=>{
   const [m,a]=x.dataset.perm.split(":");
   if(x.checked){(out[m]??=[]).push(a);}
 });
 return out;
}
function applyPreset(perfil){
 const p=PRESETS[perfil]||{};
 document.querySelectorAll("[data-perm]").forEach(x=>{
   const [m,a]=x.dataset.perm.split(":"); x.checked=has(p,m,a);
 });
}
window.telaUsuarios=async function(){
 if(window.USUARIO_ATUAL?.perfil!=="admin"){C.innerHTML=`<div class="card"><h3>Acesso restrito</h3><p>Somente o administrador pode gerenciar usuários e permissões.</p></div>`;return;}
 C.innerHTML=`<div class="card">Carregando usuários...</div>`;
 try{
  const usuarios=await api("/api/auth/usuarios"); window.__USUARIOS=usuarios;
  C.innerHTML=`<div class="section-head"><div><small>EQUIPE DA COZINHA</small><h2>Usuários e Permissões</h2><p>Defina a função e os acessos de cada pessoa.</p></div><button class="primary" id="novoUsuario">+ Novo usuário</button></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Status</th><th></th></tr></thead><tbody>
  ${usuarios.map(u=>`<tr><td><b>${esc2(u.nome)}</b></td><td>${esc2(u.email)}</td><td>${esc2(PERFIS[u.perfil]||u.perfil)}</td><td>${u.ativo?"Ativo":"Inativo"}</td><td><button onclick="editarUsuarioPerm(${Number(u.id)})">Editar</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
  document.querySelector("#novoUsuario").onclick=()=>formUsuarioPerm();
 }catch(e){erro(e);}
};
window.editarUsuarioPerm=id=>{const u=(window.__USUARIOS||[]).find(x=>Number(x.id)===Number(id));if(u)formUsuarioPerm(u);};
function formUsuarioPerm(u=null){
 const edit=!!u,p=permsFor(u),perfil=u?.perfil||"cozinha";
 C.innerHTML=`<div class="section-head"><div><small>EQUIPE</small><h2>${edit?"Editar Usuário":"Novo Usuário"}</h2><p>Função define um acesso inicial; abaixo você pode personalizar cada permissão.</p></div><button class="secondary" id="voltarUsuarios">← Voltar</button></div>
 <form id="formUsuario" class="card"><div class="form-grid">
 <label>Nome<input id="usuarioNome" required value="${esc2(u?.nome||"")}"></label>
 <label>E-mail<input id="usuarioEmail" type="email" required value="${esc2(u?.email||"")}"></label>
 <label>Função<select id="usuarioPerfil">${Object.entries(PERFIS).map(([v,l])=>`<option value="${v}" ${perfil===v?"selected":""}>${l}</option>`).join("")}</select></label>
 <label>${edit?"Nova senha (opcional)":"Senha"}<input id="usuarioSenha" type="password" minlength="8" ${edit?"":"required"} autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></label>
 ${edit?`<label>Status<select id="usuarioAtivo"><option value="true" ${u.ativo?"selected":""}>Ativo</option><option value="false" ${!u.ativo?"selected":""}>Inativo</option></select></label>`:""}
 </div>
 <div class="card" style="margin-top:16px"><div class="section-head"><div><small>ACESSOS</small><h3>Permissões individuais</h3><p>Marque exatamente o que este usuário poderá fazer.</p></div><button type="button" class="secondary" id="aplicarPerfil">Aplicar padrão da função</button></div>
 <div class="table-wrap"><table><thead><tr><th>Módulo</th>${ACOES.map(a=>`<th>${a[1]}</th>`).join("")}</tr></thead><tbody>
 ${MODULOS.map(([m,l])=>`<tr><td><b>${l}</b></td>${ACOES.map(([a])=>`<td><input type="checkbox" data-perm="${m}:${a}" ${has(p,m,a)?"checked":""}></td>`).join("")}</tr>`).join("")}
 </tbody></table></div></div>
 <div class="actions"><button type="button" class="secondary" id="cancelarUsuario">Cancelar</button><button type="submit" class="primary">${edit?"Salvar alterações":"Criar usuário"}</button></div></form>`;
 document.querySelector("#voltarUsuarios").onclick=telaUsuarios;
 document.querySelector("#cancelarUsuario").onclick=telaUsuarios;
 document.querySelector("#aplicarPerfil").onclick=()=>applyPreset(document.querySelector("#usuarioPerfil").value);
 document.querySelector("#usuarioPerfil").onchange=()=>applyPreset(document.querySelector("#usuarioPerfil").value);
 document.querySelector("#formUsuario").onsubmit=async ev=>{
  ev.preventDefault();const senha=document.querySelector("#usuarioSenha").value;
  const payload={nome:document.querySelector("#usuarioNome").value.trim(),email:document.querySelector("#usuarioEmail").value.trim(),perfil:document.querySelector("#usuarioPerfil").value,permissoes:collect()};
  if(senha)payload.senha=senha;if(edit)payload.ativo=document.querySelector("#usuarioAtivo").value==="true";
  try{await api(edit?`/api/auth/usuarios/${u.id}`:"/api/auth/usuarios",{method:edit?"PUT":"POST",body:JSON.stringify(payload)});await telaUsuarios();}catch(e){erro(e);}
 };
}
function ajustarMenu(user){
 const p=permsFor(user);
 const map={painel:"painel",insumos:"insumos",fichas:"fichas",preparacoes:"preparacoes",categorias:"fichas",cmv:"custos",usuarios:"usuarios"};
 document.querySelectorAll(".main-nav [data-tab]").forEach(b=>{
  const m=map[b.dataset.tab]; if(!m)return;
  const ok=user.perfil==="admin"||m==="usuarios"&&user.perfil==="admin"||has(p,m,"visualizar");
  if(!ok)b.hidden=true;
 });
}
window.addEventListener("usuario:autenticado",e=>ajustarMenu(e.detail));
if(window.USUARIO_ATUAL)ajustarMenu(window.USUARIO_ATUAL);
})();