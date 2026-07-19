// Controle de Combustível — abastecimentos, consumo (km/l tanque a tanque), custos e pedágio
"use strict";

const ViewCombustivel = (() => {
  const TIPOS = [["gasolina", "Gasolina"], ["alcool", "Álcool"], ["diesel", "Diesel"], ["gnv", "GNV"]];
  const tipoLabel = (v) => (TIPOS.find(t => t[0] === v) || [null, "—"])[1];
  // Mapa para importação (aceita "Álcool", "Etanol", "Gasolina" etc.)
  const MAPA_FUEL = { gasolina: "gasolina", "álcool": "alcool", alcool: "alcool", etanol: "alcool", diesel: "diesel", gnv: "gnv" };

  function num(t) {
    if (t == null || String(t).trim() === "") return null;
    return U.parseMoney(t);
  }
  const kmL = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : "—";
  const km = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " km" : "—";
  const lit = (v) => v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " L" : "—";
  // Parcial se a observação indicar; senão, tanque cheio.
  const obsIndicaParcial = (obs) => /parcial|m[íi]nimo|refor[çc]o/i.test(obs || "");

  // Formulário de novo/editar abastecimento (usado pelas duas abas).
  function abrirForm(entry) {
    const e = entry || {};
    const tipoOpts = TIPOS.map(([v, l]) => `<option value="${v}" ${e.fuelType === v ? "selected" : ""}>${l}</option>`).join("");
    UI.modal(entry ? "Editar abastecimento" : "Novo abastecimento", `
      <div class="fld-2">
        <label class="fld"><span>Data</span><input type="date" name="date" value="${e.date || U.hojeISO()}" required></label>
        <label class="fld"><span>Hodômetro (km)</span><input type="text" name="odometer" inputmode="decimal" value="${e.odometer != null ? e.odometer : ""}" placeholder="ex: 50000"></label>
      </div>
      <div class="fld-2">
        <label class="fld"><span>Combustível</span><select name="fuelType">${tipoOpts}</select></label>
        <label class="fld"><span>Litros</span><input type="text" name="liters" inputmode="decimal" value="${e.liters != null ? e.liters : ""}" placeholder="ex: 30"></label>
      </div>
      <div class="fld-2">
        <label class="fld"><span>Preço / litro (R$)</span><input type="text" name="price" inputmode="decimal" value="${e.pricePerLiter != null ? e.pricePerLiter : ""}" placeholder="ex: 5,49"></label>
        <label class="fld"><span>Total (R$)</span><input type="text" name="total" inputmode="decimal" value="${e.total != null ? e.total : ""}" placeholder="ex: 164,70"></label>
      </div>
      <div class="fld-2">
        <label class="fld"><span>Local</span><input type="text" name="local" value="${U.esc(e.local || "")}" placeholder="ex: cidade / posto"></label>
        <label class="fld"><span>Pedágio (R$)</span><input type="text" name="toll" inputmode="decimal" value="${e.toll ? e.toll : ""}" placeholder="ex: 0"></label>
      </div>
      <label class="fld"><span>Observação</span><input type="text" name="obs" value="${U.esc(e.obs || "")}" placeholder="ex: Completou tanque"></label>
      <label class="fld fld-check"><input type="checkbox" name="full" ${e.full === false ? "" : "checked"}><span>Tanque cheio (usar no cálculo de consumo)</span></label>
    `, (form) => {
      const liters = num(form.liters.value);
      let price = num(form.price.value);
      let total = num(form.total.value);
      const temAbast = liters != null && liters > 0;
      if (temAbast) {
        if (total == null && price != null) total = Math.round(liters * price * 100) / 100;
        if (price == null && total != null) price = Math.round((total / liters) * 100) / 100;
      }
      const dados = {
        date: form.date.value || U.hojeISO(),
        odometer: num(form.odometer.value),
        liters: temAbast ? liters : null,
        pricePerLiter: temAbast ? price : null,
        total: temAbast ? total : null,
        fuelType: temAbast ? form.fuelType.value : null,
        local: form.local.value.trim(),
        toll: num(form.toll.value) || 0,
        obs: form.obs.value.trim(),
        full: form.full.checked
      };
      if (entry) Store.updateFuel(entry.id, dados);
      else Store.addFuel(dados);
      App.render();
    });
  }

  // Importar histórico colado em JSON (roda no navegador do usuário; nada sai do aparelho).
  function abrirImportar() {
    UI.modal("Importar abastecimentos", `
      <p class="muted" style="font-size:12.5px;margin-top:0">Cole uma lista em JSON. Campos aceitos por item:
      <code>date, km, fuel, local, liters, price, paid, toll, obs</code>. Itens só de pedágio (sem litros) também entram.</p>
      <label class="fld"><span>Dados (JSON)</span><textarea name="json" rows="9" placeholder='[{"date":"2026-01-15","km":50000,"fuel":"Gasolina","local":"cidade","liters":30,"price":5.49,"paid":164.70,"toll":0,"obs":"Completou tanque"}]'></textarea></label>
      <label class="fld fld-check"><input type="checkbox" name="clear"><span>Substituir os abastecimentos atuais (apaga os que já existem)</span></label>
      <div id="imp-msg" class="muted" style="font-size:12.5px"></div>
    `, (form) => {
      const msg = form.querySelector("#imp-msg");
      let arr;
      try { arr = JSON.parse(form.json.value); }
      catch (err) { msg.innerHTML = `<span class="neg">JSON inválido: ${U.esc(err.message)}</span>`; return false; }
      if (!Array.isArray(arr)) { msg.innerHTML = `<span class="neg">Esperado uma lista [ ... ].</span>`; return false; }

      // Dois abastecimentos no mesmo hodômetro (ex.: completar em dois postos na mesma parada)
      // não fecham um tanque cheio válido → tratados como parciais no cálculo de consumo.
      const kmCount = {};
      for (const r of arr) { const k = num(r.km != null ? r.km : r.odometer); if (k != null) kmCount[k] = (kmCount[k] || 0) + 1; }

      const novos = arr.map((r) => {
        const liters = num(r.liters);
        const temAbast = liters != null && liters > 0;
        const local = (r.local && r.local !== "—") ? String(r.local).trim() : "";
        const odometer = num(r.km != null ? r.km : r.odometer);
        const kmRepetido = odometer != null && kmCount[odometer] > 1;
        return {
          date: r.date || U.hojeISO(),
          odometer,
          liters: temAbast ? liters : null,
          pricePerLiter: temAbast ? num(r.price != null ? r.price : r.pricePerLiter) : null,
          total: temAbast ? num(r.paid != null ? r.paid : r.total) : null,
          fuelType: temAbast ? (MAPA_FUEL[String(r.fuel || "").toLowerCase().trim()] || null) : null,
          local,
          toll: num(r.toll) || 0,
          obs: r.obs ? String(r.obs).trim() : "",
          full: temAbast ? (!obsIndicaParcial(r.obs) && !kmRepetido) : false
        };
      });
      if (form.clear.checked) Store.clearFuel();
      Store.addFuelMany(novos);
      App.render();
    }, { okLabel: "Importar" });
  }

  function statCard(label, valor, sub, goto) {
    return `
      <div class="card stat${goto ? " clickable" : ""}"${goto ? ` data-goto="${goto}"` : ""}>
        <div class="stat-label">${label}</div>
        <div class="stat-value num">${valor}</div>
        <div class="stat-sub">${sub}</div>
      </div>`;
  }

  function ligarGoto(root) {
    root.querySelectorAll("[data-goto]").forEach(el =>
      el.addEventListener("click", () => { location.hash = "#" + el.dataset.goto; }));
  }

  // Comparador "álcool ou gasolina compensa?" — usa o consumo real de cada combustível.
  function consumosComparador() {
    const cons = Store.fuelConsumoPorFuel();
    const v = Store.fuelVehicle();
    const cA = (v.consumoAlcool && v.consumoAlcool > 0) ? v.consumoAlcool : (cons.alcool || 11);
    const cG = (v.consumoGasolina && v.consumoGasolina > 0) ? v.consumoGasolina : (cons.gasolina || 17.4);
    return { cA, cG };
  }
  function comparadorHTML() {
    const { cA, cG } = consumosComparador();
    const pA = Store.fuelUltimoPreco("alcool");
    const pG = Store.fuelUltimoPreco("gasolina");
    return `
      <div class="card">
        <b style="font-size:15px">⛽ Álcool ou gasolina?</b>
        <div class="muted" style="font-size:12px;margin:2px 0 10px">Consumo usado: álcool ${cA.toLocaleString("pt-BR",{maximumFractionDigits:1})} km/l · gasolina ${cG.toLocaleString("pt-BR",{maximumFractionDigits:1})} km/l</div>
        <div class="fld-2">
          <label class="fld"><span>Preço do álcool (R$/L)</span><input type="text" id="cmp-alc" inputmode="decimal" value="${pA != null ? pA : ""}" placeholder="ex: 3,59"></label>
          <label class="fld"><span>Preço da gasolina (R$/L)</span><input type="text" id="cmp-gas" inputmode="decimal" value="${pG != null ? pG : ""}" placeholder="ex: 6,49"></label>
        </div>
        <div id="cmp-res" style="margin-top:4px"></div>
      </div>`;
  }
  function ligarComparador(root) {
    const alc = root.querySelector("#cmp-alc");
    const gas = root.querySelector("#cmp-gas");
    const res = root.querySelector("#cmp-res");
    if (!alc || !gas || !res) return;
    const { cA, cG } = consumosComparador();
    function calc() {
      const pa = num(alc.value), pg = num(gas.value);
      if (pa == null || pg == null || pa <= 0 || pg <= 0) {
        res.innerHTML = `<span class="muted" style="font-size:12.5px">Informe os dois preços para comparar.</span>`;
        return;
      }
      const custoA = pa / cA, custoG = pg / cG;
      const alcoolVale = custoA <= custoG;
      const econ = Math.abs(custoA - custoG);
      const breakeven = pg * (cA / cG); // preço de álcool no ponto de equilíbrio
      const pct = (pa / pg) * 100;
      res.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="tag num">Álcool: <b>${U.brl(custoA)}/km</b></span>
          <span class="tag num">Gasolina: <b>${U.brl(custoG)}/km</b></span>
        </div>
        <div style="font-size:15px;font-weight:700" class="${alcoolVale ? "pos" : "neg"}">
          ${alcoolVale ? "✅ Compensa ÁLCOOL" : "✅ Compensa GASOLINA"}
          <span style="font-weight:500;font-size:12.5px" class="muted">(economia ${U.brl(econ)}/km)</span>
        </div>
        <div class="muted" style="font-size:12px;margin-top:6px">
          Hoje o álcool está a ${pct.toLocaleString("pt-BR",{maximumFractionDigits:0})}% do preço da gasolina.
          Ponto de virada: álcool vale até <b>${U.brl(breakeven)}/L</b> (${(cA / cG * 100).toLocaleString("pt-BR",{maximumFractionDigits:0})}% da gasolina).
        </div>`;
    }
    alc.addEventListener("input", calc);
    gas.addEventListener("input", calc);
    calc();
  }

  function render(root) {
    const s = Store.fuelStats();
    const { m, y } = U.ymParse(U.ymHoje());
    const comp = Store.fuelEntriesComputed().filter(e => e.liters != null && e.liters > 0);
    const ultimos = comp.slice(-6).reverse();
    const prev = Store.fuelPrevisaoProxMes();
    const mesProx = U.ymParse(prev.ymProx);

    root.innerHTML = `
      <div class="page-head">
        <h1>📊 Combustível</h1>
        <span class="muted">${U.MESES[m - 1]} de ${y}</span>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-abast">+ Abastecimento</button>
      </div>
      <div class="cards-grid">
        ${statCard("Consumo médio", kmL(s.consumoMedio), "tanque cheio → tanque cheio", "abastecimentos")}
        ${statCard("Custo por km", s.custoKmMedio != null ? U.brl(s.custoKmMedio) : "—", "só combustível", "abastecimentos")}
        ${statCard("Gasto do mês", U.brl(s.gastoMes), `${s.nMes} abastecimento(s) · ${lit(s.litrosMes)}`, "abastecimentos")}
        ${statCard("Preço médio do litro", s.precoMedioMes != null ? U.brl(s.precoMedioMes) : "—", `no mês de ${U.MESES[m - 1]}`, "abastecimentos")}
        ${statCard("Km rodados no mês", km(s.kmMes), "entre os registros do mês", "abastecimentos")}
        ${statCard("🛣️ Pedágio do mês", U.brl(s.tollMes), `total pago: ${U.brl(s.tollTotal)}`, "abastecimentos")}
      </div>
      <div class="grid-2">
        <div class="card previsao-card">
          <div class="stat-label">📅 Previsão para ${U.MESES[mesProx.m - 1]}</div>
          <div class="stat-value num ${prev.totalPrev != null ? "" : "muted"}">${prev.totalPrev != null ? "~" + U.brl(prev.totalPrev) : "—"}</div>
          <div class="stat-sub">gasto aproximado do próximo mês (combustível + pedágio)</div>
          ${prev.totalPrev != null ? `
          <table class="tbl mt"><tbody>
            <tr><td>⛽ Combustível</td><td class="num">${prev.combPrev != null ? "~" + U.brl(prev.combPrev) : "—"}</td></tr>
            <tr><td>🛣️ Pedágio</td><td class="num">${prev.tollPrev != null ? "~" + U.brl(prev.tollPrev) : "—"}</td></tr>
            <tr><td><b>Total</b></td><td class="num"><b>${"~" + U.brl(prev.totalPrev)}</b></td></tr>
          </tbody></table>
          <div class="muted" style="font-size:11.5px;margin-top:8px">
            Base: ~${prev.kmPrev != null ? prev.kmPrev.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"} km no mês
            (ritmo ${prev.pace != null ? prev.pace.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"} km/dia)
            · consumo ${prev.consumo != null ? prev.consumo.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"} km/l
            · litro ~${prev.precoLitro != null ? U.brl(prev.precoLitro) : "—"}. Pedágio = média dos meses anteriores.
          </div>` : `<p class="empty">Cadastre alguns abastecimentos para o app estimar o próximo mês.</p>`}
        </div>
        <div class="card">
          <b style="font-size:15px">Gasto por mês</b>
          <div class="muted" style="font-size:12px;margin:2px 0 8px">combustível (pedágio à parte)</div>
          <div id="comb-mes-chart"></div>
        </div>
      </div>
      <div class="grid-2">
        ${comparadorHTML()}
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <b style="font-size:15px">Últimos abastecimentos</b>
            <a href="#abastecimentos" class="muted" style="font-size:12.5px">ver todos →</a>
          </div>
          <div id="comb-ultimos" class="mt"></div>
        </div>
      </div>`;

    root.querySelector("#btn-abast").addEventListener("click", () => abrirForm(null));
    ligarGoto(root);
    ligarComparador(root);

    // Gráfico de gasto por mês (combustível) + barra da previsão do próximo mês
    const chartEl = root.querySelector("#comb-mes-chart");
    const meses = Store.fuelGastoPorMes();
    if (!meses.length) {
      chartEl.innerHTML = `<p class="empty">Sem dados ainda.</p>`;
    } else {
      const rows = meses.slice(-6).map(x => ({ label: U.MESES_ABREV[U.ymParse(x.ym).m - 1], value: Math.round(x.comb) }));
      if (prev.combPrev != null) rows.push({ label: U.MESES_ABREV[mesProx.m - 1] + " (prev.)", value: Math.round(prev.combPrev) });
      Charts.barsH(chartEl, rows);
    }

    const wrap = root.querySelector("#comb-ultimos");
    if (!ultimos.length) {
      wrap.innerHTML = `<p class="empty">Nenhum abastecimento cadastrado. Clique em “+ Abastecimento” ou importe seu histórico na aba Abastecimentos.</p>`;
      return;
    }
    const tbl = U.el(`
      <table class="tbl">
        <thead><tr><th>Data</th><th>Combustível</th><th class="num">Litros</th><th class="num">R$/L</th><th class="num">Total</th><th class="num">Consumo</th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = tbl.querySelector("tbody");
    for (const e of ultimos) {
      tbody.appendChild(U.el(`
        <tr>
          <td>${U.dataBR(e.date)}${e.local ? `<div class="muted" style="font-size:11px">${U.esc(e.local)}</div>` : ""}</td>
          <td>${e.fuelType ? tipoLabel(e.fuelType) : "—"}</td>
          <td class="num">${e.liters != null ? e.liters.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
          <td class="num">${e.pricePerLiter != null ? U.brl(e.pricePerLiter) : "—"}</td>
          <td class="num">${e.total != null ? U.brl(e.total) : "—"}</td>
          <td class="num">${kmL(e.kmL)}${e.full === false ? ' <span class="muted" style="font-size:10px">(parcial)</span>' : ""}</td>
        </tr>`));
    }
    wrap.appendChild(tbl);
  }

  return { render, abrirForm, abrirImportar, tipoLabel };
})();

// Aba: lista completa de abastecimentos (adicionar / editar / excluir / importar)
const ViewAbastecimentos = (() => {
  function render(root) {
    const comp = Store.fuelEntriesComputed().reverse(); // mais novo primeiro
    root.innerHTML = `
      <div class="page-head">
        <h1>Abastecimentos</h1>
        <div class="spacer"></div>
        <button class="btn-sm" id="btn-importar">📥 Importar</button>
        <button class="btn-primary" id="btn-abast">+ Abastecimento</button>
      </div>
      <div class="card"><div id="comb-lista"></div></div>`;
    root.querySelector("#btn-abast").addEventListener("click", () => ViewCombustivel.abrirForm(null));
    root.querySelector("#btn-importar").addEventListener("click", () => ViewCombustivel.abrirImportar());

    const wrap = root.querySelector("#comb-lista");
    if (!comp.length) {
      wrap.innerHTML = `<p class="empty">Nenhum abastecimento cadastrado. Clique em “+ Abastecimento” ou “📥 Importar”.</p>`;
      return;
    }
    const tbl = U.el(`
      <table class="tbl tbl-wide">
        <thead><tr>
          <th>Data</th><th>Combustível</th><th class="num">Hodômetro</th><th class="num">Km</th>
          <th class="num">Litros</th><th class="num">R$/L</th><th class="num">Total</th>
          <th class="num">Consumo</th><th class="num">Pedágio</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = tbl.querySelector("tbody");
    for (const e of comp) {
      const temAbast = e.liters != null && e.liters > 0;
      const tr = U.el(`
        <tr${temAbast ? "" : ' class="linha-pedagio"'}>
          <td>${U.dataBR(e.date)}${e.local ? `<div class="muted" style="font-size:11px">${U.esc(e.local)}</div>` : ""}${e.obs ? `<div class="muted" style="font-size:10.5px;font-style:italic">${U.esc(e.obs)}</div>` : ""}</td>
          <td>${e.fuelType ? ViewCombustivel.tipoLabel(e.fuelType) : '<span class="muted">— só pedágio</span>'}</td>
          <td class="num">${e.odometer != null ? e.odometer.toLocaleString("pt-BR") : "—"}</td>
          <td class="num">${e.dist != null ? e.dist.toLocaleString("pt-BR") : "—"}</td>
          <td class="num">${temAbast ? e.liters.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
          <td class="num">${e.pricePerLiter != null ? U.brl(e.pricePerLiter) : "—"}</td>
          <td class="num">${e.total != null ? U.brl(e.total) : "—"}</td>
          <td class="num">${e.kmL != null ? e.kmL.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : (temAbast && e.full === false ? '<span class="muted" style="font-size:11px">parcial</span>' : "—")}</td>
          <td class="num">${e.toll ? U.brl(e.toll) : "—"}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn-sm ed" title="Editar">✎</button>
            <button class="btn-sm btn-danger rm" title="Excluir">🗑</button>
          </td>
        </tr>`);
      tr.querySelector(".ed").addEventListener("click", () => ViewCombustivel.abrirForm(e));
      tr.querySelector(".rm").addEventListener("click", () => {
        UI.confirmar(`Excluir o registro de ${U.dataBR(e.date)}?`, () => {
          Store.removeFuel(e.id);
          App.render();
        });
      });
      tbody.appendChild(tr);
    }
    wrap.appendChild(tbl);
  }

  return { render };
})();

// Aba: Veículo — perfil, contador de revisão e manutenção programada
const ViewVeiculo = (() => {
  function num(t) { if (t == null || String(t).trim() === "") return null; return U.parseMoney(t); }

  function abrirPerfil() {
    const v = Store.fuelVehicle();
    const cons = Store.fuelConsumoPorFuel();
    UI.modal("Perfil do veículo", `
      <label class="fld"><span>Modelo</span><input type="text" name="modelo" value="${U.esc(v.modelo || "")}" placeholder="ex: marca modelo ano"></label>
      <div class="fld-2">
        <label class="fld"><span>Tanque (litros)</span><input type="text" name="tanque" inputmode="decimal" value="${v.tanque != null ? v.tanque : ""}" placeholder="ex: 45"></label>
        <label class="fld"><span>Pneu</span><input type="text" name="pneu" value="${U.esc(v.pneu || "")}" placeholder="ex: 185/65 R15"></label>
      </div>
      <label class="fld"><span>Próxima revisão (km)</span><input type="text" name="revisaoKm" inputmode="decimal" value="${v.revisaoKm != null ? v.revisaoKm : ""}" placeholder="ex: 40000"></label>
      <div class="fld-2">
        <label class="fld"><span>Consumo álcool (km/l)</span><input type="text" name="consumoAlcool" inputmode="decimal" value="${v.consumoAlcool != null ? v.consumoAlcool : ""}" placeholder="${cons.alcool ? "real: " + cons.alcool.toFixed(1) : "ex: 11"}"></label>
        <label class="fld"><span>Consumo gasolina (km/l)</span><input type="text" name="consumoGasolina" inputmode="decimal" value="${v.consumoGasolina != null ? v.consumoGasolina : ""}" placeholder="${cons.gasolina ? "real: " + cons.gasolina.toFixed(1) : "ex: 17,4"}"></label>
      </div>
      <p class="muted" style="font-size:12px">Deixe os consumos em branco para o app usar a média real calculada do seu histórico.</p>
    `, (form) => {
      Store.setFuelVehicle({
        modelo: form.modelo.value.trim(),
        tanque: num(form.tanque.value),
        pneu: form.pneu.value.trim(),
        revisaoKm: num(form.revisaoKm.value),
        consumoAlcool: num(form.consumoAlcool.value),
        consumoGasolina: num(form.consumoGasolina.value)
      });
      App.render();
    });
  }

  function abrirManut(item) {
    const it = item || {};
    UI.modal(item ? "Editar item de manutenção" : "Novo item de manutenção", `
      <label class="fld"><span>Descrição</span><input type="text" name="desc" value="${U.esc(it.desc || "")}" required placeholder="ex: Revisão / pneus / montagem"></label>
      <label class="fld"><span>Valor previsto (R$)</span><input type="text" name="value" inputmode="decimal" value="${it.value != null ? it.value : ""}" placeholder="ex: 500"></label>
      <label class="fld fld-check"><input type="checkbox" name="done" ${it.done ? "checked" : ""}><span>Já pago / feito</span></label>
    `, (form) => {
      if (!form.desc.value.trim()) return false;
      const dados = { desc: form.desc.value.trim(), value: num(form.value.value) || 0, done: form.done.checked };
      if (item) Store.updateMaintenance(item.id, dados);
      else Store.addMaintenance(dados);
      App.render();
    });
  }

  function render(root) {
    const v = Store.fuelVehicle();
    const kmAtual = Store.fuelKmAtual();
    const cons = Store.fuelConsumoPorFuel();
    const pace = Store.fuelPaceKmDia();
    const faltam = (v.revisaoKm != null && kmAtual != null) ? v.revisaoKm - kmAtual : null;
    const dias = (faltam != null && faltam > 0 && pace) ? Math.round(faltam / pace) : null;
    let dataPrev = null;
    if (dias != null) { const d = new Date(Date.now() + dias * 86400000); dataPrev = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }

    const manut = Store.fuelMaintenance();
    const totalManut = manut.reduce((s, m) => s + (m.value || 0), 0);
    const pendenteManut = manut.filter(m => !m.done).reduce((s, m) => s + (m.value || 0), 0);

    root.innerHTML = `
      <div class="page-head">
        <h1>🚗 Veículo</h1>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-perfil">✎ Editar veículo</button>
      </div>
      <div class="grid-2">
        <div class="card">
          <b style="font-size:15px">${v.modelo ? U.esc(v.modelo) : "Meu veículo"}</b>
          <table class="tbl mt">
            <tbody>
              <tr><td class="muted">Km atual</td><td class="num">${kmAtual != null ? kmAtual.toLocaleString("pt-BR") + " km" : "—"}</td></tr>
              <tr><td class="muted">Tanque</td><td class="num">${v.tanque != null ? v.tanque + " L" : "—"}</td></tr>
              <tr><td class="muted">Pneu</td><td class="num">${v.pneu ? U.esc(v.pneu) : "—"}</td></tr>
              <tr><td class="muted">Consumo álcool</td><td class="num">${(v.consumoAlcool || cons.alcool) ? (v.consumoAlcool || cons.alcool).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : "—"}</td></tr>
              <tr><td class="muted">Consumo gasolina</td><td class="num">${(v.consumoGasolina || cons.gasolina) ? (v.consumoGasolina || cons.gasolina).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km/l" : "—"}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card stat">
          <div class="stat-label">🔧 Próxima revisão</div>
          <div class="stat-value num">${v.revisaoKm != null ? v.revisaoKm.toLocaleString("pt-BR") + " km" : "—"}</div>
          ${faltam != null ? `<div class="stat-sub">${faltam > 0
            ? `faltam <b>${faltam.toLocaleString("pt-BR")} km</b>${dataPrev ? ` · previsão ~<b>${dataPrev}</b>` : ""}`
            : `<b class="neg">vencida há ${Math.abs(faltam).toLocaleString("pt-BR")} km</b>`}</div>
            ${faltam > 0 && v.revisaoKm ? `<div class="revbar mt"><div class="revbar-fill" style="width:${Math.max(4, Math.min(100, 100 - (faltam / (v.revisaoKm >= 10000 ? 10000 : v.revisaoKm)) * 100))}%"></div></div>` : ""}`
            : `<div class="stat-sub muted">informe a km da revisão no perfil</div>`}
        </div>
      </div>
      <div class="card mt">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <b style="font-size:15px">🔧 Manutenção programada</b>
          <button class="btn-sm" id="btn-manut">+ Item</button>
        </div>
        <div id="manut-lista" class="mt"></div>
      </div>`;

    root.querySelector("#btn-perfil").addEventListener("click", abrirPerfil);
    root.querySelector("#btn-manut").addEventListener("click", () => abrirManut(null));

    const wrap = root.querySelector("#manut-lista");
    if (!manut.length) {
      wrap.innerHTML = `<p class="empty">Nenhum item de manutenção. Ex.: revisão, pneus, montagem.</p>`;
      return;
    }
    const tbl = U.el(`
      <table class="tbl">
        <thead><tr><th>Item</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = tbl.querySelector("tbody");
    for (const m of manut) {
      const tr = U.el(`
        <tr>
          <td>${U.esc(m.desc)}</td>
          <td class="num">${U.brl(m.value)}</td>
          <td>${m.done ? '<span class="chip pago">FEITO</span>' : '<span class="chip aberto">PREVISTO</span>'}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn-sm ed" title="Editar">✎</button>
            <button class="btn-sm btn-danger rm" title="Excluir">🗑</button>
          </td>
        </tr>`);
      tr.querySelector(".ed").addEventListener("click", () => abrirManut(m));
      tr.querySelector(".rm").addEventListener("click", () => {
        UI.confirmar(`Excluir "${m.desc}"?`, () => { Store.removeMaintenance(m.id); App.render(); });
      });
      tbody.appendChild(tr);
    }
    const foot = U.el(`
      <div class="cartoes-total mt">
        <span>Total previsto: <b>${U.brl(totalManut)}</b></span>
        <span>Ainda a pagar: <b class="neg">${U.brl(pendenteManut)}</b></span>
      </div>`);
    wrap.appendChild(tbl);
    wrap.appendChild(foot);
  }

  return { render };
})();
