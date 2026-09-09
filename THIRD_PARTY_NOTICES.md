# Third-party notices and material boundaries

Checked against the installed workspace on 2026-09-17. This is an engineering inventory, not a legal or contest-eligibility opinion. Exact installed production-package inventory and machine evidence are in `evidence/runtime-review/`.

## Application dependencies

| Component | Installed version | Declared license | Use / delivery boundary |
| --- | ---: | --- | --- |
| Express | 5.2.1 | MIT | Server and its MIT/ISC/BSD transitive packages. |
| Nodemailer | 10.0.10 | MIT-0 | Server email transport. |
| React / React DOM | 19.3.0 | MIT | Browser application; bundled by the build. |
| ts-fsrs | 5.4.2 | MIT | Server recall scheduling. |
| PDF.js (`pdfjs-dist`) | 6.3.289 | Apache-2.0 | PDF parsing/rendering. The reproducible runtime package contains only the legacy runtime modules and top-level license. Its `standard_fonts`, CMaps, ICC profiles, WASM codecs, viewer, and other unused assets are excluded. |
| `@napi-rs/canvas` | 1.0.9 | MIT | Linux x64 glibc native canvas used to rasterize scans. The runtime package includes the upstream MIT text and only the matching native binary. |
| PDF-LIB | 1.17.1 | MIT | Creates synthetic PDF fixtures; excluded from the server runtime package. |

The full installed package tree includes build and test tools that are not delivered by the runtime packager, including Vite 8.3.0, Playwright 1.63.0, and their platform binaries. `evidence/runtime-review/installed-packages.json` records every installed package and whether npm classifies it as production or development.

## OCR data

The delivered Spanish `spa.traineddata` came from the official Tesseract `tessdata_fast` repository and is Apache-2.0. Its provenance, Apache license, and SHA-256 (`6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464`) are retained in `content/tessdata/`.

## Text and curriculum references

Miguel de Cervantes's original *Don Quijote* (1605/1615) is public domain. The application corpus contains the historical narrative from the circa-1920 Librería Bergua edition, digitized by Biblioteca Nacional de España and obtained through Elejandría. Covers, preliminaries, illustrations, promotions and prologues are excluded; the downloaded PDF is not delivered. Source-edition provenance and hashes remain in `content/don-quixote.json`. The source-specific US public-domain basis and the distributor's distinction between literary text and proprietary resources are documented with primary sources in [evidence/material-sources.md](evidence/material-sources.md).

The app's 15 narrow objectives and contextual glosses use Instituto Cervantes CVC pages as factual classification and reference sources. They are application-authored scopes, mappings and explanations, not an official CVC curriculum or endorsement. The all-rights-reserved research mirror, full inventory and close translations are excluded from the application release. RAE pages are also reference sources, not bundled dictionaries. [evidence/material-sources.md](evidence/material-sources.md) documents this boundary; source attribution is not permission to distribute copied textbook prose.

## AI disclosure

OpenAI models assisted with code, research synthesis, curriculum drafting, and recorded independent semantic review. Generated learning content is labeled in the product where applicable and remains subject to deterministic validation and review status. The private optional runtime invokes Codex CLI 0.154.0 (package declares Apache-2.0) and model `gpt-5.6-luna` through the owner's ChatGPT-backed account. Model service terms and account authorization are separate from the CLI code license. Provider support for public account-backed execution remains unresolved, so public AI is disabled by default; no API billing substitute is used.

## External host prerequisites

These executables and assets are installed on the VPS and are not copied by `scripts/package-runtime.mjs`:

- Bubblewrap 0.11.1 (Ubuntu package declares LGPL-2+), used for filesystem, namespace, and network isolation.
- systemd 259 (mixed LGPL/GPL package components), used for an AI cgroup scope.
- Tesseract OCR 5.5.0 (Apache-2.0) and its system shared libraries.
- Node.js 22+, glibc, the separately installed Codex CLI, and an authorized account credential.
- Browser/OS fonts named by CSS. No webfont files are bundled. The PDF worker masks `/usr/share/fonts`; screenshots and rendered deck pages contain pixels rather than font binaries.

## Open native-binary notice issue

The installed `@napi-rs/canvas-linux-x64-gnu` package contains a 34.8 MB `skia.linux-x64-gnu.node` binary and declares MIT, but ships no component-level notice file. The upstream source identifies it as a Skia binding and its locked build includes Rust crates plus native Skia/image/font code; strings in this exact binary identify at least Skia, libpng, libjpeg-turbo, HarfBuzz, and Unicode data. A complete corresponding component/license/notice bill was not available in the installed artifact. Do not represent the native-binary notice audit as complete or the contest license gate as passed until that bill is obtained or the renderer is replaced.

The runtime packager excludes PDF.js's bundled Liberation font files and their GPL-2-with-exceptions license; it does not delete or hide license files from an otherwise delivered dependency. PDF.js CMap, ICC, and WASM asset license files were inspected and those asset directories are excluded because this worker provides none of their URLs and its regression corpus passes without them. Unsupported PDFs needing those optional assets remain a parser-compatibility limit.
