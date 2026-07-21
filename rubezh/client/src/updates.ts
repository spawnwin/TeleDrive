import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { getApiBase } from './api';

export type AppVersionInfo = {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  force: boolean;
  changelog: string[];
};

export function getLocalVersionCode(): number {
  const fromConfig = Constants.expoConfig?.android?.versionCode;
  const fromPlatform = Constants.platform?.android?.versionCode;
  const fromNative = Number(Constants.nativeBuildVersion);
  if (typeof fromConfig === 'number' && fromConfig > 0) return fromConfig;
  if (typeof fromPlatform === 'number' && fromPlatform > 0) return fromPlatform;
  if (Number.isFinite(fromNative) && fromNative > 0) return fromNative;
  return 0;
}

export function getLocalVersionName(): string {
  return Constants.expoConfig?.version || '0.0.0';
}

export async function fetchRemoteVersion(): Promise<AppVersionInfo | null> {
  try {
    const res = await fetch(`${getApiBase()}/v1/app/version`);
    if (!res.ok) return null;
    return (await res.json()) as AppVersionInfo;
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<AppVersionInfo | null> {
  if (Platform.OS !== 'android') return null;
  const remote = await fetchRemoteVersion();
  if (!remote) return null;
  if (remote.versionCode <= getLocalVersionCode()) return null;
  return remote;
}

export async function openApkUrl(apkUrl: string) {
  await Linking.openURL(apkUrl);
}

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (ratio: number) => void,
): Promise<'installed' | 'opened'> {
  if (Platform.OS !== 'android') {
    await openApkUrl(apkUrl);
    return 'opened';
  }

  const dest = `${FileSystem.cacheDirectory}rubezh-update.apk`;
  try {
    const result = await FileSystem.createDownloadResumable(
      apkUrl,
      dest,
      {},
      (progress) => {
        if (!onProgress || !progress.totalBytesExpectedToWrite) return;
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      },
    ).downloadAsync();

    if (!result?.uri) {
      await openApkUrl(apkUrl);
      return 'opened';
    }

    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: 'application/vnd.android.package-archive',
    });
    return 'installed';
  } catch {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
        data: 'package:com.rubezh.tylpobedy',
      });
    } catch {
      // ignore — fallback to browser download
    }
    await openApkUrl(apkUrl);
    return 'opened';
  }
}
