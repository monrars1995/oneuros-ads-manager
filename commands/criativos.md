---
description: Prepara conceitos, copy e briefing de produção de anúncios com a neuro-ads-manager, já passados pelo compliance do segmento (OAB, ECA/LGPD, saúde, Meta)
argument-hint: <oferta ou briefing> [perfil] [formato: reels | feed | stories | carrossel] [quantidade]
---

Prepare os criativos pedidos seguindo a skill `neuro-ads-manager` (leia o SKILL.md e `references/criativos-e-copy.md`). Argumentos: `$ARGUMENTS`.

1. **Contexto.** Perfil (`neuro-ads-manager perfil mostrar <id>`), oferta, destino e público. Se houver snapshot recente, olhe os anúncios campeões e os piores (`neuro-ads-manager relatorio <snapshot> --json`) para partir do que funcionou. Pergunte só o que faltar.
2. **Conceitos.** Proponha de 3 a 6 conceitos com ângulos diferentes (não variações de cor). Para cada um: gancho dos 3 primeiros segundos, argumento, prova, CTA coerente com o destino e formato (9:16 e 4:5).
3. **Copy.** Para cada conceito: texto principal (a primeira linha carrega o gancho), título, descrição e CTA. Em segmento regulado, siga a estrutura da skill (tema → condição → especialista → CTA de baixa pressão → disclaimer do perfil).
4. **Compliance.**
   - Grave a copy num arquivo temporário e rode `neuro-ads-manager compliance <arquivo> --perfil <id>` (com `--titulo "<título>"` quando o perfil tiver limite de tamanho).
   - Peça ao subagente `neuro-ads-manager:revisor-compliance` a revisão de contexto.
   - Reescreva até não sobrar crítico nem alto. Mostre ao usuário o que foi trocado e por quê.
   - Liste o checklist humano do segmento (`neuro-ads-manager compliance regras <conjunto>`): termo de imagem, identificação profissional, direitos de música e imagem.
5. **Nomes.** Gere o nome de cada anúncio com `neuro-ads-manager nome gerar anuncio --perfil <id> …` e um código (C01, C02…).
6. **Entrega.** Escreva `criativos/<perfil>-<escopo>-<data>/briefing.md` seguindo `templates/briefing-criativo.md`, e um `copy.json` com `codigo`, `nome`, `formato`, `gancho`, `texto_principal`, `titulo`, `descricao`, `cta` e `compliance` (resultado do lint). Vídeos podem seguir para o neuro-mv-edit com o mesmo perfil.
7. **Teste.** Diga a hipótese de cada conceito e como ele entra no teste (campeão + desafiante, uma variável por vez). Subir na conta é plano de mudança, com aprovação, e tudo PAUSED.
