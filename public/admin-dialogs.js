/* Confirmações em HTML: permitem digitação também no WebView Android. */
window.MISEVO_CONFIRM = ({ title, message, word = "", confirmLabel = "Excluir" }) => new Promise(resolve => {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "width:min(440px,calc(100% - 32px));max-height:85dvh;overflow:auto;border:0;border-radius:16px;padding:24px;box-shadow:0 12px 60px #0006";
  dialog.setAttribute("aria-labelledby", "adminConfirmTitle");
  dialog.innerHTML = '<form><h2 id="adminConfirmTitle"></h2><p id="adminConfirmMessage"></p><label id="adminConfirmLabel">Para confirmar, digite <b></b><input id="adminConfirmInput" autocomplete="off" autocapitalize="characters" spellcheck="false" style="display:block;width:100%;box-sizing:border-box;margin:12px 0"></label><div class="actions"><button type="button" class="secondary" id="adminConfirmCancel">Cancelar</button><button type="submit" class="danger" id="adminConfirmSubmit"></button></div></form>';
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = message;
  dialog.querySelector("b").textContent = word;
  const input = dialog.querySelector("input"), submit = dialog.querySelector('[type="submit"]');
  submit.textContent = confirmLabel;
  dialog.querySelector("label").hidden = !word;
  input.required = Boolean(word);
  submit.disabled = Boolean(word);
  input.oninput = () => { submit.disabled = Boolean(word) && input.value.trim() !== word; };
  const previous = document.activeElement;
  const finish = value => { dialog.remove(); previous?.focus(); resolve(value); };
  dialog.querySelector("form").onsubmit = e => { e.preventDefault(); if (!word || input.value.trim() === word) finish(true); };
  dialog.querySelector('[type="button"]').onclick = () => finish(false);
  dialog.addEventListener("cancel", e => { e.preventDefault(); finish(false); });
  document.body.appendChild(dialog);
  dialog.showModal();
  (word ? input : dialog.querySelector('[type="button"]')).focus();
});

window.MISEVO_ADMIN_NOTICE = (message, error = false) => {
  const content = document.querySelector("#content");
  content.querySelector(".admin-notice")?.remove();
  const notice = document.createElement("p");
  notice.className = "card admin-notice";
  notice.setAttribute("role", error ? "alert" : "status");
  notice.style.color = error ? "#a12323" : "#0f625c";
  notice.textContent = message;
  content.prepend(notice);
  notice.scrollIntoView({ block: "nearest" });
};
