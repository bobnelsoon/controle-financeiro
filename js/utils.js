// Utilitários gerais — formatação, datas, DOM
"use strict";

const U = {
  MESES: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
  MESES_ABREV: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],

  _brl: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),

  brl(v) {
    if (v == null || isNaN(v)) return "—";
    return U._brl.format(v);
  },

  // Formato curto para eixos de gráfico: R$ 12,5 mil
  brlCurto(v) {
    const abs = Math.abs(v);
    const sinal = v < 0 ? "-" : "";
    if (abs >= 1000) return sinal + "R$ " + (abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return sinal + "R$ " + abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  },

  // Aceita "1.234,56", "1234.56", "R$ 1.234,56", "-500"
  parseMoney(txt) {
    if (typeof txt === "number") return txt;
    if (!txt) return null;
    let s = String(txt).replace(/[R$\s]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  // "2026-08" helpers
  ym(year, month1a12) { return year + "-" + String(month1a12).padStart(2, "0"); },
  ymParse(s) { const [y, m] = s.split("-").map(Number); return { y, m }; },
  ymAdd(s, n) {
    const { y, m } = U.ymParse(s);
    const total = y * 12 + (m - 1) + n;
    return U.ym(Math.floor(total / 12), (total % 12) + 1);
  },
  ymCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; },
  ymHoje() { const d = new Date(); return U.ym(d.getFullYear(), d.getMonth() + 1); },
  ymLabel(s) { const { y, m } = U.ymParse(s); return U.MESES_ABREV[m - 1] + "/" + String(y).slice(2); },

  dataBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  },

  hojeISO() { return new Date().toISOString().slice(0, 10); },

  // Último dia útil do mês (sábado/domingo voltam para sexta; feriados não são considerados)
  ultimoDiaUtil(ano, mes1a12) {
    const d = new Date(ano, mes1a12, 0); // último dia do mês
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.getDate();
  },

  // Resolve o dia de vencimento de um item ('ultimo' = último dia útil)
  diaVencimento(dueDay, ano, mes1a12) {
    if (dueDay == null || dueDay === "") return null;
    if (dueDay === "ultimo") return U.ultimoDiaUtil(ano, mes1a12);
    return Number(dueDay);
  },

  labelVencimento(dueDay) {
    if (dueDay == null || dueDay === "") return "";
    if (dueDay === "ultimo") return "último dia útil";
    return "dia " + dueDay;
  },

  id() {
    return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  },

  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  // Classe de cor por sinal
  clsValor(v) { return v == null ? "" : v < 0 ? "neg" : v > 0 ? "pos" : ""; }
};
