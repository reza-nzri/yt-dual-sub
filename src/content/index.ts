import './styles.css';

import {
  fetchSubtitleCues,
  buildOriginalTrackUrl,
  buildTranslatedTrackUrl,
} from './captions';
import { SubtitleOverlay } from './overlay';
import { findActiveCue } from './renderer';
import { getSettings, onSettingsChanged } from '../shared/storage';
import type {
  BridgeState,
  BridgeStateEventDetail,
  SubtitleCue,
  UserSettings,
} from '../shared/types';

const BRIDGE_EVENT_NAME = 'yt-dual-sub-state';
const LOG_PREFIX = '[YT Dual Sub][content]';

const overlay = new SubtitleOverlay();

let settings: UserSettings;
let latestState: BridgeState | null = null;
let originalCues: SubtitleCue[] = [];
let translatedCues: SubtitleCue[] = [];
let currentTrackKey = '';
let currentVideoId: string | null = null;
let animationFrameId = 0;
let lastRenderKey = '';

async function bootstrap(): Promise<void> {
  console.log(`${LOG_PREFIX} bootstrap:start`);
  settings = await getSettings();
  console.log(`${LOG_PREFIX} bootstrap:settings loaded`, settings);
  injectBridgeScript();
  setupSettingsListener();
  setupBridgeListener();
  startRenderLoop();
  applySettingsToDom();
  mountOverlayWhenReady();
  console.log(`${LOG_PREFIX} bootstrap:done`);
}

function injectBridgeScript(): void {
  if (document.getElementById('yt-dual-sub-bridge-script')) {
    console.log(`${LOG_PREFIX} injectBridgeScript:already injected`);
    return;
  }

  const script = document.createElement('script');
  script.id = 'yt-dual-sub-bridge-script';
  script.src = chrome.runtime.getURL('page-bridge.js');
  script.onload = () => {
    console.log(`${LOG_PREFIX} injectBridgeScript:loaded`);
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  console.log(`${LOG_PREFIX} injectBridgeScript:appended`, { src: script.src });
}

function setupSettingsListener(): void {
  console.log(`${LOG_PREFIX} setupSettingsListener:register`);
  onSettingsChanged((nextSettings) => {
    console.log(`${LOG_PREFIX} settings changed`, nextSettings);
    settings = nextSettings;
    overlay.applySettings(settings);
    applySettingsToDom();

    if (latestState?.selectedTrack) {
      console.log(`${LOG_PREFIX} settings changed -> force refresh`);
      void refreshTracksIfNeeded(latestState, true);
    }
  });
}

function setupBridgeListener(): void {
  console.log(`${LOG_PREFIX} setupBridgeListener:register`, BRIDGE_EVENT_NAME);
  window.addEventListener(BRIDGE_EVENT_NAME, (event: Event) => {
    const customEvent = event as CustomEvent<BridgeStateEventDetail>;
    const nextState = customEvent.detail.state;
    latestState = nextState;
    console.log(`${LOG_PREFIX} bridge event received`, {
      videoId: nextState.videoId,
      captionsEnabled: nextState.captionsEnabled,
      selectedTrack: nextState.selectedTrack?.languageCode ?? null,
      tracks: nextState.captionTracks.length,
    });
    void handleStateChange(nextState);
  });
}

async function handleStateChange(state: BridgeState): Promise<void> {
  applySettingsToDom();
  mountOverlayWhenReady();

  console.log(`${LOG_PREFIX} handleStateChange`, state);

  if (!settings.enabled) {
    console.log(`${LOG_PREFIX} disabled in settings -> clear overlay`);
    overlay.clear();
    return;
  }

  if (!state.captionsEnabled) {
    console.warn(`${LOG_PREFIX} YouTube native captions appear disabled`);
  }

  if (!state.videoId || !state.selectedTrack?.baseUrl) {
    console.warn(`${LOG_PREFIX} no valid selected subtitle track`);
    originalCues = [];
    translatedCues = [];
    currentTrackKey = '';
    currentVideoId = null;
    overlay.clear();
    return;
  }

  await refreshTracksIfNeeded(state, false);
}

async function refreshTracksIfNeeded(
  state: BridgeState,
  force: boolean,
): Promise<void> {
  const nextTrackKey = [
    state.videoId,
    state.selectedTrack.baseUrl,
    state.selectedTrack.languageCode,
    settings.targetLanguage,
  ].join('|');

  if (!force && nextTrackKey === currentTrackKey) {
    console.log(`${LOG_PREFIX} refreshTracksIfNeeded:skip same track key`);
    return;
  }

  currentTrackKey = nextTrackKey;
  currentVideoId = state.videoId;

  console.log(`${LOG_PREFIX} refreshTracksIfNeeded:start`, {
    force,
    trackKey: nextTrackKey,
    selectedTrack: state.selectedTrack,
    targetLanguage: settings.targetLanguage,
  });

  try {
    const originalUrl = buildOriginalTrackUrl(state.selectedTrack.baseUrl);
    const translatedUrl = buildTranslatedTrackUrl(
      state.selectedTrack.baseUrl,
      settings.targetLanguage,
    );

    console.log(`${LOG_PREFIX} originalUrl`, originalUrl);
    console.log(`${LOG_PREFIX} translatedUrl`, translatedUrl);

    const [original, translated] = await Promise.all([
      fetchSubtitleCues(originalUrl),
      fetchSubtitleCues(translatedUrl),
    ]);

    if (currentVideoId !== state.videoId) {
      console.warn(`${LOG_PREFIX} discard fetched cues due to video change`, {
        expected: currentVideoId,
        actual: state.videoId,
      });
      return;
    }

    originalCues = original;
    translatedCues = translated;

    console.log(`${LOG_PREFIX} loaded cues`, {
      original: original.length,
      translated: translated.length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to load subtitles`, error);
    originalCues = [];
    translatedCues = [];
    overlay.clear();
  }
}

function mountOverlayWhenReady(): void {
  const target =
    document.querySelector('.html5-video-player') ||
    document.querySelector('#movie_player');

  if (target instanceof HTMLElement) {
    const style = window.getComputedStyle(target);
    if (style.position === 'static') {
      target.style.position = 'relative';
      console.log(`${LOG_PREFIX} mountOverlayWhenReady:target made relative`);
    }

    overlay.mount(target);
    overlay.applySettings(settings);
    console.log(`${LOG_PREFIX} mountOverlayWhenReady:mounted`);
    return;
  }

  console.warn(`${LOG_PREFIX} mountOverlayWhenReady:no target found`);
}

function applySettingsToDom(): void {
  const html5Player = document.querySelector('.html5-video-player');
  if (!(html5Player instanceof HTMLElement)) {
    console.warn(`${LOG_PREFIX} applySettingsToDom:no html5 player`);
    return;
  }

  if (settings.hideNativeSubtitles) {
    html5Player.classList.add('yt-dual-sub-hide-native');
    console.log(`${LOG_PREFIX} native subtitles hidden`);
  } else {
    html5Player.classList.remove('yt-dual-sub-hide-native');
    console.log(`${LOG_PREFIX} native subtitles visible`);
  }
}

function startRenderLoop(): void {
  console.log(`${LOG_PREFIX} startRenderLoop`);

  const render = () => {
    animationFrameId = requestAnimationFrame(render);

    if (!settings?.enabled) {
      overlay.clear();
      return;
    }

    if (!latestState) return;

    const currentTimeMs = latestState.currentTimeSec * 1000;
    const originalCue = findActiveCue(originalCues, currentTimeMs);
    const translatedCue = findActiveCue(translatedCues, currentTimeMs);

    const renderKey = [
      originalCue?.startMs ?? -1,
      translatedCue?.startMs ?? -1,
      currentTrackKey,
    ].join('|');

    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      console.log(`${LOG_PREFIX} render frame`, {
        currentTimeMs,
        hasOriginal: Boolean(originalCue),
        hasTranslated: Boolean(translatedCue),
        trackKey: currentTrackKey,
      });
    }

    overlay.setText(
      originalCue?.text ?? '',
      translatedCue?.text ?? '',
      settings,
    );
  };

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(render);
}

void bootstrap();