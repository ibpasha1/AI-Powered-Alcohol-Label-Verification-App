async function readError(response) {
  try {
    const body = await response.json();
    return body.error || body.message || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export async function getSamples() {
  const response = await fetch('/api/samples');
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function verifyLabel(application, file) {
  const form = new FormData();
  Object.entries(application).forEach(([key, value]) => {
    form.append(key, value === null || value === undefined ? '' : String(value));
  });
  form.append('label', file, file.name);

  const response = await fetch('/api/verify', { method: 'POST', body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error ?? `Request failed (${response.status}).`);
    error.fieldErrors = body?.fieldErrors ?? [];
    throw error;
  }
  return body;
}

export async function verifyBatch(files, manifestFile) {
  const form = new FormData();
  files.forEach((file) => form.append('labels', file, file.name));
  form.append('manifest', manifestFile, manifestFile.name);

  const response = await fetch('/api/verify/batch', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
