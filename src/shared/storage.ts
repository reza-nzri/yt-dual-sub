import { DEFAULT_SETTINGS, STORAGE_KEY } from './constants';
import type { UserSettings } from './types';

const LOG_PREFIX = '[YT Dual Sub][storage]';

export async function getSettings(): Promise<UserSettings> {
  console.log(`${LOG_PREFIX} getSettings:start`);
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEY] ?? {}),
  };

  console.log(`${LOG_PREFIX} getSettings:done`, {
    exists: Boolean(result[STORAGE_KEY]),
    settings: merged,
  });

  return merged;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  console.log(`${LOG_PREFIX} saveSettings:start`, settings);
  await chrome.storage.sync.set({
    [STORAGE_KEY]: settings,
  });
  console.log(`${LOG_PREFIX} saveSettings:done`);
}

export async function patchSettings(
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  console.log(`${LOG_PREFIX} patchSettings:start`, patch);
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  console.log(`${LOG_PREFIX} patchSettings:done`, next);
  return next;
}

export function onSettingsChanged(
  callback: (settings: UserSettings) => void,
): void {
  console.log(`${LOG_PREFIX} onSettingsChanged:listener registered`);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      console.log(`${LOG_PREFIX} onChanged:ignored area`, areaName);
      return;
    }

    if (!changes[STORAGE_KEY]) {
      console.log(`${LOG_PREFIX} onChanged:ignored key`, Object.keys(changes));
      return;
    }

    const newValue = changes[STORAGE_KEY].newValue;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(newValue ?? {}),
    };

    console.log(`${LOG_PREFIX} onChanged:emit`, merged);
    callback(merged);
  });
}