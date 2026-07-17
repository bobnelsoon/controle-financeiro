// Tela: Orçamento por categoria — limite mensal x gasto
"use strict";

const ViewOrcamento = (() => {
  let mesSel = U.ymHoje();

  function render(root) {
    const st = Store.state;
    const porCat = Store.despesasPorCategoria(mesSel);

    root.innerHTML = `
      <div class="page-head">
        <h1>Orçamento</h1>
        <input type="month" id="sel-mes" value="${mesSel}">
      </div>
      <div class="card">
        <p class="muted" style="margin-top:0">Defina um limite mensal por categoria. O gasto considera as despesas fixas do Fluxo Anual + lançamentos avulsos do mês.</p>
        <table class="tbl">
          <thead><tr><th>Categoria</th><th class="num">Gasto no mês</th><th style="width:110px" class="num">Limite (R$)</th><th style="width:220px">Progresso</th><th class="num">Restante</th></tr></thead>
          <tbody id="orc-body"></tbody>
        </table>
      </div>`;

    root.querySelector("#sel-mes").addEventListener("change", e => { mesSel = e.target.value; App.render(); });

    const body = root.querySelector("#orc-body");
    const catsDespesa = st.categories.filter(c => !["sal", "alugueis", "empfeitos"].includes(c.id));
    for (const c of catsDespesa) {
      const gasto = porCat[c.id] || 0;
      const lim = st.budgets[c.id] || 0;
      const tr = U.el(`
        <tr>
          <td>${U.esc(c.name)}</td>
          <td class="num">${U.brl(gasto)}</td>
          <td class="num"><input type="text" style="width:100px;text-align:right" inputmode="decimal"
               value="${lim ? String(lim).replace(".", ",") : ""}" placeholder="—"></td>
          <td class="prog"></td>
          <td class="num rest"></td>
        </tr>`);
      const prog = tr.querySelector(".prog");
      const rest = tr.querySelector(".rest");
      if (lim > 0) {
        prog.appendChild(Charts.budgetBar(gasto, lim));
        const sobra = lim - gasto;
        rest.innerHTML = `<span class="${U.clsValor(sobra)}">${U.brl(sobra)}</span>`;
      } else {
        prog.innerHTML = `<span class="muted">sem limite</span>`;
        rest.textContent = "—";
      }
      tr.querySelector("input").addEventListener("change", e => {
        const v = U.parseMoney(e.target.value);
        if (v && v > 0) st.budgets[c.id] = v; else delete st.budgets[c.id];
        Store.save();
        App.render();
      });
      body.appendChild(tr);
    }
  }

  return { render };
})();
