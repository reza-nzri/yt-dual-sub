const EVENT_NAME = 'yt-dual-sub-state';
const LOG_PREFIX = '[YT Dual Sub][bridge]';

type PageBridgeTrack = {
  baseUrl: string;
  languageCode: string;
  languageName: string;
  vssId?: string;
  kind?: string;
  isTranslatable: boolean;
};

type BridgeState = {
  url: string;
  videoId: string | null;
  currentTimeSec: number;
  captionsEnabled: boolean;
  selectedTrack: PageBridgeTrack | null;
  captionTracks: PageBridgeTrack[];
};

declare global {
  interface Window {
    ytInitialPlayerResponse?: unknown;
  }
}

function emitState(state: BridgeState): void {
  console.log(`${LOG_PREFIX} emitState`, {
    videoId: state.videoId,
    captionsEnabled: state.captionsEnabled,
    selectedTrack: state.selectedTrack?.languageCode ?? null,
    tracks: state.captionTracks.length,
    currentTimeSec: state.currentTimeSec,
  });

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: { state },
    }),
  );
}

function getMoviePlayer(): any | null {
  return document.getElementById('movie_player');
}

function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector('video');
}

function getVideoIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get('v');
}

function extractPlayerResponseFromScripts(): any | null {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (!text.includes('ytInitialPlayerResponse')) continue;

    const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
    if (!match?.[1]) continue;

    try {
      const parsed = JSON.parse(match[1]);
      console.log(`${LOG_PREFIX} player response from script tag`);
      return parsed;
    } catch {
      console.warn(`${LOG_PREFIX} failed to parse ytInitialPlayerResponse from script`);
      continue;
    }
  }

  return null;
}

function getPlayerResponse(): any | null {
  const player = getMoviePlayer();

  try {
    if (player?.getPlayerResponse) {
      const response = player.getPlayerResponse();
      console.log(`${LOG_PREFIX} player response via movie_player.getPlayerResponse`);
      return response;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} getPlayerResponse via player failed`, error);
  }

  if (window.ytInitialPlayerResponse) {
    console.log(`${LOG_PREFIX} player response via window.ytInitialPlayerResponse`);
    return window.ytInitialPlayerResponse;
  }

  console.log(`${LOG_PREFIX} player response via script extraction fallback`);
  return extractPlayerResponseFromScripts();
}

function mapCaptionTracks(playerResponse: any): PageBridgeTrack[] {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  const mapped = tracks
    .filter((track: any) => typeof track?.baseUrl === 'string' && track.baseUrl.length > 0)
    .map((track: any) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      languageName: track.name?.simpleText ?? track.languageCode ?? '',
      vssId: track.vssId,
      kind: track.kind,
      isTranslatable: Boolean(track.isTranslatable),
    }));

  console.log(`${LOG_PREFIX} mapCaptionTracks`, {
    raw: tracks.length,
    mapped: mapped.length,
    languages: mapped.map((track) => track.languageCode),
  });

  return mapped;
}

function normalizeTrackCandidate(track: any): Partial<PageBridgeTrack> | null {
  if (!track) return null;

  return {
    baseUrl: typeof track.baseUrl === 'string' ? track.baseUrl : '',
    languageCode: track.languageCode ?? '',
    languageName:
      track.displayName ??
      track.name?.simpleText ??
      track.languageCode ??
      '',
    vssId: track.vssId,
    kind: track.kind,
    isTranslatable: track.isTranslatable ?? true,
  };
}

function findSelectedTrack(
  player: any,
  tracks: PageBridgeTrack[],
): PageBridgeTrack | null {
  try {
    const currentTrack = normalizeTrackCandidate(
      player?.getOption?.('captions', 'track'),
    );

    if (currentTrack) {
      const exactByBaseUrl = tracks.find(
        (track) =>
          currentTrack.baseUrl &&
          track.baseUrl === currentTrack.baseUrl,
      );
      if (exactByBaseUrl) return exactByBaseUrl;

      const byVssId = tracks.find(
        (track) =>
          currentTrack.vssId &&
          track.vssId &&
          track.vssId === currentTrack.vssId,
      );
      if (byVssId) return byVssId;

      const byLanguage = tracks.find(
        (track) =>
          currentTrack.languageCode &&
          track.languageCode === currentTrack.languageCode,
      );
      if (byLanguage) return byLanguage;

      console.warn(`${LOG_PREFIX} current track not matched to captionTracks`, {
        currentTrack,
        availableLanguages: tracks.map((track) => track.languageCode),
      });
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} findSelectedTrack failed`, error);
  }

  const fallback = tracks[0] ?? null;
  console.log(`${LOG_PREFIX} selectedTrack fallback`, fallback);
  return fallback;
}

function areCaptionsEnabled(player: any): boolean {
  try {
    const enabled = Boolean(player?.isSubtitlesOn?.());
    return enabled;
  } catch (error) {
    console.warn(`${LOG_PREFIX} areCaptionsEnabled failed`, error);
    return false;
  }
}

function buildState(): BridgeState {
  const player = getMoviePlayer();
  const video = getVideoElement();
  const playerResponse = getPlayerResponse();
  const tracks = mapCaptionTracks(playerResponse);
  const selectedTrack = findSelectedTrack(player, tracks);

  const state = {
    url: window.location.href,
    videoId: getVideoIdFromUrl(),
    currentTimeSec: video?.currentTime ?? 0,
    captionsEnabled: areCaptionsEnabled(player),
    selectedTrack,
    captionTracks: tracks,
  };

  if (!state.videoId) {
    console.log(`${LOG_PREFIX} buildState without videoId`, { url: state.url });
  }

  return state;
}

let lastSerialized = '';

function tick(): void {
  const state = buildState();
  const serialized = JSON.stringify(state);

  if (serialized !== lastSerialized) {
    lastSerialized = serialized;
    console.log(`${LOG_PREFIX} state changed`);
    emitState(state);
  }
}

console.log(`${LOG_PREFIX} bridge script initialized`);
setInterval(tick, 500);

document.addEventListener('yt-navigate-finish', () => {
  console.log(`${LOG_PREFIX} yt-navigate-finish`);
  setTimeout(tick, 700);
});

window.addEventListener('load', () => {
  console.log(`${LOG_PREFIX} window load`);
  setTimeout(tick, 1000);
});