# GPT Paketeraren

GPT Paketeraren samlar in ett GPT-namn, en kort beskrivning, användarens egen GPT-instruktion och eventuella Knowledge-filer och paketerar samma canonical innehåll för flera runtime-miljöer.

Den är avsiktligt enklare än GPT Byggaren: användaren skriver GPT:n; Paketeraren ska i första hand bevara, kontrollera och paketera innehållet.

## Canonical projekt

- `packager/gpt.yaml` – namn och beskrivning
- `packager/instructions.md` – canonical GPT-instruktion
- `packager/knowledge/` – Knowledge-filer

## Lokalt test

```bash
python tests/test_instruction_contract.py
python tests/test_roundtrip.py
python scripts/project_hygiene.py
```

## Bygg distributioner

Utvecklingsbuild:

```bash
python scripts/build_distributions.py \
  --project-root . \
  --version 0.0.0-dev \
  --targets project,chat,plugin,claude,opencode
```

Genererad output hamnar i `dist/`, som är ignorerad av Git och ska inte checkas in eller följa med i projekt-ZIP:en.

## GitHub Actions

`.github/workflows/ci.yml` kör tester, project hygiene, build och distributionsvalidering på push, pull request och manuell körning.

`.github/workflows/release.yml` triggas när en GitHub Release publiceras. Versionen härleds från release-taggen, exempelvis `v0.1.1`, och workflowet bygger samt laddar upp:

- projekt-ZIP
- Chat ZIP
- ChatGPT Plugin ZIP
- Claude ZIP
- OpenCode ZIP
- `SHA256SUMS.txt`
- `DELIVERY-MANIFEST.json`

## Import av befintlig GPT

```bash
python scripts/import_existing.py existing.zip imported-project
```

Importen normaliserar en stödd distribution till `gpt.yaml`, `instructions.md` och `knowledge/` för granskning innan ny paketering.
