import "./styles.css";

import {
  fetchSubtitleCues,
  buildOriginalTrackUrl,
  buildTranslatedTrackUrl,
  type SubtitleFetchOutcome,
} from "./captions";
import { SubtitleOverlay } from "./overlay";
import { findActiveCue } from "./renderer";
import { getSettings, onSettingsChanged } from "../shared/storage";
import type {
  BridgeState,
  BridgeStateEventDetail,
  SubtitleCue,
  UserSettings,
} from "../shared/types";

const BRIDGE_EVENT_NAME = "yt-dual-sub-state";
const LOG_PREFIX = "[YT Dual Sub][content]";
const RETRY_FETCH_MS = 4000;
const STREAM_FETCH_RETRY_MS = 1200;
const MAX_STREAM_FETCH_ATTEMPTS = 3;
const PLAYER_READY_POLL_MS = 500;
const PLAYER_READY_TIMEOUT_MS = 15000;

const overlay = new SubtitleOverlay();

type SubtitleStatus = "idle" | "loading" | "available" | "empty" | "error";
type SubtitleKind = "original" | "translated";

type PlayerDomTargets = {
  mountTarget: HTMLElement | null;
  html5Player: HTMLElement | null;
  video: HTMLVideoElement | null;
  captionWindowContainer: Element | null;
};

let settings: UserSettings;
let latestState: BridgeState | null = null;
let originalCues: SubtitleCue[] = [];
let translatedCues: SubtitleCue[] = [];
let originalStatus: SubtitleStatus = "idle";
let translatedStatus: SubtitleStatus = "idle";
let originalErrorMessage = "";
let translatedErrorMessage = "";
let currentTrackKey = "";
let currentVideoId: string | null = null;
let lastTrackFetchAttemptMs = 0;
let animationFrameId = 0;
let lastRenderKey = "";
let playerReadyObserver: MutationObserver | null = null;
let playerReadyPollId = 0;
let playerReadyDeadlineMs = 0;
let lastDomReadinessKey = "";
const inflightSubtitleRequests = new Map<string, Promise<SubtitleCue[]>>();
const subtitleCueCache = new Map<string, SubtitleCue[]>();

async function bootstrap(): Promise<void> {
  console.log(`${LOG_PREFIX} bootstrap:start`);
  settings = await getSettings();
  console.log(`${LOG_PREFIX} bootstrap:settings loaded`, settings);
  injectBridgeScript();
  setupSettingsListener();
  setupBridgeListener();
  startRenderLoop();
  ensurePlayerDomReady("bootstrap");
  console.log(`${LOG_PREFIX} bootstrap:done`);
}

function injectBridgeScript(): void {
  if (document.getElementById("yt-dual-sub-bridge-script")) {
    console.log(`${LOG_PREFIX} injectBridgeScript:already injected`);
    return;
  }

  const script = document.createElement("script");
  script.id = "yt-dual-sub-bridge-script";
  script.src = chrome.runtime.getURL("page-bridge.js");
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
    ensurePlayerDomReady("settings changed");

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
  ensurePlayerDomReady("state change");

  console.log(`${LOG_PREFIX} handleStateChange`, state);

  console.log("[YT Dual Sub][content] selectedTrack debug", {
    videoId: state.videoId,
    captionsEnabled: state.captionsEnabled,
    selectedTrack: state.selectedTrack,
    captionTracksCount: state.captionTracks.length,
  });

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

    originalStatus = "error";
    translatedStatus = "error";

    originalErrorMessage = "⚠️ Original subtitle track not detected";
    translatedErrorMessage = "⚠️ Translated subtitle track not available";

    currentTrackKey = "";
    currentVideoId = null;

    overlay.setText(
      settings.showOriginal ? originalErrorMessage : "",
      settings.showTranslated ? translatedErrorMessage : "",
      settings,
    );
    return;
  }

  await refreshTracksIfNeeded(state, false);
}

async function refreshTracksIfNeeded(
  state: BridgeState,
  force: boolean,
): Promise<void> {
  const selectedTrack = state.selectedTrack;
  if (!selectedTrack) {
    console.warn(`${LOG_PREFIX} refreshTracksIfNeeded:no selected track`);
    return;
  }

  const nextTrackKey = [
    state.videoId,
    selectedTrack.baseUrl,
    selectedTrack.languageCode,
    settings.targetLanguage,
  ].join("|");

  const targetLanguage = settings.targetLanguage?.trim();
  const translationSupportedByYoutube = state.translationLanguages.some(
    (item) => item.languageCode === targetLanguage,
  );

  const shouldFetchTranslated =
    settings.showTranslated &&
    Boolean(targetLanguage) &&
    selectedTrack.isTranslatable &&
    selectedTrack.languageCode !== targetLanguage &&
    translationSupportedByYoutube;

  const nowMs = Date.now();
  if (!force && nextTrackKey === currentTrackKey) {
    const shouldRetry =
      (originalStatus !== "available" || translatedStatus !== "available") &&
      nowMs - lastTrackFetchAttemptMs >= RETRY_FETCH_MS;

    if (!shouldRetry) {
      console.log(`${LOG_PREFIX} refreshTracksIfNeeded:skip same track key`, {
        originalStatus,
        translatedStatus,
        msSinceLastAttempt: nowMs - lastTrackFetchAttemptMs,
      });
      return;
    }

    console.log(`${LOG_PREFIX} refreshTracksIfNeeded:retry same track key`, {
      originalStatus,
      translatedStatus,
      msSinceLastAttempt: nowMs - lastTrackFetchAttemptMs,
    });
  } else {
    currentTrackKey = nextTrackKey;
    currentVideoId = state.videoId;

    originalStatus = "loading";
    translatedStatus = "loading";

    originalErrorMessage = "";
    translatedErrorMessage = "";

    subtitleCueCache.clear();
    inflightSubtitleRequests.clear();
  }

  lastTrackFetchAttemptMs = nowMs;

  console.log(`${LOG_PREFIX} refreshTracksIfNeeded:start`, {
    force,
    trackKey: nextTrackKey,
    selectedTrack: state.selectedTrack,
    targetLanguage: settings.targetLanguage,
  });

  console.log(`${LOG_PREFIX} refreshTracksIfNeeded:decision`, {
    shouldFetchTranslated,
    sourceLanguage: selectedTrack.languageCode,
    targetLanguage,
    isTranslatable: selectedTrack.isTranslatable,
    translationSupportedByYoutube,
  });

  try {
    const originalUrl = buildOriginalTrackUrl(selectedTrack.baseUrl);
    const translatedUrl = shouldFetchTranslated
      ? buildTranslatedTrackUrl(selectedTrack.baseUrl, targetLanguage)
      : "";

    console.log(`${LOG_PREFIX} originalUrl`, originalUrl);
    console.log(`${LOG_PREFIX} translatedUrl`, translatedUrl);

    console.log("[YT Dual Sub][content] subtitle URL debug", {
      selectedTrackBaseUrl: selectedTrack.baseUrl,
      originalUrl,
      translatedUrl,
    });

    const originalPromise = fetchSubtitleStream(
      "original",
      originalUrl,
      nextTrackKey,
      state.videoId,
    );

    const translatedPromise = shouldFetchTranslated
      ? fetchSubtitleStream(
          "translated",
          translatedUrl,
          nextTrackKey,
          state.videoId,
        )
      : Promise.resolve<SubtitleCue[]>([]);

    const [originalResult, translatedResult] = await Promise.allSettled([
      originalPromise,
      translatedPromise,
    ]);

    if (currentVideoId !== state.videoId) {
      console.warn(`${LOG_PREFIX} discard fetched cues due to video change`, {
        expected: currentVideoId,
        actual: state.videoId,
      });
      return;
    }

    if (originalResult.status === "fulfilled") {
      originalCues = originalResult.value;

      if (originalCues.length > 0) {
        originalStatus = "available";
        originalErrorMessage = "";
      } else {
        originalStatus = "empty";
        originalErrorMessage = "⚠️ Original subtitle loaded but empty";
      }
    } else {
      console.error(
        `${LOG_PREFIX} failed to load original subtitles`,
        originalResult.reason,
      );
      originalCues = [];
      originalStatus = "error";
      originalErrorMessage = "❌ Failed to load original subtitle";
    }

    if (translatedResult.status === "fulfilled") {
      translatedCues = translatedResult.value;

      if (!shouldFetchTranslated) {
        translatedStatus = "idle";
        translatedErrorMessage =
          selectedTrack.languageCode === targetLanguage
            ? ""
            : translationSupportedByYoutube
              ? ""
              : "⚠️ Translation not supported by YouTube for this target language";
      } else if (translatedCues.length > 0) {
        translatedStatus = "available";
        translatedErrorMessage = "";
      } else {
        translatedStatus = "empty";
        translatedErrorMessage =
          "⚠️ Translation unavailable for this video/track";
      }
    } else {
      console.error(
        `${LOG_PREFIX} failed to load translated subtitles`,
        translatedResult.reason,
      );
      translatedCues = [];
      translatedStatus = "error";
      translatedErrorMessage = "❌ Failed to load translated subtitle";
    }

    console.log(`${LOG_PREFIX} loaded cues`, {
      original: originalCues.length,
      translated: translatedCues.length,
      originalStatus,
      translatedStatus,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to load subtitles`, error);

    originalCues = [];
    translatedCues = [];

    originalStatus = "error";
    translatedStatus = "error";

    originalErrorMessage =
      "❌ Unexpected error while loading original subtitle";
    translatedErrorMessage =
      "❌ Unexpected error while loading translated subtitle";
  }
}

function applySettingsToPlayer(html5Player: HTMLElement): void {
  if (settings.hideNativeSubtitles) {
    html5Player.classList.add("yt-dual-sub-hide-native");
    console.log(`${LOG_PREFIX} native subtitles hidden`);
  } else {
    html5Player.classList.remove("yt-dual-sub-hide-native");
    console.log(`${LOG_PREFIX} native subtitles visible`);
  }
}

function getPlayerDomTargets(): PlayerDomTargets {
  const html5Player = document.querySelector(".html5-video-player");
  const moviePlayer = document.querySelector("#movie_player");
  const video = document.querySelector("video");

  return {
    mountTarget:
      html5Player instanceof HTMLElement
        ? html5Player
        : moviePlayer instanceof HTMLElement
          ? moviePlayer
          : null,
    html5Player: html5Player instanceof HTMLElement ? html5Player : null,
    video: video instanceof HTMLVideoElement ? video : null,
    captionWindowContainer: document.querySelector(
      ".ytp-caption-window-container",
    ),
  };
}

function logPlayerDomReadiness(
  reason: string,
  targets: PlayerDomTargets,
): void {
  const readinessKey = [
    reason,
    document.readyState,
    window.location.href,
    String(Boolean(targets.html5Player)),
    String(Boolean(targets.mountTarget)),
    String(Boolean(targets.video)),
    String(Boolean(targets.captionWindowContainer)),
  ].join("|");

  if (readinessKey === lastDomReadinessKey) {
    return;
  }

  lastDomReadinessKey = readinessKey;
  console.warn(`${LOG_PREFIX} player DOM not ready`, {
    reason,
    readyState: document.readyState,
    href: window.location.href,
    hasHtml5Player: Boolean(targets.html5Player),
    hasMountTarget: Boolean(targets.mountTarget),
    hasVideo: Boolean(targets.video),
    hasCaptionWindowContainer: Boolean(targets.captionWindowContainer),
  });
}

function stopPlayerDomWatcher(): void {
  if (playerReadyObserver) {
    playerReadyObserver.disconnect();
    playerReadyObserver = null;
  }

  if (playerReadyPollId) {
    window.clearInterval(playerReadyPollId);
    playerReadyPollId = 0;
  }

  playerReadyDeadlineMs = 0;
}

function tryBindPlayerDom(reason: string): boolean {
  const targets = getPlayerDomTargets();
  const { mountTarget, html5Player } = targets;

  if (!(mountTarget && html5Player)) {
    logPlayerDomReadiness(reason, targets);
    return false;
  }

  const style = window.getComputedStyle(mountTarget);
  if (style.position === "static") {
    mountTarget.style.position = "relative";
    console.log(`${LOG_PREFIX} mountOverlayWhenReady:target made relative`);
  }

  overlay.mount(mountTarget);
  overlay.applySettings(settings);
  applySettingsToPlayer(html5Player);
  stopPlayerDomWatcher();
  lastDomReadinessKey = "";

  console.log(`${LOG_PREFIX} player DOM ready`, {
    reason,
    target: mountTarget.id || mountTarget.className || mountTarget.tagName,
  });
  return true;
}

function ensurePlayerDomReady(reason: string): void {
  if (tryBindPlayerDom(reason)) {
    return;
  }

  if (!playerReadyObserver && document.body) {
    playerReadyObserver = new MutationObserver(() => {
      void tryBindPlayerDom("mutation");
    });
    playerReadyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (!playerReadyPollId) {
    playerReadyDeadlineMs = Date.now() + PLAYER_READY_TIMEOUT_MS;
    playerReadyPollId = window.setInterval(() => {
      if (tryBindPlayerDom("poll")) {
        return;
      }

      if (Date.now() >= playerReadyDeadlineMs) {
        logPlayerDomReadiness("timeout", getPlayerDomTargets());
        stopPlayerDomWatcher();
      }
    }, PLAYER_READY_POLL_MS);
  }
}

function getEmptyReasonLabel(
  emptyReason: SubtitleFetchOutcome["emptyReason"],
): string {
  if (emptyReason === "empty-body") {
    return "empty body";
  }

  if (emptyReason === "parsed-empty") {
    return "parsed empty cues";
  }

  if (emptyReason === "blocked-html") {
    return "blocked html response";
  }

  return "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchSubtitleStream(
  kind: SubtitleKind,
  url: string,
  trackKey: string,
  videoId: string | null,
): Promise<SubtitleCue[]> {
  const requestKey = `${kind}|${trackKey}|${url}`;

  const cached = subtitleCueCache.get(requestKey);
  if (cached) {
    console.log(`${LOG_PREFIX} subtitle cache hit`, {
      kind,
      requestKey,
      cues: cached.length,
    });
    return cached;
  }

  const inflight = inflightSubtitleRequests.get(requestKey);
  if (inflight) {
    console.log(`${LOG_PREFIX} subtitle inflight reused`, {
      kind,
      requestKey,
    });
    return inflight;
  }

  const requestPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_STREAM_FETCH_ATTEMPTS; attempt += 1) {
      if (currentTrackKey !== trackKey || currentVideoId !== videoId) {
        throw new Error(`Stale ${kind} subtitle fetch aborted`);
      }

      try {
        const result = await fetchSubtitleCues(url);

        if (result.cues.length > 0) {
          subtitleCueCache.set(requestKey, result.cues);
          return result.cues;
        }

        if (attempt >= MAX_STREAM_FETCH_ATTEMPTS) {
          return [];
        }

        console.warn(`${LOG_PREFIX} subtitle retry scheduled`, {
          kind,
          attempt,
          maxAttempts: MAX_STREAM_FETCH_ATTEMPTS,
          reason: getEmptyReasonLabel(result.emptyReason),
          trackKey,
          retryInMs: STREAM_FETCH_RETRY_MS,
        });

        await sleep(STREAM_FETCH_RETRY_MS);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "fetch failed";

        if (/429/.test(message)) {
          console.warn(`${LOG_PREFIX} subtitle rate limited`, {
            kind,
            trackKey,
            message,
          });
        }

        if (attempt >= MAX_STREAM_FETCH_ATTEMPTS) {
          throw error;
        }

        console.warn(`${LOG_PREFIX} subtitle retry scheduled`, {
          kind,
          attempt,
          maxAttempts: MAX_STREAM_FETCH_ATTEMPTS,
          reason: message,
          trackKey,
          retryInMs: STREAM_FETCH_RETRY_MS,
        });

        await sleep(STREAM_FETCH_RETRY_MS);
      }
    }

    return [];
  })();

  inflightSubtitleRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inflightSubtitleRequests.delete(requestKey);
  }
}

function mountOverlayWhenReady(): void {
  ensurePlayerDomReady("mount request");
}

function applySettingsToDom(): void {
  ensurePlayerDomReady("apply settings");
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
    ].join("|");

    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      console.log(`${LOG_PREFIX} render frame`, {
        currentTimeMs,
        hasOriginal: Boolean(originalCue),
        hasTranslated: Boolean(translatedCue),
        trackKey: currentTrackKey,
      });
    }

    const originalDisplayText =
      originalCue?.text ??
      (settings.showOriginal && originalStatus !== "available"
        ? originalErrorMessage
        : "");

    const translatedDisplayText =
      translatedCue?.text ??
      (settings.showTranslated && translatedStatus !== "available"
        ? translatedErrorMessage
        : "");

    overlay.setText(originalDisplayText, translatedDisplayText, settings);
  };

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(render);
}

void bootstrap();
