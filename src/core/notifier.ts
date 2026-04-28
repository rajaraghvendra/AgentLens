import { spawn } from 'child_process';

function sanitizeNotificationText(value: string, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function fireAndForget(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function notifyMac(title: string, message: string): Promise<void> {
  await fireAndForget('osascript', [
    '-e',
    `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
  ]);
}

async function notifyLinux(title: string, message: string): Promise<void> {
  await fireAndForget('notify-send', [title, message]);
}

async function notifyWindows(title: string, message: string): Promise<void> {
  const script = [
    `Add-Type -AssemblyName PresentationFramework`,
    `[System.Windows.MessageBox]::Show(${JSON.stringify(message)}, ${JSON.stringify(title)}) | Out-Null`,
  ].join('; ');

  await fireAndForget('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

export async function notify(title: string, message: string): Promise<void> {
  const safeTitle = sanitizeNotificationText(title, 120);
  const safeMessage = sanitizeNotificationText(message, 400);

  try {
    if (process.platform === 'darwin') {
      await notifyMac(safeTitle, safeMessage);
      return;
    }

    if (process.platform === 'win32') {
      await notifyWindows(safeTitle, safeMessage);
      return;
    }

    await notifyLinux(safeTitle, safeMessage);
  } catch (err: any) {
    // Notifications are best-effort only.
    // eslint-disable-next-line no-console
    console.error('AgentLens notifier failed:', err?.message || err);
  }
}
