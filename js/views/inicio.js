// Tela inicial (lançador) + menu "Adicionar" que integra os dois controles
"use strict";

// Menu "Adicionar" — abre o formulário certo para cada tipo de lançamento.
// (Marcar Recebido/Pago saiu do menu — o usuário faz isso direto no Fluxo Anual.)
const Adicionar = (() => {
  function abrirMenu() {
    UI.closeModal();
    const ov = U.el(`
      <div class="overlay">
        <div class="modal add-menu">
          <h3>Adicionar</h3>
          <div class="add-opts">
            <button type="button" data-add="compra">🛒 Compra (no cartão)</button>
            <button type="button" data-add="parcelada">🧾 Compra parcelada</button>
            <button type="button" data-add="lancamento">💸 Lançamento (pix/débito/cartão)</button>
            <button type="button" data-add="abast">⛽ Abastecimento</button>
          </div>
          <div class="actions"><button type="button" class="cancel">Fechar</button></div>
        </div>
      </div>`);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    ov.querySelector(".cancel").addEventListener("click", () => ov.remove());
    const acoes = {
      compra: () => ViewCartoes.abrirNovaCompra(null),
      parcelada: () => ViewCartoes.abrirNovaCompra(null),
      lancamento: () => ViewLancamentos.abrirNovo(),
      abast: () => ViewCombustivel.abrirForm(null)
    };
    ov.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => {
      ov.remove();
      (acoes[b.dataset.add] || (() => {}))();
    }));
    document.body.appendChild(ov);
  }
  return { abrirMenu };
})();

// Tela inicial: botões grandes para entrar nos controles, adicionar e atualizar.
const ViewInicio = (() => {
  async function atualizar(btn) {
    const orig = btn.innerHTML;
    btn.disabled = true; btn.classList.add("carregando");
    const avisos = [];
    try {
      if (typeof Sync !== "undefined" && Sync.ativo && Sync.ativo()) {
        try { const acao = await Sync.sincronizar(); if (acao === "baixado") avisos.push("dados mais novos baixados do cofre"); }
        catch (err) { avisos.push("sincronização falhou: " + err.message); }
      }
      const tickers = Store.inv().assets.map(a => a.ticker);
      if (tickers.length && typeof Quotes !== "undefined") {
        try { const { ok, falhas } = await Quotes.fetchAll(tickers); if (Object.keys(ok).length) Store.saveQuotes(ok); if (falhas && falhas.length) avisos.push("sem cotação para: " + falhas.join(", ")); }
        catch (err) { avisos.push("cotações falharam: " + err.message); }
      }
    } finally {
      App.render();
      if (avisos.length) alert("Atualizado com avisos:\n• " + avisos.join("\n• "));
    }
  }

  function render(root) {
    const sync = (typeof Sync !== "undefined" && Sync.statusTexto) ? Sync.statusTexto() : "";
    root.innerHTML = `
      <div class="inicio">
        <div class="inicio-head">
          <h1>💼 Gestão Pessoal</h1>
          <p class="muted">O que você quer fazer?</p>
        </div>
        <div class="inicio-grid">
          <button class="inicio-btn" data-act="financeiro"><span class="ib-ic">💰</span><span>Controle<br>Financeiro</span></button>
          <button class="inicio-btn" data-act="combustivel"><span class="ib-ic">⛽</span><span>Controle<br>Combustível</span></button>
          <button class="inicio-btn destaque" data-act="adicionar"><span class="ib-ic">➕</span><span>Adicionar<br><small>compra · lançamento · abastecimento</small></span></button>
          <button class="inicio-btn" data-act="atualizar"><span class="ib-ic">🔄</span><span>Atualizar<br><small>${U.esc(sync || "sincronizar / cotações")}</small></span></button>
        </div>
      </div>`;
    root.querySelector('[data-act="financeiro"]').addEventListener("click", () => App.trocarControle("financeiro"));
    root.querySelector('[data-act="combustivel"]').addEventListener("click", () => App.trocarControle("combustivel"));
    root.querySelector('[data-act="adicionar"]').addEventListener("click", () => Adicionar.abrirMenu());
    root.querySelector('[data-act="atualizar"]').addEventListener("click", (e) => atualizar(e.currentTarget));
  }
  return { render };
})();
