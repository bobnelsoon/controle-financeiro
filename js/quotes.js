// Cotações de ações e FIIs da B3 — fonte principal: mfinance (sem token, com CORS);
// reservas: brapi.dev (só alguns tickers sem token) e Yahoo Finance (pode ser barrado por CORS)
"use strict";

const Quotes = (() => {
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
    const fontes = [viaMfinance, viaBrapi, viaYahoo];
    let ultimoErro = null;
    for (const fonte of fontes) {
      try { return await fonte(ticker); } catch (e) { ultimoErro = e; }
    }
    throw ultimoErro || new Error("todas as fontes falharam");
  }

  // Busca várias em paralelo; devolve { ok: {ticker: quote}, falhas: [ticker] }
  async function fetchAll(tickers) {
    const resultados = await Promise.allSettled(tickers.map(fetchQuote));
    const ok = {}, falhas = [];
    tickers.forEach((t, i) => {
      if (resultados[i].status === "fulfilled") ok[t] = resultados[i].value;
      else falhas.push(t);
    });
    return { ok, falhas };
  }

  return { fetchQuote, fetchAll };
})();
