<script setup>
import { computed, onMounted, ref } from 'vue';
import { getSamples, verifyLabel } from '../api.js';
import LabelDropzone from './LabelDropzone.vue';
import ResultReport from './ResultReport.vue';

const BEVERAGE_CLASSES = [
  { value: 'distilled_spirits', label: 'Distilled spirits' },
  { value: 'wine', label: 'Wine' },
  { value: 'malt_beverage', label: 'Malt beverage' },
];

const blankApplication = () => ({
  applicationId: '',
  beverageClass: 'distilled_spirits',
  brandName: '',
  classType: '',
  alcoholContentAbv: '',
  netContents: '',
  bottlerName: '',
  bottlerAddress: '',
  isImported: false,
  countryOfOrigin: '',
});

const application = ref(blankApplication());
const file = ref(null);
const previewUrl = ref('');
const result = ref(null);
const errorMessage = ref('');
const fieldErrors = ref({});
const busy = ref(false);
const samples = ref([]);
const checkedFileName = ref('');

const canSubmit = computed(() => Boolean(file.value) && !busy.value);

onMounted(async () => {
  try {
    samples.value = await getSamples();
  } catch {
    samples.value = [];
  }
});

function setFile(picked) {
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value);
  file.value = picked;
  previewUrl.value = URL.createObjectURL(picked);
  result.value = null;
  errorMessage.value = '';
}

function clearFile() {
  if (previewUrl.value.startsWith('blob:')) URL.revokeObjectURL(previewUrl.value);
  file.value = null;
  previewUrl.value = '';
  result.value = null;
}

function printReport() {
  window.print();
}

function resetAll() {
  clearFile();
  application.value = blankApplication();
  errorMessage.value = '';
  fieldErrors.value = {};
}

async function loadSample(sample) {
  busy.value = true;
  errorMessage.value = '';
  try {
    const response = await fetch(sample.imageUrl);
    if (!response.ok) throw new Error('Could not load that sample.');
    const blob = await response.blob();
    const sampleFile = new File([blob], `${sample.id}.jpg`, { type: blob.type || 'image/jpeg' });
    application.value = { ...blankApplication(), ...sample.application };
    fieldErrors.value = {};
    setFile(sampleFile);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (!file.value) {
    errorMessage.value = 'Please choose a label image first.';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  fieldErrors.value = {};
  result.value = null;

  try {
    const response = await verifyLabel(application.value, file.value);
    result.value = response;
    checkedFileName.value = response.fileName ?? file.value.name;
  } catch (error) {
    errorMessage.value = error.message;
    fieldErrors.value = Object.fromEntries((error.fieldErrors ?? []).map((entry) => [entry.field, entry.message]));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel no-print" v-if="samples.length > 0" aria-labelledby="samples-heading">
    <h2 id="samples-heading">Try it with a sample</h2>
    <p class="panel__hint">
      Each sample fills in the application details and loads a matching label image, so you can see what the
      tool does before using your own files.
    </p>
    <ul class="sample-list">
      <li v-for="sample in samples" :key="sample.id">
        <button type="button" class="sample" :disabled="busy" @click="loadSample(sample)">
          <span class="sample__title">{{ sample.title }}</span>
          <span class="sample__note">{{ sample.expectation }}</span>
        </button>
      </li>
    </ul>
  </section>

  <form class="panel" @submit.prevent="submit" aria-labelledby="form-heading">
    <h2 id="form-heading">Step 1 — Application details</h2>
    <p class="panel__hint">Type in what the application form says. The tool compares these against the label.</p>

    <div class="grid-two">
      <div>
        <div class="field">
          <label for="applicationId">Application number <span class="hint">Optional. Used to label the report.</span></label>
          <input id="applicationId" type="text" v-model="application.applicationId" autocomplete="off" />
        </div>

        <div class="field">
          <label for="beverageClass">Beverage type</label>
          <select id="beverageClass" v-model="application.beverageClass">
            <option v-for="option in BEVERAGE_CLASSES" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field" :class="{ 'field--error': fieldErrors.brandName }">
          <label for="brandName">Brand name</label>
          <input id="brandName" type="text" v-model="application.brandName" autocomplete="off" />
          <p class="field__error" v-if="fieldErrors.brandName">{{ fieldErrors.brandName }}</p>
        </div>

        <div class="field">
          <label for="classType">Class or type <span class="hint">For example: Kentucky Straight Bourbon Whiskey</span></label>
          <input id="classType" type="text" v-model="application.classType" autocomplete="off" />
        </div>

        <div class="field" :class="{ 'field--error': fieldErrors.alcoholContentAbv }">
          <label for="alcoholContentAbv">Alcohol content <span class="hint">Percent alcohol by volume, for example 45</span></label>
          <input id="alcoholContentAbv" type="number" step="0.1" min="0" max="100" v-model="application.alcoholContentAbv" />
          <p class="field__error" v-if="fieldErrors.alcoholContentAbv">{{ fieldErrors.alcoholContentAbv }}</p>
        </div>

        <div class="field" :class="{ 'field--error': fieldErrors.netContents }">
          <label for="netContents">Net contents <span class="hint">For example: 750 mL</span></label>
          <input id="netContents" type="text" v-model="application.netContents" autocomplete="off" />
          <p class="field__error" v-if="fieldErrors.netContents">{{ fieldErrors.netContents }}</p>
        </div>
      </div>

      <div>
        <div class="field">
          <label for="bottlerName">Bottler or producer <span class="hint">As written on the application</span></label>
          <input id="bottlerName" type="text" v-model="application.bottlerName" autocomplete="off" />
        </div>

        <div class="field">
          <label for="bottlerAddress">City and state</label>
          <input id="bottlerAddress" type="text" v-model="application.bottlerAddress" autocomplete="off" />
        </div>

        <div class="checkbox-row">
          <input id="isImported" type="checkbox" v-model="application.isImported" />
          <label for="isImported">This is an imported product</label>
        </div>

        <div class="field" v-if="application.isImported" :class="{ 'field--error': fieldErrors.countryOfOrigin }">
          <label for="countryOfOrigin">Country of origin</label>
          <input id="countryOfOrigin" type="text" v-model="application.countryOfOrigin" autocomplete="off" />
          <p class="field__error" v-if="fieldErrors.countryOfOrigin">{{ fieldErrors.countryOfOrigin }}</p>
        </div>

        <h2 id="upload-heading" style="margin-top: 26px">Step 2 — Label image</h2>
        <p class="panel__hint">A photo or the artwork file. Slight angles and uneven lighting are fine.</p>
        <LabelDropzone
          :file="file"
          :preview-url="previewUrl"
          label="Label photo or artwork"
          @select="setFile"
          @clear="clearFile"
        />
      </div>
    </div>

    <div class="banner banner--error" v-if="errorMessage" role="alert">
      <span class="banner__icon" aria-hidden="true">!</span>
      <div>
        <h2>We could not check that label</h2>
        <p>{{ errorMessage }}</p>
      </div>
    </div>

    <div class="button-row no-print" style="margin-top: 18px">
      <button type="submit" class="button button--primary" :disabled="!canSubmit">
        <span class="spinner" v-if="busy" aria-hidden="true"></span>
        {{ busy ? 'Checking the label…' : 'Check this label' }}
      </button>
      <button type="button" class="button button--secondary" @click="resetAll" :disabled="busy">Start over</button>
      <button type="button" class="button button--secondary" v-if="result" @click="printReport">Print report</button>
    </div>
  </form>

  <ResultReport v-if="result" :result="result" :file-name="checkedFileName" />
</template>
