# Mensuração: pixel, Conversions API, conversão offline e atribuição

## Taxonomia de eventos

Defina no perfil (`kpi.eventos_funil`) e mantenha os nomes estáveis. Exemplos:

| Tipo de negócio | Funil | Evento decisor |
|---|---|---|
| Serviço profissional com CRM | Lead → Contact → LeadMql → QUALIFIED → Schedule → CONVERTED → Purchase | QUALIFIED (agendado é qualificado) |
| Escola | contato → qualificado → visita reservada → visita realizada → matrícula → pagamento | visita / matrícula |
| Serviço local com venda no WhatsApp | conversa → Schedule (reserva criada) → Purchase (ganho, valor integral) | Purchase |

**Regras de data:** o evento usa a data em que aconteceu (a criação da agenda, não o horário futuro da consulta; o primeiro marcador de ganho, não a última edição).

## Pixel + CAPI

- Mesmo `event_name` e mesmo `event_id` no navegador e no servidor: a Meta deduplica.
- `action_source` real: `website`, `system_generated` (CRM), `physical_store` (atendimento presencial), `business_messaging` (WhatsApp com `ctwa_clid` e `messaging_channel`), `chat`, `phone_call`, `email`, `other`.
- CRM: `custom_data.event_source = "crm"` e `custom_data.lead_event_source = "<nome do CRM>"`; `user_data.lead_id` quando o lead veio de Instant Form.
- Lotes de até 1.000 eventos por requisição (lotes menores, com `upload_tag`, facilitam conferir).
- **Janela:** até 7 dias depois do evento; só `physical_store` aceita até 62 dias. O que passar fica retido; **não** troque data nem origem para contornar (erro `2804003` da API).

## Hash e normalização (SHA-256)

| Chave | Normalização | Hash |
|---|---|---|
| `em` | minúsculas, sem espaços | sim |
| `ph` | só dígitos com DDI (55 + DDD + número); tire o 0 de tronco | sim |
| `fn`, `ln` | minúsculas, sem pontuação | sim |
| `ct` | minúsculas, sem espaços e pontuação | sim |
| `st` | sigla de 2 letras, minúsculas | sim |
| `zp` | só dígitos/letras | sim |
| `country` | ISO 3166-1 alfa-2 (`br`) | sim |
| `external_id` | ID estável do CRM (pode prefixar a subconta) | sim |
| `lead_id`, `ctwa_clid`, `fbc`, `fbp`, IP, user agent | como vieram | não |

O `neuro-ads-manager conversao` aplica essas regras. **Nunca** mande notas, mensagens, campos de saúde, tags, nome do profissional ou UTMs como dado do usuário.

## event_id e ledger

- `event_id` determinístico: prefixo + hash de (subconta | contato | evento | fonte). O mesmo arquivo reenviado gera o mesmo id.
- **Ledger append-only** por (dataset, event_id), com estados `attempted → accepted | failed | uncertain`. `attempted` e `uncertain` bloqueiam reenvio automático.
- Passe a lista de enviados para o validador: `conversao validar <csv> --excluir-ids enviados.csv`.
- **"Aceito" ≠ "casou" ≠ "atribuído".** O aceite só diz que a Meta recebeu.
- **Um evento, um dataset por conta.** Mandar a mesma compra para dois datasets dobra a contagem nos relatórios.
- **Emissores múltiplos** (workflow do CRM, site, script) mandando o mesmo evento: escolha um, ou use o mesmo `event_id` em todos.

## Fluxo de uma carga

1. `neuro-ads-manager conversao validar <csv>`: cobertura, retidos, duplicados.
2. `neuro-ads-manager conversao payload <csv> --saida payload.json --teste <TEST_EVENT_CODE>`.
3. Enviar o lote de teste e conferir em **Eventos de teste** do Gerenciador de Eventos.
4. Plano de mudança (`operacao nova carga-capi-<data>`), aprovação, envio sem `--teste`, ledger.
5. Uma semana depois: EMQ (qualidade da correspondência) no Gerenciador de Eventos e o evento aparecendo como resultado.
- Upload manual no Gerenciador de Eventos: `conversao normalizar` gera o CSV só com hash.

## Atribuição

- **Janela declarada** no relatório (padrão da Meta: 7 dias após clique + 1 dia após visualização). Compare só dentro da mesma janela.
- Insights com `use_unified_attribution_setting=true` (o CLI usa) seguem a configuração de cada conjunto.
- **No CRM:** cruze por `adId`/`campaignId` gravados no contato; ordem sugerida: adId do primeiro toque → campaignId → gclid → UTM/`ctwa_clid` → origem do CRM → fonte declarada. Primeiro, último e qualquer toque separados. "Sem vínculo" não é orgânico; nunca case por nome, telefone ou horário.
- **Lead Ads descarta `url_tags`.**
- **Percentual sem origem** é um indicador de saúde (defina no perfil a partir de quanto alertar).

## Índice de prontidão de mensuração

| Parte | Peso | Pergunta |
|---|---|---|
| Alinhamento | 25 | O evento otimizado é o evento decisor? |
| Eventos | 20 | Os estágios do funil existem e chegam? |
| Integridade | 20 | Hash, event_id, dedup, datas e origens corretos; sem dataset duplicado? |
| Conversão | 15 | Valor e moeda; cobertura de chaves? |
| Atribuição | 10 | Janela única; origem por adId; % sem origem? |
| Governança | 10 | Ledger, teste antes da carga, base legal, opt-out, arquivos restritos? |

Parte sem evidência fica "não avaliada" e sai da soma.

## LGPD na mensuração

- Base legal registrada para cada uso do CRM em mídia.
- Minimização: só as chaves de correspondência.
- Opt-out, DND e pedido de exclusão bloqueiam o envio.
- Arquivos com dado cru ou hash: pasta restrita, permissão 600, fora do Git. Hash é pseudonimização, não anonimização.
