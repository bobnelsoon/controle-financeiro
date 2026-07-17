// Gráficos SVG desenhados à mão — linha de saldo, barras horizontais, barras de orçamento
"use strict";

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---------- Gráfico de linha/área: evolução do saldo ----------
  // series: [{ym, saldo}]
  function saldoChart(container, serie) {
    container.innerHTML = "";
    if (!serie.length) { container.textContent = "Sem dados."; return; }

    const W = 720, H = 260, padL = 64, padR = 16, padT = 14, padB = 30;
    const vals = serie.map(p => p.saldo);
    let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    min -= range * 0.06; max += range * 0.06;

    const x = i => padL + (i / (serie.length - 1 || 1)) * (W - padL - padR);
    const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });

    // linhas de grade + rótulos do eixo Y (4 divisões)
    for (let i = 0; i <= 4; i++) {
      const v = min + (i / 4) * (max - min);
      const yy = y(v);
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy, class: "gridline" }));
      const t = svgEl("text", { x: padL - 8, y: yy + 4, class: "tick", "text-anchor": "end" });
      t.textContent = U.brlCurto(v);
      svg.appendChild(t);
    }
    // linha do zero destacada
    if (min < 0 && max > 0) {
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: "zeroline" }));
    }

    // rótulos do eixo X ("2026-07" = mês; "2026-07-16" = dia)
    const rotulo = p => p.ym.length === 10 ? p.ym.slice(8) + "/" + p.ym.slice(5, 7) : U.MESES_ABREV[U.ymParse(p.ym).m - 1];
    const passo = Math.max(1, Math.ceil(serie.length / 12));
    serie.forEach((p, i) => {
      if (i % passo !== 0 && i !== serie.length - 1) return;
      const t = svgEl("text", { x: x(i), y: H - 8, class: "tick", "text-anchor": "middle" });
      t.textContent = rotulo(p);
      svg.appendChild(t);
    });

    // área + linha
    let dLine = "", dArea = "M " + x(0) + " " + y(0) + " ";
    serie.forEach((p, i) => {
      dLine += (i === 0 ? "M" : "L") + " " + x(i) + " " + y(p.saldo) + " ";
      dArea += "L " + x(i) + " " + y(p.saldo) + " ";
    });
    dArea += "L " + x(serie.length - 1) + " " + y(0) + " Z";
    svg.appendChild(svgEl("path", { d: dArea, class: "area" }));
    svg.appendChild(svgEl("path", { d: dLine, class: "line", fill: "none" }));

    // crosshair + pontos de hover
    const cross = svgEl("line", { x1: 0, x2: 0, y1: padT, y2: H - padB, class: "crosshair", style: "display:none" });
    svg.appendChild(cross);
    const dot = svgEl("circle", { r: 4.5, class: "dot", style: "display:none" });
    svg.appendChild(dot);

    const tip = U.el(`<div class="tooltip" style="display:none"></div>`);
    container.style.position = "relative";
    container.appendChild(svg);
    container.appendChild(tip);

    svg.addEventListener("mousemove", ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      let idx = Math.round(((px - padL) / (W - padL - padR)) * (serie.length - 1));
      idx = Math.max(0, Math.min(serie.length - 1, idx));
      const p = serie[idx];
      cross.setAttribute("x1", x(idx)); cross.setAttribute("x2", x(idx));
      cross.style.display = ""; dot.style.display = "";
      dot.setAttribute("cx", x(idx)); dot.setAttribute("cy", y(p.saldo));
      tip.style.display = "";
      const tipLabel = p.ym.length === 10 ? U.dataBR(p.ym) : U.ymLabel(p.ym);
      tip.innerHTML = `<strong>${tipLabel}</strong><br><b class="${U.clsValor(p.saldo)}">${U.brl(p.saldo)}</b>`;
      const cx = (x(idx) / W) * r.width;
      tip.style.left = Math.min(r.width - 150, Math.max(4, cx + 10)) + "px";
      tip.style.top = ((y(p.saldo) / H) * r.height - 54) + "px";
    });
    svg.addEventListener("mouseleave", () => {
      cross.style.display = "none"; dot.style.display = "none"; tip.style.display = "none";
    });
  }

  // ---------- Barras horizontais: gastos por categoria ----------
  // rows: [{label, value}] (valores positivos)
  function barsH(container, rows) {
    container.innerHTML = "";
    if (!rows.length) { container.innerHTML = `<p class="muted">Nenhuma despesa neste mês.</p>`; return; }
    const max = Math.max(...rows.map(r => r.value));
    const wrap = U.el(`<div class="hbars"></div>`);
    for (const r of rows) {
      const pct = max ? (r.value / max) * 100 : 0;
      wrap.appendChild(U.el(`
        <div class="hbar-row" title="${U.esc(r.label)}: ${U.brl(r.value)}">
          <span class="hbar-label">${U.esc(r.label)}</span>
          <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%"></span></span>
          <span class="hbar-value">${U.brl(r.value)}</span>
        </div>`));
    }
    container.appendChild(wrap);
  }

  // ---------- Barra de progresso do orçamento ----------
  // devolve elemento; pct pode passar de 100
  function budgetBar(gasto, limite) {
    const pct = limite > 0 ? (gasto / limite) * 100 : 0;
    const nivel = pct >= 100 ? "critical" : pct >= 80 ? "warning" : "good";
    return U.el(`
      <span class="budget-track"><span class="budget-fill ${nivel}" style="width:${Math.min(100, pct)}%"></span></span>`);
  }

  return { saldoChart, barsH, budgetBar };
})();
