# Third-party notices and material boundaries

Checked against the installed workspace on 2026-09-17. This is an engineering inventory, not a legal or contest-eligibility opinion. Historical runtime evidence is in `evidence/runtime-review/`; the replacement PDF artifact and notices are recorded in `evidence/pdfium-review/`. A complete release inventory remains required.

## Application dependencies

| Component | Installed version | Declared license | Use / delivery boundary |
| --- | ---: | --- | --- |
| Express | 5.2.1 | MIT | Server and its MIT/ISC/BSD transitive packages. |
| Nodemailer | 10.0.10 | MIT-0 | Server email transport. |
| React / React DOM | 19.3.0 | MIT | Browser application; bundled by the build. |
| ts-fsrs | 5.4.2 | MIT | Server recall scheduling. |
| pypdfium2 | 5.13.0 | Apache-2.0 / BSD-3-Clause | Exact hash-pinned Linux x64 wheel; all wrapper and PDFium dependency notices retained. Documentation/examples use CC-BY-4.0; upstream author attribution is retained in wheel metadata and source headers. |
| PDFium | 153.0.7999.0 | BSD-style plus permissive dependencies | Default build without V8/XFA. Embedded FreeType uses FTL; built-in Foxit font arrays use PDFium's BSD-style license. Full reviewed component/license manifest: `evidence/pdfium-review/license-manifest.json`. |
| PDF-LIB | 1.17.1 | MIT | Creates synthetic PDF fixtures; excluded from the server runtime package. |

The installed package tree includes build and test tools that are not delivered by the runtime packager, including Vite 8.3.0, Playwright 1.63.0, and their platform binaries. `evidence/runtime-review/installed-packages.json` preserves the earlier PDF.js-era inventory; the current lockfile removes canvas/PDF.js and classifies PDF-LIB as development-only. Final full-application release packaging needs its own dependency inventory.

## OCR data

The delivered Spanish `spa.traineddata` came from the official Tesseract `tessdata_fast` repository and is Apache-2.0. Its provenance, Apache license, and SHA-256 (`6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464`) are retained in `content/tessdata/`.

## Text and curriculum references

Miguel de Cervantes's original *Don Quijote* (1605/1615) is public domain. The application corpus contains the historical narrative from the circa-1920 Librería Bergua edition, digitized by Biblioteca Nacional de España and obtained through Elejandría. Covers, preliminaries, illustrations, promotions and prologues are excluded; the downloaded PDF is not delivered. Source-edition provenance and hashes remain in `content/don-quixote.json`. The source-specific US public-domain basis and the distributor's distinction between literary text and proprietary resources are documented with primary sources in [evidence/material-sources.md](evidence/material-sources.md).

The app's 15 narrow objectives and contextual glosses use Instituto Cervantes CVC pages as factual classification and reference sources. They are application-authored scopes, mappings and explanations, not an official CVC curriculum or endorsement. The all-rights-reserved research mirror, full inventory and close translations are excluded from the application release. RAE pages are also reference sources, not bundled dictionaries. [evidence/material-sources.md](evidence/material-sources.md) documents this boundary; source attribution is not permission to distribute copied textbook prose.

## AI disclosure

OpenAI models assisted with code, research synthesis, curriculum drafting, and recorded independent semantic review. Generated learning content is labeled in the product where applicable and remains subject to deterministic validation and review status. The private optional runtime invokes Codex CLI 0.154.0 (package declares Apache-2.0) through the owner's ChatGPT-backed account: `gpt-5.6-sol` at medium effort generates and separately reviews lessons, while `gpt-5.6-luna` at low effort provides contextual help. Events retain prompt/model versions. Model service terms and account authorization are separate from the CLI code license. Provider support for public account-backed execution remains unresolved, so public AI is disabled by default; no API billing substitute is used.

## External host prerequisites

These executables and assets are installed on the VPS and are not copied by `scripts/package-runtime.mjs`:

- Bubblewrap 0.11.1 (Ubuntu package declares LGPL-2+), used for filesystem, namespace, and network isolation.
- systemd 259 (mixed LGPL/GPL package components), used for an AI cgroup scope.
- Tesseract OCR 5.5.0 (Apache-2.0) and its system shared libraries.
- Node.js 22+, Python 3, glibc, shared libgcc_s (GCC runtime exception; external dynamic prerequisite), the separately installed Codex CLI, and an authorized account credential.
- Browser/OS fonts named by CSS. No webfont files are bundled. The PDF worker masks `/usr/share/fonts`; screenshots and rendered deck pages contain pixels rather than font binaries.

## Native renderer replacement

The former `@napi-rs/canvas` 1.0.9 renderer incorporated MPL-2.0 cssparser; it and PDF.js are removed from package.json, the lockfile, and the delivered worker. Historical findings remain in [evidence/native-notice-research.md](evidence/native-notice-research.md).

The replacement is hash-pinned by `requirements-pdf.txt`; [evidence/pdfium-review/README.md](evidence/pdfium-review/README.md) records exact build evidence, the complete wheel notices, supplemental LLVM runtime/built-in font notices, and external shared-library boundaries. `scripts/package-runtime.mjs` checks the PDFium binary hash and retains all wheel licenses plus supplemental notices. It does not ship system executables/libraries or host font files.

Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved. FreeType is used under the FreeType License (FTL), not its alternative GPL terms. The built-in PDFium font source attributes original code to Foxit Software Inc., copyright 2014.
