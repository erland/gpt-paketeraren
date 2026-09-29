# Runtime-format

GPT Paketeraren bygger fyra projektioner av samma canonical GPT.

## Chat

- `START-HERE.md`
- `assistant/instructions.md`
- `knowledge/`

## ChatGPT Plugin

- `plugin.json`
- `README.md`
- `skills/<id>/SKILL.md`
- `skills/<id>/references/`

## Claude

- `README.md`
- `instructions.md`
- `knowledge/`

## OpenCode

- `README.md`
- `AGENTS.md`
- `knowledge/`

Runtime-adaptrar får ändra struktur och lägga till minimal runtime-information men får inte ändra GPT:ns avsedda beteende.
