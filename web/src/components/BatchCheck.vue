<script setup>
import { computed, ref } from 'vue';
import { verifyBatch } from '../api.js';
import StatusPill from './StatusPill.vue';
import ResultReport from './ResultReport.vue';

const images = ref([]);
const manifest = ref(null);
const response = ref(null);
const errorMessage = ref('');
const busy = ref(false);
const expanded = ref(null);

const imageInput = ref(null);
const manifestInput = ref(null);

const canSubmit = computed(() => images.value.length > 0 && manifest.value !== null && !busy.value);

function pickImages(event) {
  images.value = Array.from(event.target.files ?? []);
  response.value = null;
  errorMessage.value = '';
}

function pickManifest(event) {
  manifest.value = event.target.files?.[0] ?? null;
  response.value = null;
  errorMessage.value = '';
}

function reset() {
  images.value = [];
  manifest.value = null;
  response.value = null;
  errorMessage.value = '';
  expanded.value = null;
  if (imageInput.value) imageInput.value.value = '';
  if (manifestInput.value) manifestInput.value.value = '';
}

async function submit() {
  busy.value = true;
  errorMessage.value = '';
  response.value = null;
  expanded.value = null;
  try {
    response.value = await verifyBatch(images.value, manifest.value);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    busy.value = false;
  }
}

function toggle(row) {
  expanded.value = expanded.value === row ? null : row;
}

function downloadCsv() {
  if (!response.value) return;
  const headers = [
    'row', 'applicationId', 'file', 'brandName', 'outcome',
    'mismatches', 'toCheck', 'matched', 'failedChecks', 'itemsToCheck', 'seconds', 'error',
  ];
  const OUTCOMES = { pass: 'No discrepancies', review: 'Needs a human look', fail: 'Discrepancies found' };

  const rows = response.value.results.map((item) => {
    if (!item.ok) {
      return [item.row, item.applicationId ?? '', item.fileName, item.brandName, 'Not processed', '', '', '', '', '', '', item.error];
    }
    const failed = item.result.checks.filter((check) => check.status === 'fail').map((check) => check.title);
    const review = item.result.checks.filter((check) => check.status === 'review').map((check) => check.title);
    return [
      item.row,
      item.applicationId ?? '',
      item.fileName,
      item.brandName,
      OUTCOMES[item.result.overallStatus],
      item.result.summary.fail,
      item.result.summary.review,
      item.result.summary.pass,
      failed.join('; '),
      review.join('; '),
      (item.result.meta.timings.totalMs / 1000).toFixed(1),
      '',
    ];
  });

  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'label-check-results.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

const OUTCOME_TEXT = {
  pass: 'No discrepancies',
  review: 'Needs a human look',
  fail: 'Discrepancies found',
};
</script>

<template>
  <section class="panel" aria-labelledby="batch-heading">
    <h2 id="batch-heading">Check a batch of applications</h2>
    <p class="panel__hint">
      For importers who send many applications at once. Upload one spreadsheet of application details and all the
      matching label images. The <code>file</code> column in the spreadsheet must hold each image's file name.
    </p>

    <div class="button-row" style="margin-bottom: 20px">
      <a class="button button--secondary" href="/api/batch-template.csv" download>Download the spreadsheet template</a>
    </div>

    <div class="grid-two">
      <div class="field">
        <label for="batchManifest">Step 1 — Application spreadsheet (CSV)</label>
        <input id="batchManifest" ref="manifestInput" type="file" accept=".csv,text/csv" @change="pickManifest" />
        <span class="hint" v-if="manifest">Selected: {{ manifest.name }}</span>
      </div>

      <div class="field">
        <label for="batchImages">Step 2 — Label images</label>
        <input id="batchImages" ref="imageInput" type="file" accept="image/*" multiple @change="pickImages" />
        <span class="hint" v-if="images.length > 0">{{ images.length }} image{{ images.length === 1 ? '' : 's' }} selected</span>
      </div>
    </div>

    <div class="banner banner--error" v-if="errorMessage" role="alert">
      <span class="banner__icon" aria-hidden="true">!</span>
      <div>
        <h2>We could not run that batch</h2>
        <p>{{ errorMessage }}</p>
      </div>
    </div>

    <div class="button-row">
      <button type="button" class="button button--primary" :disabled="!canSubmit" @click="submit">
        <span class="spinner" v-if="busy" aria-hidden="true"></span>
        {{ busy ? 'Checking labels…' : 'Check all labels' }}
      </button>
      <button type="button" class="button button--secondary" :disabled="busy" @click="reset">Start over</button>
    </div>
  </section>

  <section class="panel" v-if="response" aria-labelledby="batch-results-heading">
    <h2 id="batch-results-heading">Batch results</h2>

    <div class="counts">
      <div class="count">
        <span class="count__value">{{ response.counts.fail }}</span>
        <span class="count__label">With discrepancies</span>
      </div>
      <div class="count">
        <span class="count__value">{{ response.counts.review }}</span>
        <span class="count__label">Need a look</span>
      </div>
      <div class="count">
        <span class="count__value">{{ response.counts.pass }}</span>
        <span class="count__label">Clean</span>
      </div>
      <div class="count">
        <span class="count__value">{{ response.counts.failed }}</span>
        <span class="count__label">Not processed</span>
      </div>
      <div class="count">
        <span class="count__value">{{ (response.totalMs / 1000).toFixed(1) }}s</span>
        <span class="count__label">Total time</span>
      </div>
    </div>

    <p v-if="response.unmatchedFiles.length > 0" class="panel__hint">
      These images had no matching row in the spreadsheet and were skipped:
      {{ response.unmatchedFiles.join(', ') }}
    </p>

    <div class="button-row no-print" style="margin-bottom: 16px">
      <button type="button" class="button button--secondary" @click="downloadCsv">Download results as CSV</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Application</th>
            <th scope="col">Brand</th>
            <th scope="col">Outcome</th>
            <th scope="col">What to look at</th>
            <th scope="col" class="no-print">Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in response.results" :key="item.row">
            <td>{{ item.row }}</td>
            <td>
              {{ item.applicationId || '—' }}
              <br />
              <span class="sample__note">{{ item.fileName }}</span>
            </td>
            <td>{{ item.brandName || '—' }}</td>
            <td>
              <StatusPill v-if="item.ok" :status="item.result.overallStatus" />
              <span v-else class="pill pill--fail"><span aria-hidden="true">!</span> Not processed</span>
              <div v-if="item.ok" class="sample__note">{{ OUTCOME_TEXT[item.result.overallStatus] }}</div>
            </td>
            <td>
              <template v-if="item.ok">
                <ul class="detail-list" v-if="item.result.summary.fail + item.result.summary.review > 0">
                  <li v-for="check in item.result.checks.filter((entry) => entry.status === 'fail' || entry.status === 'review')" :key="check.id">
                    {{ check.title }}
                  </li>
                </ul>
                <span v-else>Nothing flagged</span>
              </template>
              <span v-else>{{ item.error }}</span>
            </td>
            <td class="no-print">
              <button v-if="item.ok" type="button" class="link-button" @click="toggle(item.row)">
                {{ expanded === item.row ? 'Hide' : 'Open' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-for="item in response.results" :key="`detail-${item.row}`">
      <ResultReport v-if="item.ok && expanded === item.row" :result="item.result" :file-name="item.fileName" />
    </template>
  </section>
</template>
