<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, required: true },
});

const LABELS = {
  pass: { text: 'Match', icon: '✓' },
  review: { text: 'Check this', icon: '!' },
  fail: { text: 'Mismatch', icon: '✕' },
  not_checked: { text: 'Not applicable', icon: '–' },
};

const display = computed(() => LABELS[props.status] ?? LABELS.not_checked);
</script>

<template>
  <span class="pill" :class="`pill--${status}`">
    <span aria-hidden="true">{{ display.icon }}</span>
    {{ display.text }}
  </span>
</template>
