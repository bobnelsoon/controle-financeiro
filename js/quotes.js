// Cotações de ações e FIIs da B3 — fonte principal: HG Brasil (chave exposta, restrita ao domínio
// bobnelsoon.github.io); reservas: mfinance, brapi.dev e Yahoo Finance. Dividendos: mfinance (histórico).
"use strict";

const Quotes = (() => {
  // Chave "exposta" do HG Brasil, restrita ao domínio publicado (bobnelsoon.github.io). Por ser
  // do tipo browser + domain-locked, pode ficar no código (só funciona a partir do site do usuário).
  const HG_KEY = "c0f5c4be";

  // HG Brasil aceita vários símbolos numa chamada só (economiza consultas da cota).
  async function viaHGMany(tickers) {
    if (!tickers.length) return {};
    const url = `https://api.hgbrasil.com/finance/stock_price?key=${HG_KEY}&symbol=${encodeURIComponent(tickers.join(","))}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const results = j && j.results;
    const out = {};
    if (results) {
      for (const t of tickers) {
        const q = results[t] || results[t.toUpperCase()];
        if (q && q.price != null && !q.error) {
          const chg = Number(q.change_percent);
          const prevClose = (!isNaN(chg) && (1 + chg / 100) !== 0) ? q.price / (1 + chg / 100) : q.price;
          out[t] = { price: q.price, prevClose, name: q.name || t, updatedAt: Date.now() };
        }
      }
    }
    return out;
  }

  async function viaHG(ticker) {
    const m = await viaHGMany([ticker]);
    if (m[ticker]) return m[ticker];
    throw new Error("sem dados");
  }
  // mfinance tem endpoints separados para FIIs e ações — tenta os dois
  async function viaMfinance(ticker) {
    const bases = ticker.match(/11B?$/) // FIIs geralmente terminam em 11
      ? ["fiis", "stocks"]
      : ["stocks", "fiis"];
    let ultimoErro = null;
    for (const base of bases) {
      try {
        const r = await fetch(`https://mfinance.com.br/api/v1/${base}/${encodeURIComponent(ticker)}`);
        if (!r.ok) { ultimoErro = new Error("HTTP " + r.status); continue; }
        const j = await r.json();
        if (j && j.lastPrice) {
          return {
            price: j.lastPrice,
            prevClose: j.closingPrice != null ? j.closingPrice : j.lastPrice,
            name: j.name || ticker,
            updatedAt: Date.now()
          };
        }
        ultimoErro = new Error("sem dados");
      } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("sem dados");
  }

  async function viaBrapi(ticker) {
    const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const q = j.results && j.results[0];
    if (!q || q.regularMarketPrice == null) throw new Error("sem dados");
    return {
      price: q.regularMarketPrice,
      prevClose: q.regularMarketPreviousClose != null ? q.regularMarketPreviousClose : q.regularMarketPrice,
      name: q.longName || q.shortName || ticker,
      updatedAt: Date.now()
    };
  }

  async function viaYahoo(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?interval=1d&range=1d`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.meta || res.meta.regularMarketPrice == null) throw new Error("sem dados");
    const m = res.meta;
    return {
      price: m.regularMarketPrice,
      prevClose: m.previousClose != null ? m.previousClose : m.chartPreviousClose,
      name: m.longName || m.shortName || ticker,
      updatedAt: Date.now()
    };
  }

  async function fetchQuote(ticker) {
    const fontes = [viaHG, viaMfinance, viaBrapi, viaYahoo];
    let ultimoErro = null;
    for (const fonte of fontes) {
      try { return await fonte(ticker); } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("todas as fontes falharam");
  }

  // Só as fontes reserva (sem HG) — usadas para o que o HG não trouxe na chamada em lote.
  async function fetchQuoteReserva(ticker) {
    for (const fonte of [viaMfinance, viaBrapi, viaYahoo]) {
      try { return await fonte(ticker); } catch (e) {}
    }
    throw new Error("todas as reservas falharam");
  }

  // Busca várias; devolve { ok: {ticker: quote}, falhas: [ticker] }. Tenta o HG numa chamada só
  // (economiza cota) e cai nas reservas apenas para os que faltarem.
  async function fetchAll(tickers) {
    const ok = {};
    try { Object.assign(ok, await viaHGMany(tickers)); } catch (e) { /* segue pros fallbacks */ }
    const restantes = tickers.filter(t => !ok[t]);
    const falhas = [];
    if (restantes.length) {
      const res = await Promise.allSettled(restantes.map(fetchQuoteReserva));
      restantes.forEach((t, i) => {
        if (res[i].status === "fulfilled") ok[t] = res[i].value;
        else falhas.push(t);
      });
    }
    return { ok, falhas };
  }

  // Histórico de dividendos por cota (mfinance): devolve { list: [{value, payDate}] } com TODOS os
  // pagamentos (últimos ~48). FIIs em /fiis/dividends, ações em /stocks/dividends.
  async function fetchDividend(ticker) {
    const bases = ticker.match(/11B?$/) ? ["fiis", "stocks"] : ["stocks", "fiis"];
    let ultimoErro = null;
    for (const base of bases) {
      try {
        const r = await fetch(`https://mfinance.com.br/api/v1/${base}/dividends/${encodeURIComponent(ticker)}`);
        if (!r.ok) { ultimoErro = new Error("HTTP " + r.status); continue; }
        const j = await r.json();
        const arr = j && j.dividends;
        if (Array.isArray(arr) && arr.length) {
          const list = arr
            .filter(x => x.value != null && (x.payDate || x.declaredDate))
            .map(x => ({ value: x.value, payDate: (x.payDate || x.declaredDate).slice(0, 10) }))
            .sort((a, b) => (a.payDate < b.payDate ? -1 : 1))
            .slice(-48); // no máximo ~4 anos, para não inflar o backup
          if (list.length) return { list, updatedAt: Date.now() };
        }
        ultimoErro = new Error("sem dividendos");
      } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("sem dividendos");
  }

  async function fetchDividendsAll(tickers) {
    const resultados = await Promise.allSettled(tickers.map(fetchDividend));
    const ok = {}, falhas = [];
    tickers.forEach((t, i) => {
      if (resultados[i].status === "fulfilled") ok[t] = resultados[i].value;
      else falhas.push(t);
    });
    return { ok, falhas };
  }

  return { fetchQuote, fetchAll, fetchDividend, fetchDividendsAll };
})();
