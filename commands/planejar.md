---
description: Monta o plano de uma campanha de Meta Ads com a neuro-ads-manager (objetivo, economia, estrutura, públicos, orçamento, criativos, mensuração, testes, compliance e cronograma)
argument-hint: <objetivo ou oferta> [perfil] [verba] [período]
---

Planeje a campanha pedida seguindo a skill `neuro-ads-manager` (leia o SKILL.md e as referências de estrutura, orçamento e mensuração). Argumentos: `$ARGUMENTS`.

1. **Briefing.** Com o perfil (`neuro-ads-manager perfil mostrar <id>`), confirme com o usuário, em poucas perguntas de múltipla escolha:
   - objetivo de negócio e evento decisor (lead qualificado, conversa, agenda, matrícula, venda);
   - oferta, público e região;
   - verba e período (data de fim);
   - destino (Instant Form, WhatsApp, site/LP, perfil);
   - o que já existe na conta. Se houver acesso, rode `neuro-ads-manager meta snapshot --perfil <id> --periodo 90d --ativos` para não duplicar estrutura e para usar o histórico.
2. **Economia.** Calcule CPR máximo a partir de ticket e taxas do funil, quando o usuário tiver. Diga a fonte de cada número; sem fonte, marque como hipótese. Verifique se a verba comporta ~50 eventos por conjunto em 7 dias (regra prática); se não, otimize para um evento mais frequente ou reduza conjuntos.
3. **Estrutura.** Campanhas, conjuntos e anúncios com nomes gerados por `neuro-ads-manager nome gerar <nível> --perfil <id> campo=valor …`, objetivo, otimização, orçamento (ABO para teste, CBO para escala), públicos (amplo + exclusões do CRM), posicionamentos e `url_tags` do perfil.
4. **Criativos.** Quantos conceitos, quais ângulos e formatos. Para a copy, use `/neuro-ads-manager:criativos`.
5. **Mensuração.** Eventos, pixel/CAPI, CRM, janela de atribuição e como o relatório vai medir o evento decisor. Lacuna de mensuração entra como risco.
6. **Testes.** Hipótese, variável, métrica, critério de decisão e mínimo de amostra; leituras D+3 (sem veredito) e D+7.
7. **Compliance.** Conjuntos do perfil (`neuro-ads-manager compliance regras <conjunto>`) e o checklist que precisa ser conferido antes de publicar.
8. **Entrega.** Escreva `planos/plano-<perfil>-<escopo>-<data>.md` seguindo `templates/plano-campanha.md`, com cronograma e responsáveis.
9. **Execução.** A criação na conta vira plano de mudança (`neuro-ads-manager operacao nova lancar-<escopo> --perfil <id>`), com tudo PAUSED. **Pare para aprovação.** A ativação é outra operação, depois da revisão das prévias.
