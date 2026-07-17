// Componentes de interface: modal genérico e confirmação
"use strict";

const UI = (() => {
  function closeModal() {
    document.querySelectorAll(".overlay").forEach(o => o.remove());
  }

  // fieldsHTML: conteúdo do formulário; onSubmit(form) -> true fecha o modal
  function modal(title, fieldsHTML, onSubmit, opts = {}) {
    closeModal();
    const ov = U.el(`
      <div class="overlay">
        <div class="modal">
          <h3>${U.esc(title)}</h3>
          <form>${fieldsHTML}
            <div class="actions">
              ${opts.extraBtn || ""}
              <button type="button" class="cancel">Cancelar</button>
              <button type="submit" class="btn-primary">${opts.okLabel || "Salvar"}</button>
            </div>
          </form>
        </div>
      </div>`);
    ov.addEventListener("click", e => { if (e.target === ov) closeModal(); });
    ov.querySelector(".cancel").addEventListener("click", closeModal);
    ov.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      if (onSubmit(e.target) !== false) closeModal();
    });
    document.body.appendChild(ov);
    const first = ov.querySelector("input, select, textarea");
    if (first) first.focus();
    return ov;
  }

  function confirmar(msg, onOk) {
    modal("Confirmação", `<p>${U.esc(msg)}</p>`, () => { onOk(); return true; }, { okLabel: "Confirmar" });
  }

  function selectCategorias(name, selecionado, apenas) {
    const cats = Store.state.categories;
    return `<select name="${name}">` + cats.map(c =>
      `<option value="${c.id}" ${c.id === selecionado ? "selected" : ""}>${U.esc(c.name)}</option>`).join("") + `</select>`;
  }

  function selectContas(name, selecionado) {
    const accs = Store.state.accounts;
    return `<select name="${name}"><option value="">(nenhuma)</option>` + accs.map(a =>
      `<option value="${a.id}" ${a.id === selecionado ? "selected" : ""}>${U.esc(a.name)}</option>`).join("") + `</select>`;
  }

  return { modal, closeModal, confirmar, selectCategorias, selectContas };
})();
