import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** True inside the Android/iOS app (Capacitor), false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

// Android WebViews before Chromium 140 are laid out below the system bars, on a strip that follows
// the device's light/dark mode rather than the app's; newer ones (and iOS) draw underneath them.
const drawsUnderSystemBars =
  Capacitor.getPlatform() !== 'android' || Number(/Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? 0) >= 140;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('The file could not be prepared.'));
    reader.readAsDataURL(blob);
  });

/**
 * Hands a generated file to the person: a download in the browser, the share sheet in the app
 * (where they can save it to Files/Photos or send it on), since app WebViews ignore <a download>.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (!isNativeApp) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or share' });
  } catch (err) {
    // Closing the share sheet is not an error.
    if (!(err instanceof Error && /cancel/i.test(err.message))) throw err;
  }
}

/** Light status-bar icons on the dark theme, dark icons on the light theme. */
export function matchSystemBarsToTheme(theme: 'dark' | 'light'): void {
  if (!isNativeApp) return;
  const style = !drawsUnderSystemBars ? SystemBarsStyle.Default : theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
  SystemBars.setStyle({ style }).catch(() => {});
}

/**
 * Android back button: closes the open dialog (as Escape does), else goes back a page, else puts
 * the app in the background like other Android apps.
 */
export async function handleAndroidBackButton(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector('[role="dialog"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } else if (canGoBack) {
      window.history.back();
    } else {
      void App.minimizeApp();
    }
  });
}
