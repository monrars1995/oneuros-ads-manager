# Relatórios

## Princípios

- **Números da fonte:** a tabela vem do `neuro-ads-manager relatorio` (snapshot ou CSV); o texto cita só o que está nas tabelas.
- **Declarar sempre:** período, fuso, moeda, fonte (Marketing API e versão, ou CSV), janela de atribuição.
- **Comparar** com o período anterior de mesmo tamanho (`--comparar` no snapshot).
- **Conciliar:** a soma das campanhas bate com a conta. Se não bater (atribuição, fuso, filtro de ativos), diga por quê.
- **Não somar o incompatível** (seção 2 da skill).
- **Imutável:** cada rodada é um arquivo novo com data no nome.
- **Sem IDs nem dados pessoais.**

## Estrutura (modelo em `templates/relatorio.md`)

1. Cabeçalho (período, fuso, moeda, fonte, janela).
2. **Leitura executiva:** 3–5 linhas para quem só lê isso: o que aconteceu, por quê, o que vamos fazer.
3. Indicadores com comparação: investimento, resultado (pelo nome do perfil), custo por resultado e alvo, valor e ROAS (quando houver), impressões, alcance, frequência, cliques no link, CTR, CPC, CPM, taxa clique → resultado.
4. Por campanha.
5. Melhores e piores anúncios (gasto mínimo para entrar: o CPR alvo).
6. Funil do CRM, quando o usuário trouxer: leads → qualificados → agenda → venda, custo por etapa (MQL, SQL e agenda não se somam).
7. O que foi feito no período (planos executados, com a pasta da operação).
8. **Próximas ações:** prioridade, responsável, prazo, como medir.
9. Cobertura e limitações.
10. Rodapé: autoria e versão do plugin.

## Cadência

| Ritmo | O quê | Comando |
|---|---|---|
| Diário | alertas (pausar, congelar, escalar; limite de gasto; conta) | `alertas` |
| D+3 | leitura sem veredito depois de lançar | `relatorio --periodo 3d` |
| D+7 | poda ou escala | `relatorio --periodo 7d` + `alertas` |
| Semanal | desempenho e criativos | `relatorio --periodo 7d` (com `--comparar` no snapshot) |
| Mensal | estratégia, verba, funil do CRM | `relatorio --periodo mes-passado` |
| Janela fechada | auditoria Meta × CRM (2 a 4 semanas) | `auditar` + `relatorio` |

## Leitura (o que o agente escreve)

- O que explica os números: criativo (fadiga, conceito novo), público (saturação, exclusões), oferta (vigência, sazonalidade), mensuração (evento quebrado, mudança de janela), mudanças feitas no período.
- O que mudou em relação ao relatório anterior e se as ações anteriores funcionaram.
- Ações concretas, cada uma com métrica de sucesso. O que mexe na conta vira plano de mudança.
