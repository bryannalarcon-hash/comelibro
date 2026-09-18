# Comelibro

Comelibro turns a Spanish book or short PDF into a reading plan. It teaches the vocabulary and grammar needed for a passage, lets the reader ask for help without leaving the text, and schedules later review from demonstrated knowledge.

Try it at [comelibro.bryannalarcon.com](https://comelibro.bryannalarcon.com). The home page includes a prepared Don Quixote plan and a temporary demo account.

## How it works

- Upload a Spanish PDF of up to 10 pages and 5 MB, or use the included Don Quixote text.
- The bounded AI worker removes extraction artifacts, divides the document into sections, and proposes short lessons from the source text.
- Bayesian Knowledge Tracing (BKT) records evidence for each grammar or vocabulary objective. Recently mastered objectives are left out of new questions until a later check is due.
- FSRS schedules generated review cards from the learner's answers.
- The reader includes word help, translation, adjustable type, spacing, and dark mode.
- Administrators can inspect AI calls, tool use, review decisions, and learning evidence.

The repository includes the React interface, Express and SQLite backend, bounded AI worker, Spanish source content, focused tests, and deployment configuration. Runtime data, uploads, research, internal plans, screenshots, and presentation media stay outside Git.

## Run locally

Use Node.js 22.13 or newer:

```sh
npm ci
npm run build
APP_ORIGIN=http://127.0.0.1:3300 npm start
```

Open `http://127.0.0.1:3300`. The server binds to `127.0.0.1`, and private data defaults to the ignored `runtime/` directory. PDF ingestion also needs Python 3, Bubblewrap, Tesseract, Spanish OCR data, and the PDFium package pinned in `requirements-pdf.txt`.

AI document processing runs through the separate Unix-socket worker in `server/ai-worker.mjs`. Example service and environment files are in `deploy/`; credentials belong in the service environment and must not be committed.

## Check the app

```sh
npm test
npm run build
node --test tests/ui-responsive.test.mjs tests/profile-settings-browser.test.mjs
```

Third-party license information is in `THIRD_PARTY_NOTICES.md` and the retained PDFium notices under `evidence/pdfium-review/`.
