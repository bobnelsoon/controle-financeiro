# Gestão Pessoal

App web de controles pessoais (HTML + CSS + JavaScript puro, sem framework nem build).
Interface em português (pt-BR). Roda 100% no navegador.

**Guarda-chuva de controles**: o app se chama **Gestão Pessoal** e agrupa vários controles selecionáveis
por um botão **"Controles"** ao lado do nome (na `.brand`). Hoje há dois: **💰 Financeiro** (o original,
completo) e **⛽ Combustível** (consumo do carro). Cada controle tem seu próprio conjunto de abas; trocar
de controle troca o menu inteiro e renderiza a primeira aba dele. A escolha fica salva em `localStorage`
(`gestao-controle-ativo`) e reabre no último controle usado. **Configurações** aparece em todos os
controles (cuida da sincronização/backup do app inteiro).

## Como executar

Site estático — basta servir a pasta e abrir `index.html`:

```
python3 -m http.server 8000   # depois abra http://localhost:8000
```

Não há passo de build, bundler, testes automatizados no repositório nem dependências npm.
Ao editar um `.js`/`.css`, incremente a querystring `?v=AAAAMMDDHHMM` em **todas** as tags
de `index.html` (cache-busting da versão publicada).

## Arquitetura

Scripts globais em IIFE, carregados em ordem no `index.html` (sem módulos ES):

- `js/utils.js` — `U`: formatação (BRL, datas), helpers de mês (`ym`, `ymAdd`, `ymParse`), DOM (`el`, `esc`).
- `js/store.js` — `Store`: estado + persistência (localStorage) + toda a lógica de cálculo e migração.
- `js/charts.js` — `Charts`: gráficos SVG à mão (linha de saldo, barras).
- `js/quotes.js` — `Quotes`: cotações de ações/FIIs (mfinance → brapi → Yahoo).
- `js/sync.js` — `Sync`: sincronização entre aparelhos via Gist privado do GitHub.
- `js/ui.js` — `UI`: modal genérico, confirmação, selects.
- `js/views/*.js` — uma view por aba (`ViewDashboard`, `ViewFluxo`, `ViewLancamentos`, `ViewCartoes`,
  `ViewEmprestimos`, `ViewInvestimentos`, `ViewOrcamento`, `ViewCombustivel`, `ViewAbastecimentos`,
  `ViewVeiculo`, `ViewConfig`), cada uma com `render(root)`. `combustivel.js` exporta **três** views
  (`ViewCombustivel` = Resumo, `ViewAbastecimentos` = lista, `ViewVeiculo` = perfil/revisão/manutenção) +
  o form compartilhado `ViewCombustivel.abrirForm(entry)` e `ViewCombustivel.abrirImportar()`.
- `js/views/inicio.js` — a **tela inicial (lançador)** `ViewInicio` (botões Financeiro / Combustível /
  Adicionar / Atualizar), o menu **`Adicionar.abrirMenu()`** (Compra no cartão / Compra parcelada /
  Abastecimento / Recebido / Pago) e **`Marcar.abrir(kind)`** (marca um item FIXO do fluxo como
  RECEBIDO/receita ou PAGO/despesa via `Store.setCell`, atualizando saldo/fluxo/dashboard).
- `js/app.js` — `App`: roteador por hash com **múltiplos controles**. `App.controles` mapeia cada controle
  (`inicio`, `financeiro`, `combustivel`) → `{ nome, icone, inicio, rotas }`. O controle `inicio` é a tela
  lançadora (sem abas — a nav fica vazia). `boot()` monta o seletor de controles + o botão **➕ Adicionar**
  na `.brand`, e **abre sempre na tela inicial** (`#inicio`). `App.trocarControle(id)` troca o controle
  inteiro. Rotas por hash (`#inicio`, `#dashboard`, `#combustivel`, ...) resolvidas no controle ativo.

Padrão: cada mutação chama `Store.save()`; a UI re-renderiza com `App.render()`.

## Dados e privacidade

- **O repositório NÃO contém dados pessoais.** A versão publicada define `window.SEED_VAZIO = true`
  e começa vazia. Os dados do usuário vivem apenas em: (1) `localStorage` do navegador e
  (2) um **Gist privado** do GitHub (sincronização, protegido por token pessoal — nunca acessível pelo agente).
- Backup: `Configurações → Exportar/Importar` (JSON). Para validar cálculos com dados reais,
  peça ao usuário o backup exportado e carregue via `Store.importJSON` — não há outro acesso aos dados.
- **Migração**: `Store.migrate` versiona o estado (`state.version`, atual = 6) e só **acrescenta**
  campos, preservando os dados existentes.

## Convenções de cálculo (decisões importantes — não quebrar)

- **Fatura do cartão = identificada pelo mês em que é PAGA.** Gasto do mês atual entra na fatura do
  **mês seguinte** (`ymAdd(ymHoje, 1)`). Por isso:
  - nova compra (Lançamentos/Cartões) já vem com a fatura do próximo mês;
  - a aba Cartões abre na **fatura vigente** (mês seguinte);
  - o dashboard mostra "fatura de <mês seguinte> (gastos de <mês atual>)".
  - `cardTx[].ym` guarda o mês de pagamento da fatura.

- **Saldo em conta é automático e determinístico** (`Store.saldoContaAtual`): parte do valor informado
  (`settings.conta = { at, valor }`) e soma o que foi realizado **depois** da âncora `at`:
  células do fluxo marcadas Pago/Recebido (com `settledAt`/`settledValue`), lançamentos pix/débito
  (com `createdAt`) **e parcelas de empréstimo marcadas PAGO** (com `settledAt`, valor `p.value`). É
  recalculado a cada render (seguro para a sincronização). Reinformar o saldo recalibra a âncora
  (`at = agora`). Compras no cartão NÃO mexem no saldo até a fatura ser paga. **Empréstimo simétrico ao
  fluxo:** marcar uma parcela como PAGO grava `settledAt` e joga `p.value` no saldo — assim o valor sai
  do "a receber" e entra no saldo automaticamente, sem lançamento manual.

- **Resultado do mês — FONTE ÚNICA `Store.monthTotal(ym)`** (usada pelo Dashboard **e** pelo Fluxo
  Anual, para as duas telas baterem): Σ `projectedValue` dos itens do fluxo (itens Pago/Recebido contam
  **0**, então mês todo quitado → Resultado 0). No **Dashboard**, os quadros **Resultado** e **Acumulado**
  olham para o **PRÓXIMO mês** (`ymFatura = ymAdd(ymHoje,1)`), porque o mês atual costuma já estar
  quitado (Resultado 0) e a compra do cartão do mês só vira fatura no mês seguinte — assim os números
  acompanham as Despesas/Cartão, que também mostram a fatura vigente. Os cards **Receitas/Despesas do
  mês** do topo continuam informativos do **mês atual** em valores cheios (`plannedValue` + avulsos +
  `faturaTotal(ymFatura)` como despesa). ⚠️ A função antiga `Store.resultadoMes` (valores cheios +
  fatura) foi **removida**; não recriar.

- **Acumulado (Dashboard) = saldo previsto na conta no FIM do PRÓXIMO mês**, não `saldo + resultado`.
  É `saldoProjecaoSerie().find(p => p.ym === ymFatura).saldo`: parte do `saldoContaAtual` e soma **só o
  que ainda falta** (itens já Pagos/Recebidos contam 0, pois já estão embutidos no saldo). **Decisão
  importante:** `saldo + resultado` contava em dobro os itens já quitados. Com o mês todo quitado, o
  Acumulado tende ao próprio saldo. "Resultado" e "Acumulado" medem coisas diferentes e **não** se
  somam ("como foi o mês" vs "quanto vou ter na conta").

- **Compras parceladas no cartão**: cada parcela é um `cardTx` separado (um por mês, `desc` com sufixo
  ` NN/MM`). Parcelas novas compartilham um `groupId`. Excluir uma parcela oferece **"Excluir todas as
  N parcelas"** (remove de todos os meses) ou "Só esta"; `Store.cardTxParcelas(tx)` acha as irmãs por
  `groupId` ou, no fallback (compras antigas sem groupId), pela descrição base + mesmo cartão.

- **Projeção do saldo** (`Store.saldoProjecaoSerie`): começa no `saldoContaAtual` e projeta do mês atual
  até dezembro somando `monthTotal` (usa `projectedValue`: itens Pago/Recebido contam 0). Alimenta o
  gráfico do dashboard, o "Saldo projetado (Dez)", o "Acumulado do mês" (`[0]`) e, via
  `Store.saldoAcumuladoSerie(ano)`, a linha **"Saldo acumulado" do Fluxo Anual** (mesma projeção; meses
  já realizados ficam em branco; sem saldo informado cai no `saldoSerie` antigo estilo planilha).
  O `Store.saldoSerie` (acumula desde janeiro) só é usado nesse fallback e em `saldoAcumuladoAte`.

- **Investimentos**: cada ativo tem `avgPrice` (preço médio pago); recompra recalcula média ponderada.
  Ganho/perda por ativo e a rentabilidade da carteira (`Store.carteiraRentabilidade`, em R$ e %,
  verde/vermelho) usam `avgPrice` vs cotação atual; ficam "—" enquanto o preço pago não é informado.
  A aba tem **📥 Importar** (`ViewInvestimentos.abrirImportar`): cola JSON — lista de ativos
  `[{ticker, type, qty, avgPrice}]` ou objeto `{assets, fixed}` (renda fixa junto). Atualiza pelo ticker
  (sobrescreve qtd/preço médio) ou adiciona; `type` explícito ou heurística (`/11$/` → fii).
  No Dashboard, a seção de investimentos (rodapé, `grid-2`) tem o quadro **Carteira de investimentos**
  (patrimônio, rentabilidade, aportes do ano, nº de ativos) e **Composição da carteira** (Ações / FIIs /
  Renda fixa em R$ e %, barras proporcionais ao total). O antigo gráfico "Despesas por categoria" e o KPI
  "Patrimônio investido" do topo foram removidos (`Store.despesasPorCategoria`/`catName` seguem no store,
  sem uso no dashboard).

- **Combustível (controle ⛽)**: dados em `state.fuel.entries` (entram na sincronização/backup, migração v6).
  Cada registro: `{ id, date, odometer (km), liters, pricePerLiter, total, fuelType (gasolina|alcool|diesel|gnv),
  local, toll (pedágio), obs, full (tanque cheio) }`. Registros **só de pedágio** (viagem sem abastecer) têm
  `liters` null e guardam só o `toll`. Se o form recebe só um de `pricePerLiter`/`total`, o outro é derivado.
  **Consumo (km/l) = tanque cheio → tanque cheio** (`Store.fuelEntriesComputed`): acumula os litros desde o
  último tanque cheio (somando parciais) e no próximo cheio faz `kmL = (odo − odoÚltimoCheio) / litrosDoIntervalo`;
  não calcula em intervalos que **misturam combustíveis** (ex.: transição gasolina→álcool) nem em parciais.
  `custoKm = pagoNoIntervalo / dist`. **Pedágio é separado** (informativo): NÃO entra no gasto de combustível
  nos KPIs; `fuelStats` devolve `tollMes`/`tollTotal` à parte. `Store.fuelStats(ym)` dá consumo médio/último
  (blended entre combustíveis), custo/km, gasto do mês (só combustível), preço médio do litro, km do mês, pedágio.
  Aba **Resumo** (`ViewCombustivel`) = KPIs + últimos abastecimentos; aba **Abastecimentos** (`ViewAbastecimentos`)
  = lista completa (com local/obs/pedágio) + **📥 Importar** (`ViewCombustivel.abrirImportar`): aceita uma
  **lista** de abastecimentos (`date, km, fuel, local, liters, price, paid, toll, obs`) **ou** um **objeto
  completo** `{ vehicle, maintenance, entries }` (carrega perfil do veículo + manutenção + abastecimentos de
  uma vez; nomes de campo flexíveis). `Store.addFuelMany`/`clearFuel`/`setFuelVehicle`/`addMaintenance`/`clearMaintenance`. Import marca como
  **parcial** o que a obs indica (parcial/mínimo/reforço) **ou** dois abastecimentos no mesmo hodômetro (não
  fecham tanque). **Nunca versionar dados reais do usuário** — a importação roda só no navegador dele
  (nem placeholders de exemplo no código podem conter dados reais do usuário).
  - **Aba Veículo** (`ViewVeiculo`): `state.fuel.vehicle` = `{ modelo, tanque, pneu, revisaoKm, consumoAlcool,
    consumoGasolina }` (init idempotente no `migrate`, sem bump de versão) e `state.fuel.maintenance` =
    `[{ id, desc, value, done }]`. **Km atual** = `Store.fuelKmAtual()` (maior hodômetro). **Contador de
    revisão**: `revisaoKm − kmAtual` + previsão de data por `Store.fuelPaceKmDia()` (km/dia entre 1º e último
    registro). **Manutenção**: total previsto e "ainda a pagar" (itens não `done`).
  - **Comparador álcool/gasolina** (card no Resumo): usa `Store.fuelConsumoPorFuel()` (consumo real por
    combustível, dos intervalos válidos) — ou o consumo do perfil, senão fallback 11 / 17,4. Custo/km =
    preço ÷ consumo; **ponto de virada** = `precoGasolina × (consumoAlcool / consumoGasolina)`. Pré-preenche
    com `Store.fuelUltimoPreco(fuel)`.
  - **Dashboard (1ª aba)**: além dos KPIs, tem o card **Previsão para <próximo mês>** (`Store.fuelPrevisaoProxMes`:
    combustível = ritmo km/dia ÷ consumo médio × preço recente do litro; pedágio = média dos meses fechados,
    descartando o 1º se for parcial) e o gráfico **Gasto por mês** (`Store.fuelGastoPorMes` via `Charts.barsH`,
    com a barra da previsão).
  - **Pagamento no cartão** (integração com o Financeiro): o form de abastecimento tem **Forma de pagamento**
    (— não lançar — / 💳 Cartão). No cartão, cria um `cardTx` (fatura = mês do abastecimento **+ 1**) e vincula
    por `entry.linkCardTxId` (+ `payment: "cartao"`, `cardId`). **Editar** o abastecimento remove o `cardTx`
    antigo e recria; **excluir** remove o `cardTx`. A **importação NÃO cria** lançamentos (é histórico) e o
    **pedágio fica de fora** da integração. Só cartão por enquanto (pix/dinheiro não foram pedidos).

## Convenções de UI

- **Abre sempre na tela inicial (lançador)**: `App.boot` força `controleAtivo = "inicio"` e `#inicio`
  (decisão do usuário). De lá o usuário entra num controle (`trocarControle` → 1ª aba dele) ou usa Adicionar.
- **Seletor de controles + Adicionar** (`.brand`): botão "Controles ▾" abre `.ctrl-menu` (🏠 Início /
  💰 Financeiro / ⛽ Combustível; o ativo recebe `.ativo`) e o botão **➕ Adicionar** (`Adicionar.abrirMenu`)
  fica logo abaixo, disponível em qualquer tela. Fecha ao clicar fora. **No mobile**: a `.brand` vira linha,
  a marca vira **só o ícone 💼** (`.brand-txt` escondido) e o **Adicionar do topo some** (`.brand .add-btn`
  display:none) — sobra espaço para as abas rolarem. O Adicionar no mobile fica pelo **FAB flutuante** `➕`
  (`.fab-add`, criado uma vez no `boot`, canto inferior direito, só no mobile via media query, escondido na
  tela inicial) que abre o mesmo menu. No desktop, o botão Adicionar continua na sidebar (sem FAB).
- **Integração pelo Adicionar**: um lançamento atualiza os dois controles — Compra → `ViewCartoes.abrirNovaCompra`
  (cartão + parcelas); Abastecimento → `ViewCombustivel.abrirForm` (pode cair no cartão); Recebido/Pago →
  `Marcar.abrir` marca item fixo do fluxo (setCell com status), mexendo no saldo/fluxo/dashboard.
- Tabelas largas rolam dentro do `.card` no mobile (media query ≤700px); tabela de investimentos usa `.tbl-wide`.
- Quadros/linhas com `data-goto` navegam para a aba (`.clickable[data-goto]` no dashboard).
- Estilo por tokens CSS em `:root` (tema claro/escuro via `prefers-color-scheme`).
- **Safe areas (iPhone com notch/Dynamic Island)**: `index.html` usa `viewport-fit=cover` + metas de web
  app (add-to-home-screen) e `theme-color` claro/escuro. Menu do topo (`.sidebar`), conteúdo (`.main`) e
  o `.overlay` do modal aplicam `env(safe-area-inset-*)` (com `max()`/`calc()` preservando o padding
  base) para não ficarem sob a ilha nem a barra de gesto. Validado a 440×956 (iPhone 17 Pro Max): sem
  overflow horizontal, cards em 2 colunas.

## Validação (recomendado antes de commitar mudanças de cálculo)

Não há suite de testes no repo. Para validar de verdade, sirva a pasta e dirija o app num navegador
headless (Chromium/Playwright): carregue um backup real ou dados de exemplo via `Store.importJSON`,
navegue pelas abas e leia os valores computados (`Store.saldoContaAtual`, `Store.faturaTotal`, etc.),
conferindo que não há erro de JS e que os números batem.

## Branch de trabalho

Desenvolvimento nesta iteração: `claude/project-updates-2r7rf9`.
Fluxo de publicação: commitar na branch → abrir PR para `main` → **merge** (o app é publicado
automaticamente pelo GitHub Pages a partir da `main`, sem workflow de build). URL pública:
`https://bobnelsoon.github.io/controle-financeiro/` (o agente não consegue abrir esse link — a rede
do ambiente bloqueia `github.io`; a publicação em si é automática do lado do GitHub).

## Onde paramos (para continuar amanhã)

**PUBLICADO**: a `v19` / cache `202607192000` foi para a `main` (PR → merge) e está no ar pelo GitHub Pages.
O app virou **Gestão Pessoal** (guarda-chuva de controles: 💰 Financeiro + ⛽ Combustível) com tela inicial
lançadora. O usuário vai validar o funcionamento online. Próximas melhorias entram na mesma branch
`claude/project-updates-2r7rf9` (reiniciada a partir da `main` após o merge) → novo PR → merge.

No ar (v19), validado em headless com os dados reais do usuário (**nada de dado real foi versionado**):
- **Tela inicial (lançador)** `ViewInicio`: o app **abre sempre nela** com 4 botões — Financeiro, Combustível,
  ➕ Adicionar, 🔄 Atualizar. O botão **➕ Adicionar** também fica na `.brand` (sempre acessível) e abre o menu
  Compra / Compra parcelada / Abastecimento / Recebido / Pago, integrando os dois controles (ver convenções).
- **Gestão Pessoal** + **seletor de Controles** na `.brand` (botão "Controles ▾" → 🏠 Início / 💰 Financeiro /
  ⛽ Combustível). Troca o controle inteiro (nav + view), salva a escolha em `localStorage`. Configurações
  aparece nos dois controles.
- **Controle de Combustível** (`state.fuel`, migração v6): abas **Resumo** (KPIs de consumo/custo + comparador
  álcool×gasolina + últimos), **Abastecimentos** (lista completa + 📥 Importar JSON) e **Veículo** (perfil +
  contador de revisão + manutenção programada). Consumo **tanque cheio → tanque cheio**; **pedágio separado**
  (informativo). Ver a seção "Combustível (controle ⛽)" nas convenções de cálculo.
- O usuário tem um **histórico real de combustível** (veículo flex, rota fixa entre duas cidades, transição
  gasolina→álcool, dezenas de abastecimentos). Foi usado só para **validar localmente** (scratchpad da sessão,
  não versionado); consumo real bate com os cálculos (álcool compensa no uso dele). **Os dados reais NUNCA vão
  ao repositório** — vivem só no aparelho/Gist do usuário. Para revalidar, pedir o histórico de novo.

Ideias que ficaram na mesa para o Combustível (usuário vai escolher): custo por viagem (trecho + pedágio),
gráfico do preço do litro no tempo, KPI de consumo separado por combustível, alerta de revisão mais visível,
metas/orçamento de combustível por mês.

No ar (v18) e estável no controle Financeiro:
- **Empréstimo simétrico ao fluxo**: marcar parcela como PAGO grava `settledAt` e o valor cai no
  `saldoContaAtual` (sai do "a receber", entra no saldo — sem lançamento manual).
- **Cards Receitas/Despesas do mês** (topo, informativos do mês atual): separados **pelo sinal** do
  lançamento — positivo → Receitas, negativo → Despesas (não se misturam; positivo NÃO abate despesa).
  Ambos com subtítulo ("fixas + lançamentos" / "fixas + lançamentos + fatura do cartão").
- **Card Receitas tem 2 valores** (`.stat-duplo`): "Receitas do mês" (valor principal, informativo do
  mês atual) e **"Disponível em <mês seguinte>"** (valor secundário, fonte menor). **Disponível =
  Saldo em conta + tudo a receber no PRÓXIMO mês** (`ymFatura`): Σ `projectedValue > 0` dos flowItems +
  parcelas de empréstimo ABERTO que vencem no próximo mês. Olha o mês seguinte de propósito (usuário
  trabalha um mês à frente, igual à fatura/Resultado/Acumulado). Só conta o que ainda falta receber
  (recebidos e lançamentos já estão no saldo → não conta em dobro; estável ao receber). Só aparece se o
  saldo foi informado. Botão **"Compra no cartão"** no card **Saldo em conta** (largura total, ancorado
  na base via flex-column) abre `ViewCartoes.abrirNovaCompra` — lançar compra sem ir na aba Cartões.
- **Dashboard**: seção de investimentos no rodapé (**Carteira de investimentos** + **Composição da
  carteira**); saiu o gráfico "Despesas por categoria" e o KPI "Patrimônio investido" do topo.
- **iPhone / safe areas** (v12): `viewport-fit=cover`, metas de web app, `theme-color`,
  `env(safe-area-inset-*)` no menu/conteúdo/modal. Validado a 440×956 (iPhone 17 Pro Max).
- **Abre sempre no Dashboard** (`App.boot` força `#dashboard` via `history.replaceState`).
- **Excluir compra parcelada** com opção "Excluir todas as N parcelas" (`groupId` nas novas + fallback
  por descrição nas antigas: `Store.cardTxParcelas` / `removeCardTxIds`).
- Resultado/Acumulado do Dashboard olham o **próximo mês** (fonte única `Store.monthTotal` /
  `saldoProjecaoSerie`; Fluxo e Dashboard batem). Botão **Limpar** no editor de célula do Fluxo.
- Saldo em conta automático; fatura do cartão sempre um mês à frente; investimentos com preço pago,
  ganho/perda e rentabilidade.

Pontos de atenção conhecidos:
- **Próximos vencimentos** juntam `flowItems` (com `dueDay`) **e** parcelas de `loans` — sem vínculo
  entre eles; cadastrar a mesma coisa nos dois lugares duplica (é dado do usuário; o agente não acessa).
- **Cache do `index.html`**: o `index.html` não tem `?v=`, então o navegador/CDN pode servir um HTML em
  cache apontando pros assets antigos → parece que "não subiu". Solução do usuário: recarregar forte ou
  abrir com `?v=13` no fim da URL. Melhoria futura possível: fazer o HTML recarregar assets sozinho.

Testes headless ficam no **scratchpad da sessão** (não versionado): `build.mjs` gera `preview-demo.html`
com dados fake + `window.Store/App/U`; `test*.mjs` dirigem via Playwright servindo por
`python3 -m http.server 8199` (Chromium em `/opt/pw-browsers/...`). `build.mjs` já inclui `<meta charset>`
e `<meta viewport>` no preview. Nunca subir dados reais do usuário ao repo nem a artifacts públicos.
