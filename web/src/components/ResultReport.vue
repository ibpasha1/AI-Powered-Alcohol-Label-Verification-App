<script setup>
import { computed } from 'vue';
import CheckRow from './CheckRow.vue';

const props = defineProps({
  result: { type: Object, required: true },
  fileName: { type: String, default: '' },
});

const BANNERS = {
  pass: { icon: '✓', detail: 'Every item the application claims was found on the label and matches.' },
  review: { icon: '!', detail: 'Nothing is clearly wrong, but some items need an agent to confirm them.' },
  fail: { icon: '✕', detail: 'At least one item on the label contradicts the application or the regulations.' },
};

const banner = computed(() => BANNERS[props.result.overallStatus] ?? BANNERS.review);
const ordered = computed(() => {
  const rank = { fail: 0, review: 1, pass: 2, not_checked: 3 };
  return [...props.result.checks].sort((a, b) => rank[a.status] - rank[b.status]);
});
const seconds = computed(() => (props.result.meta.timings.totalMs / 1000).toFixed(1));

const extractionView = computed(() => {
  const prune = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, prune(inner)]).filter(([, inner]) => inner !== ''));
    }
    return value;
  };
  return prune(props.result.extraction);
});
</script>

<template>
  <section class="panel" aria-labelledby="result-heading">
    <div class="banner" :class="`banner--${result.overallStatus}`" role="status">
      <span class="banner__icon" aria-hidden="true">{{ banner.icon }}</span>
      <div>
        <h2 id="result-heading">{{ result.headline }}</h2>
        <p>{{ banner.detail }}</p>
      </div>
    </div>

    <div class="counts">
      <div class="count">
        <span class="count__value">{{ result.summary.fail }}</span>
        <span class="count__label">Mismatches</span>
      </div>
      <div class="count">
        <span class="count__value">{{ result.summary.review }}</span>
        <span class="count__label">To check</span>
      </div>
      <div class="count">
        <span class="count__value">{{ result.summary.pass }}</span>
        <span class="count__label">Matched</span>
      </div>
      <div class="count">
        <span class="count__value">{{ seconds }}s</span>
        <span class="count__label">Time taken</span>
      </div>
    </div>

    <ul class="check-list">
      <CheckRow v-for="check in ordered" :key="check.id" :check="check" />
    </ul>

    <details class="raw">
      <summary>What the reader pulled off the label</summary>
      <pre>{{ JSON.stringify(extractionView, null, 2) }}</pre>
    </details>

    <div class="meta-strip">
      <span v-if="fileName">File: {{ fileName }}</span>
      <span>Read by: {{ result.meta.providerLabel }}</span>
      <span>Reading: {{ result.meta.timings.extractMs }} ms</span>
      <span>Rule checks: {{ result.meta.timings.validateMs }} ms</span>
      <span>Total: {{ result.meta.timings.totalMs }} ms</span>
    </div>
  </section>
</template>
