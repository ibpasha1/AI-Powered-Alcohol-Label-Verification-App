<script setup>
defineProps({
  operations: { type: Array, required: true },
});
</script>

<template>
  <div class="diff">
    <p class="diff__legend">
      Compared word by word against the statement required by 27 CFR 16.21.
      <span class="diff__word--missing">struck through</span> = required but missing from the label.
      <span class="diff__word--extra">highlighted</span> = on the label but not in the required text.
    </p>
    <p>
      <template v-for="(operation, index) in operations" :key="index">
        <span v-if="operation.type === 'same'">{{ operation.text }} </span>
        <span v-else-if="operation.type === 'missing'" class="diff__word--missing">{{ operation.text }}</span>
        <span v-else class="diff__word--extra">{{ operation.text }}</span>
        <template v-if="operation.type !== 'same'"> </template>
      </template>
    </p>
  </div>
</template>
