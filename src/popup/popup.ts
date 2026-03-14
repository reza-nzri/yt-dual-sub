import { SUPPORTED_LANGUAGES } from '../shared/constants';
import { getSettings, saveSettings } from '../shared/storage';
import type { UserSettings } from '../shared/types';

const LOG_PREFIX = '[YT Dual Sub][popup]';

const elements = {
  enabled: document.getElementById('enabled') as HTMLInputElement,
  targetLanguage: document.getElementById('targetLanguage') as HTMLSelectElement,
  showOriginal: document.getElementById('showOriginal') as HTMLInputElement,
  showTranslated: document.getElementById('showTranslated') as HTMLInputElement,
  hideNativeSubtitles: document.getElementById('hideNativeSubtitles') as HTMLInputElement,
  fontFamily: document.getElementById('fontFamily') as HTMLInputElement,
  originalFontSizePx: document.getElementById('originalFontSizePx') as HTMLInputElement,
  translatedFontSizePx: document.getElementById('translatedFontSizePx') as HTMLInputElement,
  gapPx: document.getElementById('gapPx') as HTMLInputElement,
  bottomOffsetPx: document.getElementById('bottomOffsetPx') as HTMLInputElement,
  originalColor: document.getElementById('originalColor') as HTMLInputElement,
  translatedColor: document.getElementById('translatedColor') as HTMLInputElement,
  textAlign: document.getElementById('textAlign') as HTMLSelectElement,
  layout: document.getElementById('layout') as HTMLSelectElement,
  status: document.getElementById('status') as HTMLParagraphElement,
  originalFontSizePxValue: document.getElementById('originalFontSizePxValue') as HTMLElement,
  translatedFontSizePxValue: document.getElementById('translatedFontSizePxValue') as HTMLElement,
  gapPxValue: document.getElementById('gapPxValue') as HTMLElement,
  bottomOffsetPxValue: document.getElementById('bottomOffsetPxValue') as HTMLElement,
};

const AUTO_SAVE_DEBOUNCE_MS = 280;

let baseSettings: UserSettings;
let lastSavedSignature = '';
let saveDebounceTimer = 0;
let statusTimer = 0;
let isSaving = false;
let queuedSettings: UserSettings | null = null;

const liveFields: Array<HTMLInputElement | HTMLSelectElement> = [
  elements.enabled,
  elements.targetLanguage,
  elements.showOriginal,
  elements.showTranslated,
  elements.hideNativeSubtitles,
  elements.fontFamily,
  elements.originalFontSizePx,
  elements.translatedFontSizePx,
  elements.gapPx,
  elements.bottomOffsetPx,
  elements.originalColor,
  elements.translatedColor,
  elements.textAlign,
  elements.layout,
];

function renderLanguageOptions(): void {
  console.log(`${LOG_PREFIX} renderLanguageOptions:start`, {
    count: SUPPORTED_LANGUAGES.length,
  });
  elements.targetLanguage.innerHTML = '';

  for (const language of SUPPORTED_LANGUAGES) {
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = language.label;
    elements.targetLanguage.appendChild(option);
  }

  console.log(`${LOG_PREFIX} renderLanguageOptions:done`);
}

function updateRangeLabels(): void {
  elements.originalFontSizePxValue.textContent = `${elements.originalFontSizePx.value}px`;
  elements.translatedFontSizePxValue.textContent = `${elements.translatedFontSizePx.value}px`;
  elements.gapPxValue.textContent = `${elements.gapPx.value}px`;
  elements.bottomOffsetPxValue.textContent = `${elements.bottomOffsetPx.value}px`;

  console.log(`${LOG_PREFIX} updateRangeLabels`, {
    originalFontSizePx: elements.originalFontSizePx.value,
    translatedFontSizePx: elements.translatedFontSizePx.value,
    gapPx: elements.gapPx.value,
    bottomOffsetPx: elements.bottomOffsetPx.value,
  });
}

function fillForm(settings: UserSettings): void {
  console.log(`${LOG_PREFIX} fillForm`, settings);
  elements.enabled.checked = settings.enabled;
  elements.targetLanguage.value = settings.targetLanguage;
  elements.showOriginal.checked = settings.showOriginal;
  elements.showTranslated.checked = settings.showTranslated;
  elements.hideNativeSubtitles.checked = settings.hideNativeSubtitles;
  elements.fontFamily.value = settings.fontFamily;
  elements.originalFontSizePx.value = String(settings.originalFontSizePx);
  elements.translatedFontSizePx.value = String(settings.translatedFontSizePx);
  elements.gapPx.value = String(settings.gapPx);
  elements.bottomOffsetPx.value = String(settings.bottomOffsetPx);
  elements.originalColor.value = settings.originalColor;
  elements.translatedColor.value = settings.translatedColor;
  elements.textAlign.value = settings.textAlign;
  elements.layout.value = settings.layout;

  updateRangeLabels();
}

function readForm(): UserSettings {
  const next = {
    enabled: elements.enabled.checked,
    targetLanguage: elements.targetLanguage.value,
    showOriginal: elements.showOriginal.checked,
    showTranslated: elements.showTranslated.checked,
    hideNativeSubtitles: elements.hideNativeSubtitles.checked,
    fontFamily: elements.fontFamily.value.trim() || 'Arial, Tahoma, sans-serif',
    originalFontSizePx: Number(elements.originalFontSizePx.value),
    translatedFontSizePx: Number(elements.translatedFontSizePx.value),
    gapPx: Number(elements.gapPx.value),
    bottomOffsetPx: Number(elements.bottomOffsetPx.value),
    originalColor: elements.originalColor.value,
    translatedColor: elements.translatedColor.value,
    textAlign: elements.textAlign.value as UserSettings['textAlign'],
    layout: elements.layout.value as UserSettings['layout'],
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingPx: 10,
    borderRadiusPx: 12,
    maxWidthPercent: 82,
  };

  console.log(`${LOG_PREFIX} readForm`, next);
  return next;
}

function setStatus(message: string): void {
  elements.status.textContent = message;
  if (statusTimer) {
    window.clearTimeout(statusTimer);
  }

  if (!message) return;

  statusTimer = window.setTimeout(() => {
    elements.status.textContent = '';
  }, 900);
}

async function flushQueuedSaves(): Promise<void> {
  if (isSaving) return;
  isSaving = true;

  try {
    while (queuedSettings) {
      const next = queuedSettings;
      queuedSettings = null;

      console.log(`${LOG_PREFIX} autosave:start`, next);
      setStatus('Saving...');
      await saveSettings(next);

      baseSettings = next;
      lastSavedSignature = JSON.stringify(next);

      console.log(`${LOG_PREFIX} autosave:done`);
      setStatus('Auto-saved');
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} autosave:failed`, error);
    setStatus('Save failed');
  } finally {
    isSaving = false;
  }
}

function scheduleAutosave(): void {
  if (saveDebounceTimer) {
    window.clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = window.setTimeout(() => {
    const next: UserSettings = {
      ...baseSettings,
      ...readForm(),
    };

    const nextSignature = JSON.stringify(next);
    if (nextSignature === lastSavedSignature) {
      console.log(`${LOG_PREFIX} autosave:skip unchanged`);
      return;
    }

    queuedSettings = next;
    void flushQueuedSaves();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

function onLiveFieldChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (
    target === elements.originalFontSizePx ||
    target === elements.translatedFontSizePx ||
    target === elements.gapPx ||
    target === elements.bottomOffsetPx
  ) {
    updateRangeLabels();
  }

  console.log(`${LOG_PREFIX} live change`, {
    id: target.id,
    eventType: event.type,
  });

  scheduleAutosave();
}

async function init(): Promise<void> {
  console.log(`${LOG_PREFIX} init:start`);
  renderLanguageOptions();

  const settings = await getSettings();
  baseSettings = settings;
  lastSavedSignature = JSON.stringify(settings);

  console.log(`${LOG_PREFIX} init:settings loaded`, settings);
  fillForm(settings);

  for (const field of liveFields) {
    field.addEventListener('input', onLiveFieldChange);
    field.addEventListener('change', onLiveFieldChange);
    console.log(`${LOG_PREFIX} live listener attached`, { id: field.id });
  }

  window.addEventListener('beforeunload', () => {
    if (saveDebounceTimer) {
      window.clearTimeout(saveDebounceTimer);
      saveDebounceTimer = 0;
    }
  });

  console.log(`${LOG_PREFIX} init:done`);
}

void init();