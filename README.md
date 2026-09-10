# Comelibro

Learn enough Spanish to understand a passage, then return to the book. The app combines document-specific lessons, supported reading, vocabulary review and account-level evidence about narrow language objectives.

Implementation and independent verification are in progress. `goal_prompt.md` is the required scope; `BUILD_PLAN.md` tracks completion. Public AI execution remains disabled until the support and isolation questions in `RUNTIME_GATE.md` are resolved.

## Run locally

Use Node.js 22.13 or newer. Install the lockfile dependencies, build the frontend, then start the same-origin application:

```sh
npm ci
npm run build
APP_ORIGIN=http://127.0.0.1:3300 npm start
```

Open `http://127.0.0.1:3300`. The backend binds to localhost. Private SQLite data and uploads default to the ignored `runtime/` directory; `DATA_DIR` can select a separate private directory. Do not serve that directory or the repository through a static web server.

PDF processing additionally requires Python 3, Bubblewrap, Tesseract, the included Spanish traineddata and the exact wheel pinned in `requirements-pdf.txt`, installed under `runtime/pdfium`. Installation, build hashes, retained licenses and resource limits are documented in [the PDF runtime record](evidence/pdfium-review/README.md). The wheel and host tools are already installed on this VPS; `npm ci` alone does not install them on another machine.

Real account verification and password recovery require SMTP configuration. The service uses authenticated STARTTLS with certificate validation; its configuration names are in `server/mail.mjs`. Synthetic email capture is permitted only in isolated tests. Never put credentials in this repository or browser code.

## Use the app

- Explore the complete narrative of Don Quixote without an account.
- Register, verify the email address, and complete the resumable placement check to start account-based learning.
- Study the reviewed opening lessons, or upload a Spanish PDF of up to 10 pages and 5 MB. Check the extracted text before requesting a document-specific lesson.
- Return to reading at any time. Change the theme, text size and spacing in settings. Save vocabulary for spaced recall.
- Authorized administrators can inspect learning evidence, AI activity, review decisions and processing controls.

Live AI capabilities are shown according to the server's actual capability status. Existing lessons and reading remain usable when processing is unavailable. A successful private runtime test does not authorize public account-backed execution.

## Content and evidence

The imported novel contains 126 narrative chapters and 8,953 automated sentence segments. Each segment has its source start page. These counts do not establish that every linguistic sentence boundary is correct. The first three sentences have a reviewed authored curriculum; later narrative segments are available for reading and on-demand work without a claim of complete manual annotation.

Independent AI semantic review covers 15 objectives, 31 questions, three lessons and 21 glossary entries. The receipts identify exact versions. They are not a human-review claim or evidence of educational effectiveness.

Vocabulary self-ratings update FSRS scheduling. Scored first, unaided responses update BKT estimates for their declared narrow objective. Model parameters and readiness thresholds are provisional; they are not certified Spanish levels. Assistance, repeated answers and ordinary vocabulary ratings do not become fresh grammar mastery evidence.

## Verification and delivery records

- `API.md`: application and worker contracts.
- `STATE_GRAPH.md`: required visible states, transitions and fault cases.
- `BLIND_TEST_PROTOCOL.md`: independent exploratory cohort conditions.
- `evidence/`: semantic, backend, runtime and subsequent browser evidence.
- `presentation/`: separate slide content and the single three-minute demonstration script.

Run `npm test` for backend/runtime checks. Live existing-account runtime checks require the explicit test switch described in `evidence/runtime/README.md`. `node content/check.mjs` checks the authored content and source import against the local research artifacts. Browser evidence must include the screenshot evaluations required by the state graph; a frontend build alone does not establish that those journeys pass.

The final demonstration requires the owner's actual narration and reading footage. Submission is a separate action, and no submission has been made by building this app.
