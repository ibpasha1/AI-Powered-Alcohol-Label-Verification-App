<script setup>
import StatusPill from './StatusPill.vue';
import WarningDiff from './WarningDiff.vue';

defineProps({
  check: { type: Object, required: true },
});
</script>

<template>
  <li class="check" :class="`check--${check.status}`">
    <div class="check__head">
      <span class="check__title">{{ check.title }}</span>
      <span class="check__citation" v-if="check.citation">{{ check.citation }}</span>
      <StatusPill :status="check.status" />
    </div>

    <p class="check__message">{{ check.message }}</p>

    <div
      class="compare"
      v-if="check.status !== 'not_checked' && (check.applicationValue || check.labelValue)"
    >
      <div class="compare__cell">
        <span class="compare__label">Application says</span>
        <span v-if="check.applicationValue" class="compare__value">{{ check.applicationValue }}</span>
        <span v-else class="compare__value compare__value--empty">not provided</span>
      </div>
      <div class="compare__cell">
        <span class="compare__label">Label says</span>
        <span v-if="check.labelValue" class="compare__value">{{ check.labelValue }}</span>
        <span v-else class="compare__value compare__value--empty">nothing found</span>
      </div>
    </div>

    <WarningDiff
      v-if="check.detail && check.detail.type === 'word_diff' && check.status !== 'pass'"
      :operations="check.detail.operations"
    />

    <ul class="detail-list" v-if="check.detail && check.detail.type === 'missing_fields'">
      <li v-for="field in check.detail.fields" :key="field">{{ field }}</li>
    </ul>

    <ul class="detail-list" v-if="check.detail && check.detail.type === 'issues'">
      <li v-for="issue in check.detail.issues" :key="issue">{{ issue }}</li>
    </ul>
  </li>
</template>
