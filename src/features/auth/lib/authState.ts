export interface SessionSyncToken {
  epoch: number;
  userId: string | null;
}

/**
 * Keeps an async profile lookup from installing data after a newer auth event.
 * Auth events can arrive in quick succession during refresh, sign-out, or user
 * switching, so the provider must check the token immediately before commit.
 */
export function createSessionSyncController() {
  let epoch = 0;
  let currentUserId: string | null = null;

  return {
    begin(userId: string | null): SessionSyncToken {
      epoch += 1;
      currentUserId = userId;
      return { epoch, userId };
    },
    isCurrent(token: SessionSyncToken): boolean {
      return token.epoch === epoch && token.userId === currentUserId;
    },
    reset(): SessionSyncToken {
      return this.begin(null);
    },
  };
}
