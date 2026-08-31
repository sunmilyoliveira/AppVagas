# PRD — Vagas+

## Problema
Aplicativo mobile de vagas com IA para gerar currículos personalizados. Recrutadores publicam vagas com requisitos imprescindíveis e diferenciais, candidatos mantêm perfil completo e recebem match/currículo IA sob medida.

## Arquitetura
- Frontend: Expo SDK 54, React Native, Expo Router, TypeScript. Telas modularizadas em `/src/screens`.
- Backend: FastAPI 0.110 + Motor (MongoDB) + JWT (bcrypt) + `emergentintegrations` (modelo OpenAI `gpt-5.4` para IA).
- API prefixo `/api`; comunicação bearer token; senha forte obrigatória (10+ chars, MAIÚSCULA, minúscula, número, símbolo).

## Personas
- **Candidato**: cria perfil, vê matches, gera currículo IA e acompanha etapas.
- **Recrutador**: publica vagas, gerencia pipeline, edita indicadores de cada etapa, conversa com candidatos, cria salas de vídeo privadas e acompanha métricas.

## Fluxos implementados

### Autenticação e identidade
- E-mail + senha forte (JWT 7 dias).
- Google Auth gerenciado pela Emergent (WebBrowser → session_id → session_token).
- Auditoria: registros de login, criação, alterações de etapa, criação/entrada de sala, exportação, exclusão.
- Verificação de recrutador: e-mail corporativo (link/token) + domínio (registro TXT DNS).
- LGPD: consentimento com nível de visibilidade (público / matched_only / privado), exportação estruturada de dados, exclusão total (soft close para salas).

### Vagas e match
- CRUD de vaga com requisitos imprescindíveis, diferenciais, modalidade, pipeline configurável e retenção.
- Match calcula essenciais (70%) + diferenciais (30%), sem contar cumprimento de requisitos como "vantagem".
- Ranking de candidatos com resumo, adequação, diferenciais atendidos e pontos de atenção.

### Pipeline seletivo
- Etapas padrão: Pré-triagem → Análise de currículo → Entrevista → Videochamada → Avaliação → Decisão final.
- Etapas customizadas por vaga; alteração dispara notificação para o candidato.
- Score da etapa editável; auditoria em cada mudança.

### Videochamada
- Sala com código único, expiração configurável (5–1440 min), participantes autorizados (recrutador + candidato).
- WebSocket assinado por JWT para sinalização; mídia P2P via `react-native-webrtc` (fallback seguro no preview web).
- Recusa de qualquer terceiro tentando entrar na sala.

### Chat recrutador ↔ candidato (novo)
- Vinculado à candidatura; apenas participantes autorizados leem/escrevem.
- Cada mensagem gera notificação in-app para a outra parte.

### Notificações in-app (novo)
- Feed próprio, marcar todas como lidas, badge com contador de não lidas.
- Tipos: `application`, `stage`, `video`, `message` com ícones e metadados.

### Dashboard do recrutador (novo)
- Totais (vagas, candidatos, chegam à decisão final, conversão %).
- Funil por etapa (barra proporcional).
- Desempenho por vaga (score médio + total).

## Segurança
- Password policy validada no backend e no frontend antes do submit.
- RBAC estrito nas rotas de vagas, pipeline, dashboard, verificação, salas.
- Ownership check em todas as operações do recrutador sobre suas vagas.
- Videochamada: sala verifica `authorized_ids`, código com `secrets.compare_digest`.
- Envio de e-mail corporativo com sanitização de HTML e restrição de links.

## Integrações
- Emergent LLM Key (backend somente) — geração de currículo IA.
- Emergent Managed Google Auth (WebBrowser + `/auth/session`).
- Emergent Managed Email para verificação de recrutador.

## Removido nesta iteração
- Apple Sign In e dependência `expo-apple-authentication`.
- Twilio Verify (SMS) e endpoints/flags associadas.

## Backlog priorizado

### P1
- Filtros/ordenação de vagas por modalidade, localização e faixa salarial.
- Rich text no chat com anexos.
- WebSocket para notificações em tempo real (atualmente pull ao trocar tela).
- Persistência de currículos gerados (histórico do candidato).

### P2
- TURN server para chamadas em redes restritas.
- Métricas avançadas de conversão (tempo médio por etapa).
- Exportação em PDF do dashboard.
