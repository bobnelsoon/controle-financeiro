// Roteador e inicialização — app "Gestão Pessoal" com múltiplos controles
"use strict";

const App = (() => {
  // Cada controle tem seu próprio conjunto de abas. "Configurações" aparece em todos
  // (cuida de sincronização/backup do app inteiro).
  const rotaConfig = { titulo: "Configurações", icone: "⚙️", view: () => ViewConfig };

  const controles = {
    inicio: {
      nome: "Início", icone: "🏠", inicio: "inicio",
      rotas: { inicio: { titulo: "Início", icone: "🏠", view: () => ViewInicio } }
    },
    financeiro: {
      nome: "Financeiro", icone: "💰", inicio: "dashboard",
      rotas: {
        dashboard:    { titulo: "Dashboard",     icone: "📊", view: () => ViewDashboard },
        fluxo:        { titulo: "Fluxo Anual",   icone: "📅", view: () => ViewFluxo },
        lancamentos:  { titulo: "Lançamentos",   icone: "🧾", view: () => ViewLancamentos },
        cartoes:      { titulo: "Cartões",       icone: "💳", view: () => ViewCartoes },
        emprestimos:  { titulo: "Empréstimos",   icone: "🤝", view: () => ViewEmprestimos },
        investimentos:{ titulo: "Investimentos", icone: "📈", view: () => ViewInvestimentos },
        orcamento:    { titulo: "Orçamento",     icone: "🎯", view: () => ViewOrcamento },
        config:       rotaConfig
      }
    },
    combustivel: {
      nome: "Combustível", icone: "⛽", inicio: "combustivel",
      rotas: {
        combustivel:    { titulo: "Dashboard",      icone: "📊", view: () => ViewCombustivel },
        abastecimentos: { titulo: "Abastecimentos", icone: "🧾", view: () => ViewAbastecimentos },
        veiculo:        { titulo: "Veículo",        icone: "🚗", view: () => ViewVeiculo },
        config:         rotaConfig
      }
    }
  };

  const CTRL_KEY = "gestao-controle-ativo";
  let controleAtivo = null;

  function ctrl() { return controles[controleAtivo] || controles.financeiro; }

  function rotaAtual() {
    const h = location.hash.replace("#", "");
    return ctrl().rotas[h] ? h : ctrl().inicio;
  }

  function render() {
    const r = rotaAtual();
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.rota === r));
    const root = document.getElementById("view");
    ctrl().rotas[r].view().render(root);
  }

  function montarNav() {
    const nav = document.querySelector(".nav");
    nav.innerHTML = "";
    // A tela inicial não mostra abas (é só o lançador).
    if (controleAtivo !== "inicio") {
      for (const [key, r] of Object.entries(ctrl().rotas)) {
        nav.appendChild(U.el(`<a href="#${key}" data-rota="${key}"><span class="icon">${r.icone}</span>${r.titulo}</a>`));
      }
    }
    // Marca o controle ativo no menu de controles
    document.querySelectorAll(".ctrl-menu [data-ctrl]").forEach(b =>
      b.classList.toggle("ativo", b.dataset.ctrl === controleAtivo));
    // O FAB do Adicionar some na tela inicial (que já tem o botão grande).
    const fab = document.getElementById("fab-add");
    if (fab) fab.hidden = (controleAtivo === "inicio");
  }

  function trocarControle(id) {
    if (!controles[id]) return;
    controleAtivo = id;
    localStorage.setItem(CTRL_KEY, id);
    fecharMenuControles();
    montarNav();
    history.replaceState(null, "", "#" + ctrl().inicio);
    render();
  }

  function fecharMenuControles() {
    const menu = document.getElementById("ctrl-menu");
    if (menu) menu.hidden = true;
  }

  function montarSeletorControles() {
    const brand = document.querySelector(".brand");
    brand.innerHTML = `
      <span class="brand-nome">💼 Gestão Pessoal</span>
      <div class="ctrl-switch">
        <button class="ctrl-btn" id="btn-controles" aria-haspopup="true">Controles ▾</button>
        <div class="ctrl-menu" id="ctrl-menu" hidden>
          ${Object.entries(controles).map(([id, c]) =>
            `<button type="button" data-ctrl="${id}">${c.icone} ${c.nome}</button>`).join("")}
        </div>
      </div>
      <button class="add-btn" id="btn-adicionar">➕ Adicionar</button>`;

    const btn = brand.querySelector("#btn-controles");
    const menu = brand.querySelector("#ctrl-menu");
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    menu.querySelectorAll("[data-ctrl]").forEach(b =>
      b.addEventListener("click", () => trocarControle(b.dataset.ctrl)));
    brand.querySelector("#btn-adicionar").addEventListener("click", () => {
      if (typeof Adicionar !== "undefined") Adicionar.abrirMenu();
    });

    // Botão flutuante (FAB) do Adicionar — criado uma vez, sempre à mão no mobile.
    if (!document.getElementById("fab-add")) {
      const fab = U.el(`<button class="fab-add" id="fab-add" title="Adicionar" aria-label="Adicionar">＋</button>`);
      fab.addEventListener("click", () => { if (typeof Adicionar !== "undefined") Adicionar.abrirMenu(); });
      document.body.appendChild(fab);
    }
    // fecha ao clicar fora
    document.addEventListener("click", (e) => {
      if (menu && !menu.hidden && !brand.contains(e.target)) menu.hidden = true;
    });
  }

  function boot() {
    Store.load();
    // Abre sempre na tela inicial (lançador), conforme escolhido pelo usuário.
    controleAtivo = "inicio";

    montarSeletorControles();
    montarNav();
    window.addEventListener("hashchange", render);
    history.replaceState(null, "", "#inicio");
    render();
    Sync.init(); // baixa alterações feitas em outro aparelho (se a sincronização estiver ativa)
  }

  return { render, boot, trocarControle };
})();

document.addEventListener("DOMContentLoaded", App.boot);
