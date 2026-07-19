// Tela: Cartões — fatura do mês por cartão, com todos os gastos (importados da planilha + novos)
"use strict";

const ViewCartoes = (() => {
  // Abre na fatura vigente: gastos do mês atual são pagos no mês seguinte,
  // então a fatura "em aberto" é a do próximo mês.
  let mesSel = U.ymAdd(U.ymHoje(), 1);

  function abrirConta(acc) {
    const isNew = !acc;
    acc = acc || { id: U.id(), name: "", type: "cartao", dueDay: null, limit: null };
    UI.modal(isNew ? "Novo cartão/conta" : "Editar " + acc.name, `
      <label class="fld"><span>Nome</span><input type="text" name="nome" value="${U.esc(acc.name)}" required></label>
      <label class="fld"><span>Dia do vencimento da fatura</span>
        <input type="number" name="dia" min="1" max="31" value="${acc.dueDay ?? ""}"></label>
      <label class="fld"><span>Limite (R$, opcional)</span>
        <input type="text" name="limite" value="${acc.limit != null ? String(acc.limit).replace(".", ",") : ""}" inputmode="decimal"></label>
    `, (form) => {
      acc.name = form.nome.value.trim();
      if (!acc.name) return false;
      acc.dueDay = form.dia.value ? Number(form.dia.value) : null;
      acc.limit = U.parseMoney(form.limite.value);
      if (isNew) Store.state.accounts.push(acc);
      Store.save();
      App.render();
    });
  }

  function abrirNovaCompra(accountId) {
    const contas = Store.state.accounts.map(a =>
      `<option value="${a.id}" ${a.id === accountId ? "selected" : ""}>${U.esc(a.name)}</option>`).join("");
    UI.modal("Nova compra no cartão", `
      <label class="fld"><span>Cartão</span><select name="conta">${contas}</select></label>
      <label class="fld"><span>Descrição</span><input type="text" name="desc" required placeholder="ex.: mercado, posto..."></label>
      <label class="fld"><span>Valor total da compra (R$)</span>
        <input type="text" name="valor" required inputmode="decimal" placeholder="ex.: 250,00"></label>
      <label class="fld"><span>Parcelas (1 = à vista)</span><input type="number" name="parcelas" value="1" min="1" max="48"></label>
      <label class="fld"><span>Fatura de</span><input type="month" name="fatura" value="${mesSel}"></label>
      <label class="fld"><span>Data da compra (opcional)</span><input type="date" name="data" value="${U.hojeISO()}"></label>
      <p class="muted" style="font-size:12px">Compras parceladas entram automaticamente nas próximas faturas, e o item "Cartão (fatura)" do Fluxo Anual é atualizado sozinho.</p>
    `, (form) => {
      const total = U.parseMoney(form.valor.value);
      if (total == null || !form.desc.value.trim()) return false;
      const n = Math.max(1, Number(form.parcelas.value) || 1);
      const vParc = Math.round((Math.abs(total) / n) * 100) / 100;
      const base = form.fatura.value || mesSel;
      const groupId = n > 1 ? U.id() : null; // liga as parcelas para excluir todas de uma vez
      for (let i = 0; i < n; i++) {
        const tx = {
          id: U.id(),
          ym: U.ymAdd(base, i),
          accountId: form.conta.value,
          desc: form.desc.value.trim() + (n > 1 ? ` ${String(i + 1).padStart(2, "0")}/${String(n).padStart(2, "0")}` : ""),
          value: vParc,
          date: form.data.value || null
        };
        if (groupId) tx.groupId = groupId;
        Store.addCardTx(tx);
      }
      App.render();
    });
  }

  function render(root) {
    const st = Store.state;
    const totalGeral = Store.faturaTotal(mesSel, null);

    root.innerHTML = `
      <div class="page-head">
        <h1>Cartões</h1>
        <input type="month" id="sel-mes" value="${mesSel}">
        <span class="tag num">Total das faturas: <b class="${totalGeral > 0 ? "neg" : ""}">${U.brl(totalGeral)}</b></span>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-compra">+ Compra no cartão</button>
        <button id="btn-nova">+ Cartão</button>
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:-8px">
        A fatura é identificada pelo <b>mês em que é paga</b>: um gasto feito agora entra na fatura do mês seguinte.
        Por isso a tela abre na <b>fatura vigente</b> (${U.MESES[U.ymParse(mesSel).m - 1]}), que reúne os gastos do mês anterior.
        O total abastece o item <b>Cartão (fatura)</b> do Fluxo Anual.</p>
      <div id="card-list"></div>`;

    root.querySelector("#sel-mes").addEventListener("change", e => { mesSel = e.target.value; App.render(); });
    root.querySelector("#btn-nova").addEventListener("click", () => abrirConta(null));
    root.querySelector("#btn-compra").addEventListener("click", () => abrirNovaCompra(null));

    const list = root.querySelector("#card-list");
    let algum = false;

    for (const a of st.accounts) {
      const txs = Store.cardTxDoMes(mesSel, a.id).sort((x, y) => (x.date || "") < (y.date || "") ? -1 : 1);
      const fatura = txs.reduce((s, t) => s + t.value, 0);
      if (!txs.length && a.type !== "cartao") continue;
      algum = algum || txs.length > 0;

      const card = U.el(`
        <div class="card mb">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <b style="font-size:15px">💳 ${U.esc(a.name)}</b>
              <span class="muted" style="font-size:12px">${a.dueDay ? " · vence dia " + a.dueDay : ""}</span>
            </div>
            <div class="row-gap">
              <span class="tag num">Fatura ${U.ymLabel(mesSel)}: <b>${U.brl(fatura)}</b></span>
              ${a.limit ? `<span class="tag num">Limite ${U.brl(a.limit)}</span>` : ""}
              <button class="btn-sm add">+ Compra</button>
              <button class="btn-sm ed">Editar</button>
            </div>
          </div>
          <details ${txs.length && txs.length <= 60 ? "" : ""}>
            <summary style="cursor:pointer" class="muted mt">${txs.length} lançamento(s) nesta fatura</summary>
            <table class="tbl mt">
              <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead>
              <tbody></tbody>
            </table>
          </details>
        </div>`);

      const tbody = card.querySelector("tbody");
      for (const t of txs) {
        const tr = U.el(`
          <tr>
            <td>${t.date ? U.dataBR(t.date) : "—"}</td>
            <td>${U.esc(t.desc)}</td>
            <td class="num ${t.value < 0 ? "pos" : ""}">${U.brl(t.value)}</td>
            <td><button class="btn-sm btn-danger" title="Excluir">✕</button></td>
          </tr>`);
        tr.querySelector("button").addEventListener("click", () => {
          const parcelas = Store.cardTxParcelas(t);
          if (parcelas.length > 1) {
            const n = parcelas.length;
            const totalParc = parcelas.reduce((s, p) => s + p.value, 0);
            const ov = UI.modal("Excluir compra parcelada",
              `<p>Esta compra tem <b>${n} parcela(s)</b> espalhadas por vários meses (total ${U.brl(totalParc)}).</p>
               <p>Quer excluir <b>todas as ${n} parcelas</b> ou só esta parcela desta fatura?</p>`,
              () => { Store.removeCardTxIds(parcelas.map(p => p.id)); App.render(); return true; },
              { okLabel: `Excluir todas as ${n} parcelas`, extraBtn: `<button type="button" class="btn-so-esta">Só esta parcela</button>` });
            ov.querySelector(".btn-so-esta").addEventListener("click", () => {
              Store.removeCardTx(t.id);
              UI.closeModal();
              App.render();
            });
          } else {
            UI.confirmar(`Excluir "${t.desc}" da fatura de ${U.ymLabel(mesSel)}?`, () => {
              Store.removeCardTx(t.id);
              App.render();
            });
          }
        });
        tbody.appendChild(tr);
      }

      card.querySelector(".add").addEventListener("click", () => abrirNovaCompra(a.id));
      card.querySelector(".ed").addEventListener("click", () => abrirConta(a));
      list.appendChild(card);
    }

    if (!algum && !st.accounts.length) list.innerHTML = `<div class="card"><p class="empty">Nenhum cartão cadastrado.</p></div>`;
  }

  return { render, abrirNovaCompra };
})();
