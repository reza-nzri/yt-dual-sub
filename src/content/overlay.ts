import type { UserSettings } from '../shared/types';

const LOG_PREFIX = '[YT Dual Sub][overlay]';

export class SubtitleOverlay {
  private root: HTMLDivElement;
  private container: HTMLDivElement;
  private originalLine: HTMLDivElement;
  private translatedLine: HTMLDivElement;
  private placeholderLine: HTMLDivElement;
  private lastRenderedKey = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'yt-dual-sub-root';

    this.container = document.createElement('div');
    this.container.className = 'yt-dual-sub-container';

    this.originalLine = document.createElement('div');
    this.originalLine.className = 'yt-dual-sub-line yt-dual-sub-original';

    this.translatedLine = document.createElement('div');
    this.translatedLine.className = 'yt-dual-sub-line yt-dual-sub-translated';

    this.placeholderLine = document.createElement('div');
    this.placeholderLine.className = 'yt-dual-sub-line yt-dual-sub-placeholder';
    this.placeholderLine.style.display = 'none';

    this.container.appendChild(this.originalLine);
    this.container.appendChild(this.translatedLine);
    this.container.appendChild(this.placeholderLine);
    this.root.appendChild(this.container);

    console.log(`${LOG_PREFIX} constructed`);
  }

  mount(target: HTMLElement): void {
    if (this.root.parentElement !== target) {
      target.appendChild(this.root);
      console.log(`${LOG_PREFIX} mounted`, {
        target: target.id || target.className || target.tagName,
      });
    }
  }

  unmount(): void {
    this.root.remove();
    console.log(`${LOG_PREFIX} unmounted`);
  }

  setText(original: string, translated: string, settings: UserSettings): void {
    this.originalLine.textContent = original;
    this.translatedLine.textContent = translated;
    this.placeholderLine.textContent = '';

    const showOriginalLine = settings.showOriginal && Boolean(original);
    const showTranslatedLine = settings.showTranslated && Boolean(translated);

    this.originalLine.style.display = showOriginalLine ? 'block' : 'none';
    this.translatedLine.style.display = showTranslatedLine ? 'block' : 'none';
    this.placeholderLine.style.display = 'none';
    this.container.style.display = showOriginalLine || showTranslatedLine ? 'flex' : 'none';

    const key = [
      original,
      translated,
      String(settings.showOriginal),
      String(settings.showTranslated),
    ].join('|');

    if (key !== this.lastRenderedKey) {
      this.lastRenderedKey = key;
      console.log(`${LOG_PREFIX} setText`, {
        hasOriginal: Boolean(original),
        hasTranslated: Boolean(translated),
        showOriginal: settings.showOriginal,
        showTranslated: settings.showTranslated,
      });
    }
  }

  setPlaceholder(message: string, settings: UserSettings): void {
    this.originalLine.textContent = '';
    this.translatedLine.textContent = '';
    this.placeholderLine.textContent = message;

    this.originalLine.style.display = 'none';
    this.translatedLine.style.display = 'none';
    this.placeholderLine.style.display = settings.showTranslated || settings.showOriginal ? 'block' : 'none';
    this.container.style.display = this.placeholderLine.style.display === 'block' ? 'flex' : 'none';

    const key = [
      'placeholder',
      message,
      String(settings.showOriginal),
      String(settings.showTranslated),
    ].join('|');

    if (key !== this.lastRenderedKey) {
      this.lastRenderedKey = key;
      console.log(`${LOG_PREFIX} setPlaceholder`, { message });
    }
  }

  clear(): void {
    this.originalLine.textContent = '';
    this.translatedLine.textContent = '';
    this.placeholderLine.textContent = '';
    this.originalLine.style.display = 'none';
    this.translatedLine.style.display = 'none';
    this.placeholderLine.style.display = 'none';
    this.container.style.display = 'none';
    this.lastRenderedKey = '';
    console.log(`${LOG_PREFIX} clear`);
  }

  applySettings(settings: UserSettings): void {
    this.root.style.bottom = `${settings.bottomOffsetPx}px`;
    this.container.style.gap = `${settings.gapPx}px`;
    this.container.style.background = settings.backgroundColor;
    this.container.style.padding = `${settings.paddingPx}px`;
    this.container.style.borderRadius = `${settings.borderRadiusPx}px`;
    this.container.style.maxWidth = `${settings.maxWidthPercent}%`;
    this.container.style.fontFamily = settings.fontFamily;
    this.container.dataset.layout = settings.layout;
    this.container.style.textAlign = settings.textAlign;
    if (!this.container.style.display) {
      this.container.style.display = 'none';
    }

    this.originalLine.style.fontSize = `${settings.originalFontSizePx}px`;
    this.originalLine.style.color = settings.originalColor;

    this.translatedLine.style.fontSize = `${settings.translatedFontSizePx}px`;
    this.translatedLine.style.color = settings.translatedColor;
    this.translatedLine.dir = 'auto';

    this.placeholderLine.style.fontSize = `${Math.max(16, Math.round((settings.originalFontSizePx + settings.translatedFontSizePx) / 2))}px`;
    this.placeholderLine.style.color = '#e0e0e0';
    this.placeholderLine.dir = 'auto';

    console.log(`${LOG_PREFIX} applySettings`, {
      bottomOffsetPx: settings.bottomOffsetPx,
      gapPx: settings.gapPx,
      fontFamily: settings.fontFamily,
      layout: settings.layout,
      textAlign: settings.textAlign,
      originalFontSizePx: settings.originalFontSizePx,
      translatedFontSizePx: settings.translatedFontSizePx,
    });
  }
}