---
description: Gera o relatório de desempenho de uma conta de Meta Ads com a neuro-ads-manager (indicadores com comparação, campanhas, anúncios, funil, leitura e próximas ações)
argument-hint: [perfil] [período: 7d | 30d | mes | mes-passado | AAAA-MM-DD:AAAA-MM-DD] [snapshot.json | export.csv]
---

Gere o relatório pedido seguindo a skill `neuro-ads-manager` (leia o SKILL.md e `references/relatorios.md`). Argumentos: `$ARGUMENTS`.

1. **Perfil e período.** Sem perfil, liste e pergunte. Período padrão: os últimos 7 dias completos, comparados com os 7 anteriores.
2. **Dados.**
   - Snapshot ou CSV nos argumentos: use.
   - Senão: `neuro-ads-manager meta snapshot --perfil <id> --periodo <período> --comparar`. Sem token no ambiente, peça ao usuário para exportar; sem API, peça o CSV do Gerenciador.
3. **Números.** Rode `neuro-ads-manager relatorio <snapshot|csv> --perfil <id> --saida relatorios/relatorio-<perfil>-<período>.md`. Rode também `neuro-ads-manager alertas <snapshot> --perfil <id>`.
4. **Leitura.** Abra o arquivo e escreva a seção "Leitura e próximos passos" (modelo em `templates/relatorio.md`):
   - o que explica os números (criativo, público, oferta, mensuração, sazonalidade, mudanças feitas no período);
   - o funil do CRM, se o usuário trouxer (sem nomes nem contatos);
   - próximas ações com responsável, prazo e como medir.
   Não some o que não se soma (seção 2 da skill). Diga a janela de atribuição e as limitações.
5. **Conferência.** A soma das campanhas bate com o total da conta? Os números citados no texto batem com as tabelas? Corrija antes de entregar.
6. **Entrega.** Mostre o caminho do arquivo e um resumo de 5 linhas. Ações que mudam a conta viram plano de mudança, com aprovação.
