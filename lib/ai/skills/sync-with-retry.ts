const SKILL_SYNC_MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function formatSkillSyncError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Unknown error";
}

export function skillSyncAttemptCount(): number {
  return SKILL_SYNC_MAX_RETRIES + 1;
}

export async function withSkillSyncRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempt = 1,
): Promise<T> {
  const maxAttempts = skillSyncAttemptCount();

  try {
    return await fn();
  } catch (error) {
    if (attempt >= maxAttempts) {
      throw error;
    }

    const delayMs = 1000 * attempt;
    console.warn(
      `[skills] ${label} failed (attempt ${attempt}/${maxAttempts}): ${formatSkillSyncError(error)}; retrying in ${delayMs}ms…`,
    );
    await sleep(delayMs);
    return withSkillSyncRetry(label, fn, attempt + 1);
  }
}
