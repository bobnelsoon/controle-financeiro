// Tela: Lançamentos avulsos (dia a dia), com suporte a parcelamento
"use strict";

const ViewLancamentos = (() => {
  let mesSel = U.ymHoje();

  function abrirNovo() {
    const cartoes = Store.state.accounts.filter(a => a.type === "cartao")
      .map(a => `<option value="${a.id}">${U.esc(a.name)}</option>`).join("");
    UI.modal("Novo lançamento", `
      <label class="fld"><span>Descrição</span><input type="text" name="desc" required></label>
      <label class="fld"><span>Valor (R$) — use negativo para despesa, ex.: -89,90</span>
        <input type="text" name="valor" required placeholder="-89,90" inputmode="decimal"></label>
      <label class="fld"><span>Data</span><input type="date" name="data" value="${U.hojeISO()}"></label>
      <label class="fld"><span>Categoria</span>${UI.selectCategorias("cat", "mercado")}</label>
      <label class="fld"><span>Forma de pagamento</span>
        <select name="forma" id="lanc-forma">
          <option value="pix">Pix / transferência / débito</option>
          <option value="cartao">💳 Cartão de crédito</option>
        </select></label>
      <p class="muted" id="lanc-pix-nota" style="font-size:12px">Lançamentos por pix/débito/transferência
      atualizam o <b>Saldo em conta</b> na hora: valor positivo entra, negativo sai.</p>
      <div id="lanc-cartao-box" style="display:none">
        <label class="fld"><span>Qual cartão?</span><select name="cartao">${cartoes}</select></label>
        <label class="fld"><span>Entra na fatura de</span><input type="month" name="fatura" value="${U.ymHoje()}"></label>
        <p class="muted" style="font-size:12px">A compra vai direto para a tela <b>Cartões</b> e o item
        "Cartão (fatura)" do Fluxo Anual atualiza sozinho (parcelas caem nas próximas faturas).</p>
      </div>
      <label class="fld"><span>Parcelas (1 = à vista)</span><input type="number" name="parcelas" value="1" min="1" max="48"></label>
    `, (form) => {
      const valorTotal = U.parseMoney(form.valor.value);
      if (valorTotal == null || !form.desc.value.trim()) return false;
      const n = Math.max(1, Number(form.parcelas.value) || 1);
      const desc = form.desc.value.trim();

      if (form.forma.value === "cartao") {
        // Compra no cartão: vira lançamento de fatura (tela Cartões) e alimenta o Fluxo Anual
        if (!form.cartao.value) return false;
        const vParc = Math.round((Math.abs(valorTotal) / n) * 100) / 100;
        const base = form.fatura.value || U.ymHoje();
        for (let i = 0; i < n; i++) {
          Store.addCardTx({
            id: U.id(),
            ym: U.ymAdd(base, i),
            accountId: form.cartao.value,
            desc: desc + (n > 1 ? ` ${String(i + 1).padStart(2, "0")}/${String(n).padStart(2, "0")}` : ""),
            value: vParc,
            date: form.data.value || null
          });
        }
      } else {
        const base = form.data.value || U.hojeISO();
        const valorParcela = Math.round((valorTotal / n) * 100) / 100;
        for (let i = 0; i < n; i++) {
          const ymStr = U.ymAdd(base.slice(0, 7), i);
          const dia = base.slice(8);
          Store.addTransaction({
            id: U.id(),
            date: ymStr + "-" + dia,
            desc: desc + (n > 1 ? ` (${i + 1}/${n})` : ""),
            value: valorParcela,
            categoryId: form.cat.value,
            accountId: null
          });
        }
      }
      App.render();
    });

    // mostra a escolha do cartão só quando a forma de pagamento é "cartão"
    const selForma = document.getElementById("lanc-forma");
    selForma.addEventListener("change", () => {
      const ehCartao = selForma.value === "cartao";
      document.getElementById("lanc-cartao-box").style.display = ehCartao ? "" : "none";
      document.getElementById("lanc-pix-nota").style.display = ehCartao ? "none" : "";
    });
  }

  function render(root) {
    const txs = Store.txDoMes(mesSel);
    const total = txs.reduce((s, t) => s + t.value, 0);

    root.innerHTML = `
      <div class="page-head">
        <h1>Lançamentos</h1>
        <input type="month" id="sel-mes" value="${mesSel}">
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-novo">+ Novo lançamento</button>
      </div>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Cartão/Conta</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody id="tx-body"></tbody>
          <tfoot><tr><td colspan="4"><b>Total do mês</b></td>
            <td class="num ${U.clsValor(total)}"><b>${U.brl(total)}</b></td><td></td></tr></tfoot>
        </table>
        ${txs.length ? "" : `<p class="empty">Nenhum lançamento em ${U.ymLabel(mesSel)}. Os itens fixos ficam na tela Fluxo Anual — aqui entram os gastos do dia a dia.</p>`}
      </div>`;

    root.querySelector("#sel-mes").addEventListener("change", e => { mesSel = e.target.value; App.render(); });
    root.querySelector("#btn-novo").addEventListener("click", abrirNovo);

    const body = root.querySelector("#tx-body");
    for (const t of txs) {
      const tr = U.el(`
        <tr>
          <td>${U.dataBR(t.date)}</td>
          <td>${U.esc(t.desc)}</td>
          <td><span class="tag">${U.esc(Store.catName(t.categoryId))}</span></td>
          <td>${U.esc(t.accountId ? Store.accName(t.accountId) : "—")}</td>
          <td class="num ${U.clsValor(t.value)}">${U.brl(t.value)}</td>
          <td><button class="btn-sm btn-danger" title="Excluir">✕</button></td>
        </tr>`);
      tr.querySelector("button").addEventListener("click", () => {
        UI.confirmar(`Excluir "${t.desc}"?`, () => { Store.removeTransaction(t.id); App.render(); });
      });
      body.appendChild(tr);
    }
  }

  return { render };
})();
