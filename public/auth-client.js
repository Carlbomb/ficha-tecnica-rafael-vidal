(() => {
  const $ = (s) => document.querySelector(s);

  function showLogin(message = "") {
    document.body.classList.add("auth-locked");
    let overlay = $("#authOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "authOverlay"; overlay.className = "auth-overlay";
      overlay.innerHTML = `<div class="auth-card"><div class="auth-brand">
        <img src="/misevo-logo.svg" alt="MISEVO" class="auth-logo"><small>GESTÃO INTELIGENTE DE COZINHA</small>
        <h1>MISEVO</h1><p>Acesse sua operação com seu usuário.</p></div>
        <form id="loginForm"><label>E-mail<input id="loginEmail" type="email" autocomplete="username" required></label>
        <label>Senha<input id="loginSenha" type="password" autocomplete="current-password" required></label>
        <p id="loginErro" class="auth-error"></p><button class="auth-submit" type="submit">Entrar</button></form></div>`;
      document.body.appendChild(overlay);
      $("#loginForm").addEventListener("submit", async (event) => {
        event.preventDefault(); const erro = $("#loginErro"); erro.textContent = "";
        try {
          const response = await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email:$("#loginEmail").value.trim(),senha:$("#loginSenha").value})});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
          location.reload();
        } catch (e) { erro.textContent = e.message; }
      });
    }
    $("#loginErro").textContent = message;
  }

  function showChangePassword() {
    $("#passwordOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "passwordOverlay"; overlay.className = "auth-overlay";
    overlay.innerHTML = `<div class="auth-card"><div class="auth-brand">
      <img src="/misevo-logo.svg" alt="MISEVO" class="auth-logo"><small>MINHA CONTA</small>
      <h1>Alterar senha</h1><p>A nova senha deve ter pelo menos 8 caracteres.</p></div>
      <button class="auth-back" id="passwordBackButton" type="button" aria-label="Voltar">← Voltar</button>\n      <form id="changePasswordForm">
        <label>Senha atual<input id="senhaAtual" type="password" autocomplete="current-password" required></label>
        <label>Nova senha<input id="novaSenha" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirmar nova senha<input id="confirmarSenha" type="password" autocomplete="new-password" minlength="8" required></label>
        <p id="passwordErro" class="auth-error"></p>
        <button class="auth-submit" type="submit">Salvar nova senha</button>
        <button class="logout-button" id="cancelPasswordButton" type="button">Cancelar</button>
      </form></div>`;
    document.body.appendChild(overlay);
    const closePassword = () => overlay.remove();\n    $("#passwordBackButton").onclick = closePassword;\n    $("#cancelPasswordButton").onclick = closePassword;
    $("#changePasswordForm").onsubmit = async (event) => {
      event.preventDefault(); const erro = $("#passwordErro"); erro.textContent = "";
      const atual = $("#senhaAtual").value, nova = $("#novaSenha").value, confirmar = $("#confirmarSenha").value;
      if (nova.length < 8) return erro.textContent = "A nova senha deve ter pelo menos 8 caracteres.";
      if (nova !== confirmar) return erro.textContent = "A confirmação da nova senha não confere.";
      try {
        const response = await fetch("/api/auth/alterar-senha",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({senha_atual:atual,nova_senha:nova,confirmar_senha:confirmar})});
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível alterar a senha.");
        alert("Senha alterada com sucesso. Entre novamente com a nova senha."); location.reload();
      } catch (e) { erro.textContent = e.message; }
    };
  }

  function showUser(user) {
    document.body.classList.remove("auth-locked"); $("#authOverlay")?.remove();
    const footer = document.querySelector(".sidebar-footer");
    if (footer) {
      footer.innerHTML = `<span class="logged-user">${user.nome}</span><strong>${String(user.perfil).toUpperCase()}</strong>
        <button type="button" class="logout-button" id="changePasswordButton">Alterar senha</button>
        <button type="button" class="logout-button" id="logoutButton">Sair</button>`;
      $("#changePasswordButton").onclick = showChangePassword;
      $("#logoutButton").onclick = async () => { await fetch("/api/auth/logout",{method:"POST"}); location.reload(); };
    }
    const navUsuarios = $("#navUsuarios");
    if (navUsuarios) navUsuarios.hidden = String(user.perfil).toLowerCase() !== "admin";
    window.USUARIO_ATUAL = user;
    window.dispatchEvent(new CustomEvent("usuario:autenticado",{detail:user}));
  }

  async function boot() {
    try {
      const response = await fetch("/api/auth/me",{cache:"no-store"});
      if (!response.ok) return showLogin();
      const data = await response.json(); showUser(data.usuario);
    } catch { showLogin("Não foi possível verificar a sessão."); }
  }
  window.AUTH_READY = boot();
})();
