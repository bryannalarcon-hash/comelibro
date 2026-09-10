# Material sources and delivery boundary

Checked 2026-09-17 for the US-facing prototype. This records the actual material used and the basis for that choice; it does not grant rights to unrelated material from the same websites.

## Novel

The imported corpus contains Cervantes's Spanish narrative, with 126 chapters and 8,953 automatically segmented passages of text. It excludes the downloaded PDF's cover, front matter, publisher promotions, illustrations and prologues. Comelibro's cover is its own SVG. The imported corpus and source hashes are recorded in `content/don-quixote.json`; `content-review.md` records the independent source correspondence check. The full Elejandría PDF is a local research input, not a delivered asset.

The [distributor's book page](https://www.elejandria.com/libro/don-quijote-de-la-mancha/cervantes-miguel/77) identifies its source as the Madrid Librería Bergua 1920 edition from the Biblioteca Nacional de España. The [BNE catalog](https://datos.bne.es/obra/XX3383563.html?date=ASC&version=XX3383563spa) independently lists that publisher and an approximate 1920 date. The [US Copyright Office's Circular 22, page 10](https://www.copyright.gov/circs/circ22.pdf) places works published or copyrighted before 1931 in the US public domain as of 2026. This supports using the historical narrative; it does not establish rights to later creative additions.

Elejandría's [website terms, section 13](https://www.elejandria.com/aviso-legal) restrict reuse of its own resources. Its [mobile-app terms, section 7](https://www.elejandria.com/politica-privacidad-app) expressly distinguish its proprietary presentation, covers and synopses from public-domain literary text. The latter is corroborating publisher guidance, not a claim that app terms replace website terms. The implementation boundary therefore retains only the historical narrative and source attribution. Do not distribute the downloaded PDF, website design, modern cover, synopsis or publisher materials as part of the app.

The [BNE reproduction policy](https://www.bne.es/es/servicios/reproduccion-documentos/uso-reproducciones) generally permits reuse of open-access public-domain images with attribution, subject to item-specific conditions. No BNE scan images are shipped here, and no individual-image license is inferred from that general policy. Credit: Miguel de Cervantes Saavedra; Librería Bergua, Madrid, circa 1920; source digitization attributed to Biblioteca Nacional de España, obtained through Elejandría.

## Curriculum and glosses

The app delivers 15 independently reviewed, application-authored objective descriptions, original exercises and contextual explanations. `content/catalog.json` retains section-qualified CVC references and short conventional linguistic names. The full CVC inventory, downloaded HTML, close translations and research mirror are research inputs only and must be excluded from public assets and the deployment archive. The app must not imply Instituto Cervantes endorsement or reproduce a modern annotated edition.

The relevant distinction is factual reference versus copied expression: [Copyright Office Circular 33](https://www.copyright.gov/circs/circ33.pdf) explains that ideas, methods, facts and short names are outside copyright protection, while an author's particular expression can be protected. Application-authored scopes and exercises should remain original; reference links do not license copied textbook prose. The source-specific semantic review is in `content-review.md`. Future content additions require the same boundary review.

## Remaining package work

Canvas and PDF.js have been replaced with pinned PDFium. The worker-only package retains exact wheel, font and runtime component notices, with author checks in `pdfium-review/`. The full release must also exclude research inputs and preserve all applicable dependency notices. Independent replacement and full-artifact audits remain required; this material-source review does not close those separate checks.
