# Changelog

## 0.1.1

- Gjort projektet GitHub-redo enligt GPT Byggarens standard.
- Lagt till CI för push, pull request och workflow dispatch.
- Lagt till release-workflow för publicerad GitHub Release.
- Releaseversion härleds från GitHub Release-taggen.
- Lagt till separat distributionsvalidering och project-hygiene gate.
- Lagt till projekt-ZIP som ren source-leverans.
- `dist/`, build-output och cachefiler är nu exkluderade från projekt-ZIP och ignoreras av Git.
- Release bygger Chat, ChatGPT Plugin, Claude och OpenCode samt checksums och delivery manifest.

## 0.1.0

- Första stabila funktionsversionen av den förenklade GPT Paketeraren.
- Stegvis insamling av namn, kort beskrivning, instruktion och Knowledge.
- Import och round-trip för Chat, ChatGPT Plugin, Claude och OpenCode.
