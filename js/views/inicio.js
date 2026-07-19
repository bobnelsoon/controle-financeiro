// Tela inicial (lançador) + menu "Adicionar" que integra os dois controles
"use strict";

// Marcar um item FIXO do Fluxo Anual como Recebido (receita) ou Pago (despesa).
const Marcar = (() => {
  function abrir(kind) {
    const itens = Store.state.flowItems.filter(it => it.kind === kind && !it.autoCartao);
    const titulo = kind === "receita" ? "Marcar recebimento" : "Marcar pagamento";
    const statusLabel = kind === "receita" ? "RECEBIDO" : "PAGO";
    if (!itens.length) {
      UI.modal(titulo, `<p class="empty">Nenhum item ${kind === "receita" ? "de receita" : "de despesa"} fixo no Fluxo Anual.</p>`, () => true, { okLabel: "Fechar" });
      return;
    }
    const ymAtual = U.ymHoje();
    const opts = itens.map(it => `<option value="${it.id}">${U.esc(it.name)}</option>`).join("");
    const ov = UI.modal(titulo, `
      <label class="fld"><span>Item (${kind === "receita" ? "receita" : "despesa"} fixa do fluxo)</span><select name="item">${opts}</select></label>
      <label class="fld"><span>Mês</span><input type="month" name="mes" value="${ymAtual}"></label>
      <label class="fld"><span>Valor (R$)</span><input type="text" name="valor" inputmode="decimal" placeholder="valor previsto"></label>
      <p class="muted" style="font-size:12px">Marca o item como <b>${statusLabel}</b> no mês escolhido do Fluxo Anual e atualiza saldo, fluxo e dashboard automaticamente.</p>
    `, (form) => {
      const it = itens.find(x => x.id === form.item.value);
      if (!it) return false;
      const ym = form.mes.value || ymAtual;
      const base = Store.plannedValue(it, ym);
      let val = U.parseMoney(form.valor.value);
      if (val == null) val = base;
      if (val == null) return false;
      const sign = kind === "receita" ? 1 : -1;
      Store.setCell(it.id, ym, { value: sign * Math.abs(val), status: statusLabel });
      App.render();
    }, { okLabel: kind === "receita" ? "Marcar recebido" : "Marcar pago" });

    // Pré-preenche o valor com o previsto do item/mês e atualiza ao trocar item ou mês.
    const itemSel = ov.querySelector('select[name="item"]');
    const mesEl = ov.querySelector('input[name="mes"]');
    const valEl = ov.querySelector('input[name="valor"]');
    function fill() {
      const it = itens.find(x => x.id === itemSel.value);
      const base = it ? Store.plannedValue(it, mesEl.value || ymAtual) : null;
      valEl.value = base != null ? (Math.round(Math.abs(base) * 100) / 100).toFixed(2).replace(".", ",") : "";
    }
    itemSel.addEventListener("change", fill);
    mesEl.addEventListener("change", fill);
    fill();
  }
  return { abrir };
})();

// Menu "Adicionar" — abre o formulário certo para cada tipo de lançamento.
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
            <button type="button" data-add="abast">⛽ Abastecimento</button>
            <button type="button" data-add="recebido">＋ Recebido (receita fixa)</button>
            <button type="button" data-add="pago">－ Pago (despesa fixa)</button>
          </div>
          <div class="actions"><button type="button" class="cancel">Fechar</button></div>
        </div>
      </div>`);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    ov.querySelector(".cancel").addEventListener("click", () => ov.remove());
    const acoes = {
      compra: () => ViewCartoes.abrirNovaCompra(null),
      parcelada: () => ViewCartoes.abrirNovaCompra(null),
      abast: () => ViewCombustivel.abrirForm(null),
      recebido: () => Marcar.abrir("receita"),
      pago: () => Marcar.abrir("despesa")
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
          <button class="inicio-btn destaque" data-act="adicionar"><span class="ib-ic">➕</span><span>Adicionar<br><small>compra · abastecimento · recebido · pago</small></span></button>
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
