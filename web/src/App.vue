<script setup>
import { ref } from 'vue';
import SingleCheck from './components/SingleCheck.vue';
import BatchCheck from './components/BatchCheck.vue';

const tab = ref('single');
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <div>
        <h1>Label Check</h1>
        <p>Compare a label against its application and flag anything that does not match.</p>
      </div>
    </div>
  </header>

  <main class="app-main">
    <div class="tabs no-print" role="tablist" aria-label="Choose how many labels to check">
      <button
        type="button"
        role="tab"
        id="tab-single"
        :aria-selected="tab === 'single'"
        aria-controls="panel-single"
        @click="tab = 'single'"
      >
        One label
      </button>
      <button
        type="button"
        role="tab"
        id="tab-batch"
        :aria-selected="tab === 'batch'"
        aria-controls="panel-batch"
        @click="tab = 'batch'"
      >
        A batch of labels
      </button>
    </div>

    <div v-show="tab === 'single'" id="panel-single" role="tabpanel" aria-labelledby="tab-single">
      <SingleCheck />
    </div>
    <div v-show="tab === 'batch'" id="panel-batch" role="tabpanel" aria-labelledby="tab-batch">
      <BatchCheck />
    </div>
  </main>
</template>
