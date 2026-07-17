// Roteador e inicialização
"use strict";

const App = (() => {
  const rotas = {
    dashboard:  { titulo: "Dashboard",     icone: "📊", view: () => ViewDashboard },
    fluxo:      { titulo: "Fluxo Anual",   icone: "📅", view: () => ViewFluxo },
    lancamentos:{ titulo: "Lançamentos",   icone: "🧾", view: () => ViewLancamentos },
    cartoes:    { titulo: "Cartões",       icone: "💳", view: () => ViewCartoes },
    emprestimos:{ titulo: "Empréstimos",   icone: "🤝", view: () => ViewEmprestimos },
    investimentos:{ titulo: "Investimentos", icone: "📈", view: () => ViewInvestimentos },
    orcamento:  { titulo: "Orçamento",     icone: "🎯", view: () => ViewOrcamento },
    config:     { titulo: "Configurações", icone: "⚙️", view: () => ViewConfig }
  };

  function rotaAtual() {
    const h = location.hash.replace("#", "");
    return rotas[h] ? h : "dashboard";
  }

  function render() {
    const r = rotaAtual();
    document.querySelectorAll(".nav a").forEach(a => {
      a.classList.toggle("active", a.dataset.rota === r);
    });
    const root = document.getElementById("view");
    rotas[r].view().render(root);
  }

  function boot() {
    Store.load();
    const nav = document.querySelector(".nav");
    for (const [key, r] of Object.entries(rotas)) {
      nav.appendChild(U.el(`<a href="#${key}" data-rota="${key}"><span class="icon">${r.icone}</span>${r.titulo}</a>`));
    }
    window.addEventListener("hashchange", render);
    render();
    Sync.init(); // baixa alterações feitas em outro aparelho (se a sincronização estiver ativa)
  }

  return { render, boot };
})();

document.addEventListener("DOMContentLoaded", App.boot);
