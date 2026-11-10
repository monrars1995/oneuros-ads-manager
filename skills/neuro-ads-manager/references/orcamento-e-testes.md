# Orçamento, lances e testes

## Economia antes da verba

- **CPR máximo** = ticket × margem × taxa de fechamento do funil (lead → qualificado → venda). Sem os números do cliente, marque como hipótese.
- **Verba mínima por conjunto:** CPA alvo × 50 ÷ 7 por dia (regra prática para o aprendizado).
- **Teto mensal** aprovado no perfil (`orcamento.mensal`) e o ritmo diário conferido nos alertas.

## Regras de decisão (do perfil)

`regras_decisao` no perfil; o `neuro-ads-manager alertas` aplica e lista candidatos. Nada é automático.

| Regra | Exemplo fictício (perfil de leads) | Padrão |
|---|---|---|
| Pausar anúncio | CPL > 1,5 × o alvo depois de gastar 2 × o alvo | definir com o cliente |
| Congelar verba | frequência > 2,5 | frequência > 3,5 |
| Escalar | CPL ≤ 0,7 × o alvo por 3 dias; +20% | +20% a cada 72 h |
| Alerta geral | CPL da conta acima do alvo; muitos contatos sem origem | — |
| Campeão | definido pelo evento qualificado, não pelo CPL | idem |

## Escala e realocação

- **Reduzir antes de aumentar.** Em realocação, a soma fica constante (declare `orcamento_soma_constante` no plano).
- **No máximo +20% a cada 72 h** por conjunto (o perfil pode permitir até +30%). Aumento grande reinicia o aprendizado.
- **Escala horizontal** (novo conjunto com o campeão) quando o vertical estagna.
- **Limite de gasto da conta e conta pré-paga:** o alerta avisa a partir de 85% do limite. Mexer em `spend_cap` ou cobrança exige aprovação específica.

## Lances

- **Menor custo sem limite** (`LOWEST_COST_WITHOUT_CAP`): padrão.
- **Limite de custo / meta de CPA:** só com histórico estável e evento frequente; com meta apertada a entrega cai.
- **Lance por valor (ROAS):** só com valor real chegando (compra com `value` e moeda pela CAPI).

## Testes

### Tipos
| Tipo | Responde | Quando |
|---|---|---|
| Triagem no mesmo conjunto | qual peça o leilão prefere | sempre (não é causal) |
| Campeão + desafiante | se o desafiante bate o campeão no evento decisor | rotina de criativo |
| Teste A/B da Meta (Experimentos) | diferença causal entre duas versões | decisão grande (público, otimização, oferta) com verba e prazo |
| Conversion lift | quanto a mídia causa de conversão | contas com volume, para validar o canal |

### Protocolo
1. **Hipótese** escrita: "trocar X por Y aumenta Z porque…".
2. **Uma variável.**
3. **Métrica e critério** decididos antes: evento decisor, mínimo de amostra (ex.: 5–10 leads por peça), duração mínima (7 dias cobre o ciclo da semana).
4. **Leitura:** D+3 só olha (sem veredito); D+7 decide.
5. **Registro:** hipótese, resultado e decisão no relatório ou no plano.

### Cuidados
- Não declarar vencedor com amostra pequena.
- **Efeito de detalhamento (breakdown):** o custo médio por posicionamento ou idade não mostra o custo marginal; não corte posicionamento só pela média.
- Triagem observacional muda várias coisas ao mesmo tempo: diga isso no relatório.
- Remixe o campeão antes de partir para uma tese nova.
