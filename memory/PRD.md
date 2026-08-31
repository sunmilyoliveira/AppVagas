# PRD — VagaAI Mobile

## Problema
Criar um aplicativo mobile de vagas em que anunciantes publiquem oportunidades com requisitos imprescindíveis e diferenciais, enquanto candidatos mantêm um perfil profissional completo, visualizam compatibilidade e geram currículos personalizados com IA para cada candidatura.

## Arquitetura
- Frontend mobile: Expo SDK 54, React Native, Expo Router, Ionicons, safe-area insets e armazenamento seguro de sessão.
- Backend: FastAPI em `0.0.0.0:8001`, autenticação JWT, bcrypt e integração `emergentintegrations` usando o modelo OpenAI `gpt-5.4` com chave universal somente no backend.
- Dados: MongoDB via Motor, documentos com IDs UUID e projeções sem `_id` nas respostas públicas.
- API: prefixo `/api`, com rotas de autenticação, perfil, vagas, candidaturas, compatibilidade, ranking e currículo IA.

## Personas
- Candidato: busca vagas, mantém seu histórico profissional, entende o match e envia candidaturas mais relevantes.
- Anunciante/recrutador: publica vagas, define critérios e prioriza candidatos com análise objetiva de compatibilidade.

## Requisitos principais (estáticos)
- Escolha inicial entre Candidato e Anunciante.
- Cadastro e login por e-mail e senha com papel preservado.
- Perfil de candidato com dados pessoais, resumo, experiências, formação, habilidades, idiomas, portfólio e preferências.
- Vaga com cargo, empresa, localização, modalidade, descrição, requisitos imprescindíveis e diferenciais.
- Percentual de compatibilidade do candidato por vaga.
- Currículo personalizado por IA sem inventar informações do candidato.
- Candidatura associada à vaga e ao currículo personalizado.
- Painel do anunciante com contagem de candidatos, atendimento de essenciais/diferenciais, resumo, vantagens, pontos de atenção e ordenação por match.

## Implementado — 2026-08-31
- Tela inicial, autenticação, navegação de candidato e anunciante e sessão persistente.
- Feed de vagas com busca, cards de compatibilidade e detalhe com requisitos.
- Formulário completo de perfil e persistência no MongoDB.
- Criação e publicação de vagas com modalidade e requisitos em lista.
- Algoritmo de compatibilidade com métricas de essenciais e diferenciais.
- Geração real de currículo personalizado usando streaming interno da IA e preview no app.
- Candidatura e painel de ranking para recrutador com vantagens e pontos de atenção.
- Estados de carregamento, vazio, erro, feedback de sucesso, safe area e testIDs nos fluxos críticos.
- Testes finais: backend 3/3 e fluxos críticos mobile de candidato e recrutador aprovados.

## Backlog priorizado

### P0 — próximo ciclo
- Adicionar edição de cada experiência, formação e item de portfólio como entidades separadas, em vez de campos multilinha.
- Permitir ao recrutador alterar status da candidatura e adicionar observações internas.
- Persistir versões dos currículos gerados para o candidato revisar e reutilizar.

### P1
- Filtros por modalidade, localização, senioridade e faixa salarial.
- Notificações de novas vagas e mudança de status da candidatura.
- Análise de currículo mais rica com explicação por requisito e confirmação manual do candidato.
- Paginação e índices MongoDB para bases maiores.

### P2
- Upload de currículo PDF e importação assistida do perfil.
- Compartilhamento de vaga e currículo por link.
- Métricas para anunciantes sobre conversão, tempo até shortlist e qualidade das vagas.

## Próximas tarefas
1. Implementar status e comunicação entre recrutador e candidato.
2. Melhorar a edição estruturada do perfil profissional.
3. Adicionar filtros e alertas personalizados.