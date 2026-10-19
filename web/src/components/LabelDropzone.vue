<script setup>
import { ref } from 'vue';

const props = defineProps({
  file: { type: Object, default: null },
  previewUrl: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  accept: { type: String, default: 'image/*' },
  label: { type: String, default: 'Label photo or artwork' },
});

const emit = defineEmits(['select', 'clear']);

const input = ref(null);
const dragging = ref(false);

function openPicker() {
  input.value?.click();
}

function onPicked(event) {
  const files = Array.from(event.target.files ?? []);
  if (files.length > 0) emit('select', props.multiple ? files : files[0]);
  event.target.value = '';
}

function onDrop(event) {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) emit('select', props.multiple ? files : files[0]);
}
</script>

<template>
  <div>
    <button
      type="button"
      class="dropzone"
      :class="{ 'dropzone--active': dragging }"
      @click="openPicker"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <strong>{{ file || previewUrl ? 'Choose a different image' : 'Click here to choose an image' }}</strong>
      <span>or drag {{ multiple ? 'files' : 'a file' }} onto this box</span>
      <span>JPEG, PNG, WebP or TIFF</span>
    </button>

    <input
      ref="input"
      type="file"
      class="visually-hidden"
      :accept="accept"
      :multiple="multiple"
      :aria-label="label"
      @change="onPicked"
    />

    <div class="preview" v-if="previewUrl">
      <div class="preview__name">
        <span>{{ file?.name ?? 'Sample label' }}</span>
        <button type="button" class="link-button no-print" @click="emit('clear')">Remove</button>
      </div>
      <img :src="previewUrl" alt="The label image being checked" />
    </div>
  </div>
</template>
