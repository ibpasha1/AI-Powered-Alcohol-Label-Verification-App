# Label Check

Checks an alcohol beverage label against its COLA application and flags anything that does not match.

Live: https://alcohollabelverificationapp-8fc785c7bb37.herokuapp.com

## What it does

You type in what the application says, upload the label image, and get back a checklist of what
matched and what did not. There is also a batch mode that takes a spreadsheet plus a folder of
images, for importers who file a few hundred at once.

Node + Express on the back end, Vue 3 on the front, Claude vision for reading the label.

## Running it

Needs Node 22.

```bash
npm install
cp .env.example .env
npm run dev
```

Put your Anthropic API key in `.env` first. The API runs on port 3000 and the client on 5173.

Production build, single process on port 3000:

```bash
npm run build
npm start
```

Tests:

```bash
npm test
```

## How it works

The model only reads the label. It is told to transcribe exactly what is printed, including
mistakes, and not to judge compliance. Every pass/fail decision is made by plain JavaScript in
`server/src/rules/`, against constants taken from the CFR. 75 unit tests cover that logic and it
needs no network.

This matters most for the health warning. Asked "is this the government warning?", a model will say
yes to text that is subtly wrong, because wrong text still looks like the warning. So it transcribes
the warning verbatim and the rules do a word-by-word diff against the required wording. A single
substituted word gets caught and shown to the agent, struck through.

## What it checks

| Check | Reference |
|---|---|
| Mandatory information present | 5.63 / 4.32 / 7.63 |
| Brand name | 5.63(a)(1) |
| Class / type designation | 5.63(a)(2) |
| Alcohol content, with class-specific tolerance | 5.65(a), 4.36(b), 7.71 |
| Net contents, unit aware | 5.63(a)(4) |
| Standard of fill | 5.203 / 4.72 |
| Bottler name and address | 5.66 |
| Country of origin, imports only | 5.69 |
| Health warning present | 16.21 |
| Health warning wording | 16.21 |
| Health warning formatting | 16.22 |
| Sulfite declaration, wine only | 4.32(e) |
| Image legibility | — |

## Three outcomes, not two

A label comes back as **match**, **check this**, or **mismatch**.

The middle one exists because `STONE'S THROW` on a label and `Stone's Throw` on an application is
technically a mismatch and obviously the same product. Capitalisation, punctuation, a value inside
the regulatory tolerance, and near-identical strings all land there instead of failing. Nothing is
auto-approved either way: the output is a checklist for an agent, not a decision.

Three normalisations keep that middle category from filling up with noise. Curly quotes and dashes
are folded to ASCII. `DISTILLED AND BOTTLED BY OLD TOM DISTILLERY` matches an application that just
says `OLD TOM DISTILLERY`. `PRODUCT OF CHILE` matches a country recorded as `Chile`.

## Speed

The target was 5 seconds. Over 15 runs: median 3.1s, p90 3.8s, slowest 4.2s.

Two changes did most of that. The first version also asked the model to return every piece of text
on the label as one field, which no rule used and which cost 2.9s, since output tokens dominate the
latency here. Downscaling images to a 900px longest edge saved another 1.6s with no accuracy loss on
any sample, including the tilted photograph and the small warning text.

Haiku benchmarked slower than Sonnet here, because the bottleneck is generation rather than model
size, so Sonnet stayed. The rules engine runs in 1-2ms. Every response carries its own timings and
the UI shows elapsed time on each result.

## Batch mode

Download the CSV template, fill one row per application with a `file` column naming the image, then
upload the CSV and the images together. Extractions run concurrently, so four labels finish in about
3 seconds. Rows with no matching image and images with no matching row are both reported rather than
dropped, one bad row never fails the batch, and results export to CSV.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for the Claude provider |
| `EXTRACTION_PROVIDER` | `auto` | `claude`, `tesseract`, or `auto` |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | |
| `MAX_IMAGE_EDGE` | `900` | longest edge images are downscaled to |
| `EXTRACTION_TIMEOUT_MS` | `20000` | |
| `BATCH_CONCURRENCY` | `6` | |
| `MAX_UPLOAD_BYTES` | `12582912` | |
| `MAX_BATCH_FILES` | `60` | |

## Running without outbound network access

Extraction sits behind a small interface with two implementations, switched by one environment
variable. `claude` needs network access. `tesseract` runs locally in-process and needs none.

The local one is much weaker. It handles body text, alcohol statements, net contents and the warning
paragraph, but fails on the large letter-spaced type brand names are usually set in, and cannot
assess bold at all. When it cannot identify a field it returns nothing and the check says "not found
on the label" rather than guessing, because a confident wrong answer is what teaches people to stop
trusting the tool.

## Assumptions and limitations

- The CFR constants in `server/src/rules/reference.js` were written for this prototype and should be
  checked against the current regulations. They sit in one file so a compliance officer can review
  them without reading code.
- The CFR tolerances compare a label against the actual contents by analysis. Here they are applied
  to label-versus-application differences, as a proxy for "close enough that a human should decide".
- One image per application. Real filings have front, back and neck labels, so a correct filing with
  its warning on the back label would be flagged. Supporting multiple images is the first thing I
  would add.
- Bold type is judged from pixels. The model reports bold, not bold, or unsure, and unsure becomes
  "check this".
- Marketing claims, appellations, varietal percentages and age statements are not checked.
- No authentication, no audit trail, no COLA integration.
- Uploads are held in memory for the request only. Nothing is written to disk and there is no
  database.

## Layout

```
server/src/rules/        reference.js (CFR constants), text.js (parsing, diff), engine.js (checks)
server/src/extraction/   provider selection, claude.js, tesseract.js, heuristics.js
server/src/routes/       the HTTP surface
server/test/             75 tests
web/src/                 Vue client
samples/                 generated label images and their application data
```

## API

| | |
|---|---|
| `GET /api/health` | active provider and limits |
| `GET /api/samples` | built-in sample applications |
| `GET /api/batch-template.csv` | CSV template |
| `POST /api/verify` | one image plus application fields |
| `POST /api/verify/batch` | many images plus a CSV manifest |
