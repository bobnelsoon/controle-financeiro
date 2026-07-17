// Tela: Empréstimos a receber — pessoas, parcelas e status
"use strict";

const ViewEmprestimos = (() => {
  function abrirNovo() {
    UI.modal("Novo empréstimo a receber", `
      <label class="fld"><span>Pessoa</span><input type="text" name="pessoa" required></label>
      <label class="fld"><span>Valor total (R$)</span><input type="text" name="total" required inputmode="decimal"></label>
      <label class="fld"><span>Nº de parcelas</span><input type="number" name="n" value="1" min="1" max="120"></label>
      <label class="fld"><span>Primeira parcela em</span><input type="date" name="inicio" value="${U.hojeISO()}"></label>
      <label class="fld"><span>Observação</span><input type="text" name="obs"></label>
    `, (form) => {
      const total = U.parseMoney(form.total.value);
      if (!form.pessoa.value.trim() || total == null) return false;
      const n = Math.max(1, Number(form.n.value) || 1);
      const vParc = Math.round((Math.abs(total) / n) * 100) / 100;
      const base = form.inicio.value || U.hojeISO();
      const items = [];
      for (let i = 0; i < n; i++) {
        items.push({
          id: U.id(),
          due: U.ymAdd(base.slice(0, 7), i) + "-" + base.slice(8),
          value: vParc, status: "ABERTO", label: `Parcela ${i + 1}/${n}`
        });
      }
      Store.state.loans.push({ id: U.id(), person: form.pessoa.value.trim(), note: form.obs.value.trim(), items });
      Store.save();
      App.render();
    });
  }

  function render(root) {
    const st = Store.state;
    root.innerHTML = `
      <div class="page-head">
        <h1>Empréstimos a receber</h1>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-novo">+ Empréstimo</button>
      </div>
      <div id="loans"></div>`;
    root.querySelector("#btn-novo").addEventListener("click", abrirNovo);

    const wrap = root.querySelector("#loans");
    if (!st.loans.length) { wrap.innerHTML = `<div class="card"><p class="empty">Nenhum empréstimo cadastrado.</p></div>`; return; }

    for (const l of st.loans) {
      const abertas = l.items.filter(i => i.status === "ABERTO");
      const pagas = l.items.filter(i => i.status === "PAGO");
      const restante = abertas.reduce((s, i) => s + i.value, 0);
      const recebido = pagas.reduce((s, i) => s + i.value, 0);

      const card = U.el(`
        <div class="card mb">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <b style="font-size:15px">${U.esc(l.person)}</b>
              ${l.note ? `<div class="muted" style="font-size:12px">${U.esc(l.note)}</div>` : ""}
            </div>
            <div class="row-gap">
              <span class="tag num">A receber: <b class="pos">${U.brl(restante)}</b></span>
              <span class="tag num">Recebido: ${U.brl(recebido)}</span>
              <button class="btn-sm btn-danger rm">Excluir</button>
            </div>
          </div>
          <details class="mt"><summary style="cursor:pointer" class="muted">Parcelas (${abertas.length} em aberto)</summary>
            <table class="tbl mt"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead>
              <tbody></tbody></table>
          </details>
        </div>`);

      const tbody = card.querySelector("tbody");
      for (const p of l.items) {
        const tr = U.el(`
          <tr>
            <td>${U.esc(p.label || "—")}</td>
            <td>${p.due ? U.dataBR(p.due) : "—"}</td>
            <td class="num">${U.brl(p.value)}</td>
            <td><button class="btn-sm">${p.status === "PAGO" ? '<span class="chip pago">PAGO</span>' : '<span class="chip aberto">ABERTO</span>'}</button></td>
          </tr>`);
        tr.querySelector("button").addEventListener("click", () => {
          p.status = p.status === "PAGO" ? "ABERTO" : "PAGO";
          Store.save();
          App.render();
        });
        tbody.appendChild(tr);
      }
      card.querySelector(".rm").addEventListener("click", () => {
        UI.confirmar(`Excluir o empréstimo de ${l.person}?`, () => {
          Store.state.loans = Store.state.loans.filter(x => x.id !== l.id);
          Store.save();
          App.render();
        });
      });
      wrap.appendChild(card);
    }
  }

  return { render };
})();
