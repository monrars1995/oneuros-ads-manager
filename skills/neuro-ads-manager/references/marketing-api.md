# Marketing API da Meta

## Acesso e tokens

- **Token de usuário do sistema** (system user) do Business Manager do cliente, sem expiração, com `ads_read` para leitura. `ads_management` só na ferramenta que escreve.
- O token fica no ambiente do usuário (`META_ACCESS_TOKEN` ou o `ambiente.token_env` do perfil). O agente **nunca** lê `.env` nem o cofre; pede ao usuário para exportar no terminal.
- Nomes com hífen (como `CRM-TOKEN`) não são exportáveis no shell: use nomes com letras, números e `_`.

## Nível de acesso (Marketing API Access Tier)

- **Limitado:** pontuação máxima de uso por conta baixa; ciclos normais de relatório e edição batem no limite.
- **Full access:** pedido no App Review do app. Requisitos: app publicado (Live), plataforma cadastrada no app, 500 ou mais chamadas da Marketing API nos últimos 15 dias e taxa de erro abaixo de 15% nas últimas 500. A descrição do uso precisa ser exata (motivo mais comum de recusa); por exemplo: agentes leem insights para relatórios e alertas e alteram campanhas **só depois de um humano aprovar cada mudança**.
- App que atende clientes além do dono precisa, antes, de acesso avançado às permissões (Ads, Business, Pages, WhatsApp).

## Limites de uso

- Cabeçalhos `x-app-usage`, `x-ad-account-usage` e `x-business-use-case-usage` informam o uso em %. O CLI pausa acima de 75% e espera mais acima de 95%.
- Erros de limite e transitórios (códigos 1, 2, 4, 17, 32, 341, 613 e 80000–80014, ou `is_transient`) têm nova tentativa com espera exponencial. **Escrita não é repetida automaticamente.**
- Prefira poucas chamadas grandes: `fields` explícitos, `limit` alto, insights por nível em vez de anúncio a anúncio.

## Versão

- A Graph API ganha versão nova a cada poucos meses e as antigas expiram. Fixe por projeto (`META_GRAPH_VERSION`; padrão do CLI: v27.0) e leia o changelog antes de subir.
- A v26 não aceita mais `?ids=` na raiz: use requisições em lote só com GET.

## Endpoints que o CLI lê

| Dado | Endpoint |
|---|---|
| Conta | `GET /act_<id>?fields=name,account_status,currency,timezone_name,amount_spent,spend_cap…` |
| Estrutura | `GET /act_<id>/campaigns`, `/adsets`, `/ads` (com `creative{…}`) |
| Insights | `GET /act_<id>/insights?level=campaign|adset|ad&time_range=…&use_unified_attribution_setting=true` (e `time_increment=1` para o diário) |
| Públicos | `GET /act_<id>/customaudiences?fields=…approximate_count_lower_bound,approximate_count_upper_bound,delivery_status` |
| Dataset/pixel | `GET /<dataset>?fields=name,last_fired_time…` e `GET /<dataset>/stats?aggregation=event` |

## Boas práticas de escrita (para a ferramenta que escreve)

- `execution_options=["validate_only"]` antes de criar.
- Guarda de identidade: nome, moeda e Business Manager da conta conferidos antes de qualquer POST.
- Criar PAUSED; ler de volta (GET) e comparar; nunca DELETE.
- Diário de intenção antes da chamada; resposta incerta = ler o estado, não repetir.
- `paging.next` pode carregar o token: não grave essas URLs.
