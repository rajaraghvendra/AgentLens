import notifier from 'node-notifier';

export async function notify(title: string, message: string): Promise<void> {
  try {
    // node-notifier handles cross-platform desktop notifications (macOS, Linux, Windows)
    notifier.notify({
      title,
      message,
      // timeout in seconds where supported
      timeout: 5,
    });
  } catch (err: any) {
    // Fallback: log error and continue
    // Keep notifications non-fatal
    // eslint-disable-next-line no-console
    console.error('AgentLens notifier failed:', err?.message || err);
  }
}
