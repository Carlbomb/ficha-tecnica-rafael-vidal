(() => {
  const $ = (s) => document.querySelector(s);

  function showLogin(message = "") {
    document.body.classList.add("auth-locked");
    let overlay = $("#authOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "authOverlay";
      overlay.className = "auth-overlay";
      overlay.innerHTML = `
        <div class="auth-card">
          <div class="auth-brand">
            <small>GESTÃO INTELIGENTE DE COZINHA</small>
            <h1>MISEVO</h1>
            <p>Acesse sua operação com seu usuário.</p>
          </div>
          <form id="loginForm">
            <label>E-mail<input id="loginEmail" type="email" autocomplete="username" required></label>
            <label>Senha<input id="loginSenha" type="password" autocomplete="current-password" required></label>
            <p id="loginErro" class="auth-error"></p>
            <button class="auth-submit" type="submit">Entrar</button>
          </form>
        </div>`;
      document.body.appendChild(overlay);

      $("#loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const erro = $("#loginErro");
        erro.textContent = "";
        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: $("#loginEmail").value.trim(),
              senha: $("#loginSenha").value
            })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
          location.reload();
        } catch (e) {
          erro.textContent = e.message;
        }
      });
    }
    $("#loginErro").textContent = message;
  }

  function showUser(user) {
    document.body.classList.remove("auth-locked");
    $("#authOverlay")?.remove();

    const footer = document.querySelector(".sidebar-footer");
    if (footer) {
      footer.innerHTML = `
        <span class="logged-user">${user.nome}</span>
        <strong>${String(user.perfil).toUpperCase()}</strong>
        <button type="button" class="logout-button" id="logoutButton">Sair</button>`;
      $("#logoutButton").onclick = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        location.reload();
      };
    }

    const navUsuarios = $("#navUsuarios");
    if (navUsuarios) navUsuarios.hidden = String(user.perfil).toLowerCase() !== "admin";

    window.USUARIO_ATUAL = user;
    window.dispatchEvent(new CustomEvent("usuario:autenticado", { detail: user }));
  }

  async function boot() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) return showLogin();
      const data = await response.json();
      showUser(data.usuario);
    } catch {
      showLogin("Não foi possível verificar a sessão.");
    }
  }

  window.AUTH_READY = boot();
})();
