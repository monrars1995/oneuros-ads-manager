# Estrutura de conta e públicos

## Princípios

1. **Consolidar.** O algoritmo aprende por conjunto. Cada conjunto precisa de ~50 eventos de otimização em 7 dias para sair da fase de aprendizado; menos que isso vira "aprendizado limitado" e custo instável. Menos conjuntos com mais verba cada > muitos conjuntos com pouca verba.
2. **Uma campanha por objetivo e destino.** Misturar Instant Form, WhatsApp e site no mesmo conjunto embaralha o sinal e o relatório.
3. **Otimizar para o evento que vira receita.** O evento de otimização precisa ser frequente o bastante para o aprendizado e próximo o bastante da receita para não enganar. Quando o evento final é raro (matrícula, contrato), otimize para o anterior (agenda, lead qualificado) e leve o final pela CAPI para medir.
4. **Separar fases:** prospecção, remarketing e base (rematrícula, pós-venda) em campanhas diferentes, com exclusões cruzadas.
5. **Mudanças grandes reiniciam o aprendizado:** troca de público, de evento, de criativo principal, de lance ou aumento grande de orçamento. Agrupe as mudanças e espere a leitura.

## Objetivos e destinos mais comuns

| Destino | Objetivo | Otimização | Resultado no relatório | Uso típico |
|---|---|---|---|---|
| Instant Form | `OUTCOME_LEADS` | `LEAD_GENERATION` (ou `QUALITY_LEAD`, com fallback) | `lead` | serviços profissionais |
| WhatsApp (CTWA) | `OUTCOME_LEADS`/`OUTCOME_ENGAGEMENT` | `CONVERSATIONS`, destino `WHATSAPP` | `onsite_conversion.messaging_conversation_started_7d` | negócio local, educação |
| WhatsApp com venda | `OUTCOME_SALES` | `OFFSITE_CONVERSIONS` (PURCHASE pela CAPI) | `purchase` | serviço com venda no atendimento |
| Site/LP | `OUTCOME_LEADS` | `OFFSITE_CONVERSIONS` (LEAD) | `offsite_conversion.fb_pixel_lead` | LP por oferta ou segmento |
| Perfil do Instagram | `OUTCOME_TRAFFIC` | visita ao perfil | visitas ao perfil | prova social e autoridade |

## Orçamento por estrutura

- **ABO (orçamento no conjunto):** teste controlado, cada público ou conceito com sua verba e `is_adset_budget_sharing_enabled=false` explícito.
- **CBO / Advantage+ campaign budget:** escala do que já provou; o algoritmo distribui entre conjuntos.
- **Regra prática de verba mínima por conjunto:** CPA alvo × 50 ÷ 7 por dia. Abaixo disso, consolide ou otimize para um evento mais frequente.
- **Pilotos com data de fim:** `end_time` na própria campanha, para não depender de alguém lembrar de pausar.

## Formatos de estrutura que já funcionam

- **Campeão + 1 desafiante** por conjunto: o campeão leva a verba; o desafiante é trocado depois de um gasto combinado ou de alguns dias.
- **1 × 1 × 10:** 1 campanha, 1 conjunto, 10 anúncios com mídias distintas e pelo menos 3 ângulos.
- **Por segmento da oferta:** um conjunto por segmento (ex.: etapas de ensino, linhas de serviço) com a LP do segmento.

## Públicos

- **Amplo com Advantage+ audience** e um evento de conversão confiável é o ponto de partida. Interesses entram como sugestão.
- **Geografia do negócio:** raio do endereço para negócio local; estados para nichos regionais. `location_types`: casa e recente.
- **Idade mínima:** 18+ sempre; maior quando o perfil pede (pais: 24+). Nunca segmentar menores.
- **Exclusões do CRM** em toda prospecção: clientes, matriculados, leads em aberto. Lista com hash SHA-256 (e-mail e telefone normalizados) e **tamanho conferido** antes de aplicar.
- **Remarketing:** visitantes do site, engajamento com vídeo/perfil, leads que não avançaram (por janela: 30, 90, 180 dias), com exclusão de quem já converteu.
- **Lookalike:** só de uma fonte de qualidade (clientes que viraram receita, não leads brutos).
- **Proibido:** segmentar por atributo sensível inferido (saúde, religião, sexualidade, dívida, processo, conteúdo de conversa); usar dados de menores; misturar linhas de negócio diferentes no mesmo público.
- **Sobreposição:** conjuntos com públicos parecidos disputam o mesmo leilão. Consolide ou exclua.

## Nomenclatura e UTMs

- Modelo do perfil (`neuro-ads-manager nome modelo --perfil <id>`): cliente, canal/destino, objetivo, segmento, público, formato, ângulo, código e mês.
- `url_tags` dinâmico em todo anúncio com destino web (ex.: `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}&placement={{placement}}`). Usar o **id** (não o nome) sobrevive a renomeações.
- Lead Ads descarta `url_tags`: a origem vem do sync do CRM.
- WhatsApp: mensagem pré-preenchida com marcador do anúncio para rastrear a origem na conversa.

## Checklist de estrutura (auditoria)

- [ ] Cada campanha tem um objetivo e um destino.
- [ ] O evento otimizado é o evento decisor (ou o mais próximo frequente o bastante).
- [ ] Nenhum conjunto em aprendizado limitado por falta de verba ou fragmentação.
- [ ] Mesma janela de atribuição nos conjuntos comparados.
- [ ] Exclusões do CRM aplicadas e com tamanho conferido.
- [ ] Idade mínima e geografia de acordo com o perfil.
- [ ] Nomes no padrão; `url_tags` presentes.
- [ ] Categoria especial e declarações exigidas preenchidas.
- [ ] Conta ativa, forma de pagamento ok, limite de gasto longe do teto.
