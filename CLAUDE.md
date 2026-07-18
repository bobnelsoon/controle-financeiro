# Controle Financeiro

App web de finanças pessoais (HTML + CSS + JavaScript puro, sem framework nem build).
Interface em português (pt-BR). Roda 100% no navegador.

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
  `ViewEmprestimos`, `ViewInvestimentos`, `ViewOrcamento`, `ViewConfig`), cada uma com `render(root)`.
- `js/app.js` — `App`: roteador por hash (`#dashboard`, `#fluxo`, ...) e `boot()`.

Padrão: cada mutação chama `Store.save()`; a UI re-renderiza com `App.render()`.

## Dados e privacidade

- **O repositório NÃO contém dados pessoais.** A versão publicada define `window.SEED_VAZIO = true`
  e começa vazia. Os dados do usuário vivem apenas em: (1) `localStorage` do navegador e
  (2) um **Gist privado** do GitHub (sincronização, protegido por token pessoal — nunca acessível pelo agente).
- Backup: `Configurações → Exportar/Importar` (JSON). Para validar cálculos com dados reais,
  peça ao usuário o backup exportado e carregue via `Store.importJSON` — não há outro acesso aos dados.
- **Migração**: `Store.migrate` versiona o estado (`state.version`, atual = 5) e só **acrescenta**
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
  células do fluxo marcadas Pago/Recebido (com `settledAt`/`settledValue`) e lançamentos pix/débito
  (com `createdAt`). É recalculado a cada render (seguro para a sincronização). Reinformar o saldo
  recalibra a âncora (`at = agora`). Compras no cartão NÃO mexem no saldo até a fatura ser paga.

- **Dashboard — receitas/despesas/resultado do mês**: receitas = itens de receita do fluxo no mês +
  lançamentos avulsos positivos. Despesas = despesas fixas + avulsos negativos + **gasto do cartão
  (fatura vigente)**. O item automático `autoCartao` ("Cartão (fatura)") é **ignorado** nesse cálculo
  para não contar a fatura em dobro; o gráfico "Despesas por categoria" usa a mesma base.
  Resultado = receitas − despesas.

- **Projeção do saldo** (`Store.saldoProjecaoSerie`, usada só no dashboard): começa no
  `saldoContaAtual` e projeta do mês atual até dezembro somando `monthTotal` (itens Pago/Recebido
  contam 0). O `Store.saldoSerie` antigo (estilo planilha, acumula desde janeiro) permanece para a
  linha "Saldo acumulado" da aba Fluxo Anual.

- **Investimentos**: cada ativo tem `avgPrice` (preço médio pago); recompra recalcula média ponderada.
  Ganho/perda por ativo e a rentabilidade da carteira (`Store.carteiraRentabilidade`, em R$ e %,
  verde/vermelho) usam `avgPrice` vs cotação atual; ficam "—" enquanto o preço pago não é informado.

## Convenções de UI

- Tabelas largas rolam dentro do `.card` no mobile (media query ≤700px); tabela de investimentos usa `.tbl-wide`.
- Quadros/linhas com `data-goto` navegam para a aba (`.clickable[data-goto]` no dashboard).
- Estilo por tokens CSS em `:root` (tema claro/escuro via `prefers-color-scheme`).

## Validação (recomendado antes de commitar mudanças de cálculo)

Não há suite de testes no repo. Para validar de verdade, sirva a pasta e dirija o app num navegador
headless (Chromium/Playwright): carregue um backup real ou dados de exemplo via `Store.importJSON`,
navegue pelas abas e leia os valores computados (`Store.saldoContaAtual`, `Store.faturaTotal`, etc.),
conferindo que não há erro de JS e que os números batem.

## Branch de trabalho

Desenvolvimento nesta iteração: `claude/project-updates-2r7rf9`.
