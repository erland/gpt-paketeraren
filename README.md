# GPT Paketeraren

GPT Paketeraren samlar in ett GPT-namn, en kort beskrivning, användarens egen GPT-instruktion och eventuella Knowledge-filer och paketerar samma canonical innehåll för flera runtime-miljöer.

Den är avsiktligt enklare än GPT Byggaren: användaren skriver GPT:n; Paketeraren ska i första hand bevara, kontrollera och paketera innehållet.

## PWA

PWA:n kör helt lokalt i webbläsaren. GPT-instruktioner och filer skickas inte till någon server.

**Öppna PWA:n:** https://erland.github.io/gpt-paketeraren/

PWA:n kan:

- skapa GPT-distributioner för Chat, ChatGPT Plugin, Claude och OpenCode
- importera tidigare GPT Paketeraren-distributioner för fortsatt redigering
- visa Knowledge-filer som text i en popup
- öppna avancerade GPT Byggaren Chat-distributioner i read-only-läge
- identifiera instruction via manifest eller kända runtime-sökvägar
- visa samtliga filer i ett avancerat paket
- öppna stödda textfiler i en popup
- lista binära filer utan att försöka tolka dem som text
- inaktivera distributionsknapparna när ett avancerat paket visas read-only

Read-only-viewern stödjer bland annat de Chat-format som använder:

- `assistant/instructions.md`
- `runtime/canonical-instructions.md`
- `runtime/instructions.md`

All ZIP-inspektion och paketering sker lokalt i webbläsaren.

### Lokal PWA-utveckling

```bash
cd web
npm ci
npm test
npm run typecheck
npm run dev
```

`web/package-lock.json` är versionshanterad. Använd `npm ci` för reproducerbara installationer som matchar CI och GitHub Pages. Använd `npm install` när dependencies avsiktligt ändras och commit:a då den uppdaterade lockfilen.

Produktionsbuild:

```bash
cd web
npm run build
```

GitHub Pages byggs och publiceras via `.github/workflows/pages.yml`.

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

## Import av befintlig GPT

CLI-import:

```bash
python scripts/import_existing.py existing.zip imported-project
```

Importen normaliserar en stödd distribution till `gpt.yaml`, `instructions.md` och `knowledge/` för granskning innan ny paketering.

PWA:n har dessutom egen importlogik för både redigerbara GPT Paketeraren-distributioner och read-only-visning av avancerade GPT Byggaren-distributioner.

## GitHub Actions

`.github/workflows/ci.yml` kör tester, project hygiene, build och distributionsvalidering på push, pull request och manuell körning. PWA-dependencies installeras med `npm ci` från den versionshanterade lockfilen.

`.github/workflows/release.yml` triggas när en GitHub Release publiceras. Versionen härleds från release-taggen, exempelvis `v0.1.1`, och workflowet bygger samt laddar upp:

- projekt-ZIP
- Chat ZIP
- ChatGPT Plugin ZIP
- Claude ZIP
- OpenCode ZIP
- `SHA256SUMS.txt`
- `DELIVERY-MANIFEST.json`

`.github/workflows/pages.yml` bygger, testar och publicerar PWA:n till GitHub Pages med samma låsta dependency-träd som CI.
