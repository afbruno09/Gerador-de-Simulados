# Gerador de Simulados

MVP de uma plataforma web para geração de simulados de residência médica com questões de múltipla escolha geradas por IA.

## Objetivo

Permitir que estudantes de residência médica criem simulados inéditos inspirados no padrão de instituições selecionadas.

Os simulados são gerados para treino e não representam provas oficiais.

## Status do projeto

MVP inicial em desenvolvimento.

Atualmente o projeto possui:

- Página inicial com formulário de geração
- Seleção de instituição de inspiração
- Seleção de quantidade de questões
- Seleção de tema ou área médica
- Simulado com questões de múltipla escolha
- Barra fixa com tempo e progresso
- Correção automática
- Resultado com acertos, erros e percentual
- Comentários explicativos por questão
- Base local em JSON
- Mock de geração por IA

## Estrutura do projeto

```txt
gerador-de-simulados/
├── index.html
├── style.css
├── script.js
├── data/
│   ├── instituicoes.json
│   ├── institutionStyles.json
│   └── questoes.json
└── prompts/
    └── generate-question-prompt.md
