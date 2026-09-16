export interface SubmissionLock {
  acquire(): boolean;
  release(): void;
  readonly locked: boolean;
}

export interface MutationExecutor<TVariables, TData, TOptions> {
  mutate(variables: TVariables, options?: TOptions): void;
  mutateAsync(variables: TVariables, options?: TOptions): Promise<TData>;
}

export class VentaSubmissionInProgressError extends Error {
  constructor() {
    super("Ya hay una venta en proceso. Espera a que termine antes de reintentar.");
    this.name = "VentaSubmissionInProgressError";
  }
}

export function createSubmissionLock(): SubmissionLock {
  let locked = false;

  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    get locked() {
      return locked;
    },
  };
}

/**
 * Guards both React Query mutation entry points. The lock is acquired before
 * invoking the executor so deferred onMutate/mutationFn work cannot admit a
 * second observer mutation. The mutation hook owns normal mutate settlement
 * release through its hook-level onSettled callback for both entry points.
 * Only synchronous executor setup failures are released here; an asynchronous
 * rejection has already passed through the hook-level onSettled callback.
 */
export function createGuardedMutation<TVariables, TData, TOptions>(
  executor: MutationExecutor<TVariables, TData, TOptions>,
  lock: SubmissionLock,
) {
  const mutate = (variables: TVariables, options?: TOptions) => {
    if (!lock.acquire()) return;

    try {
      executor.mutate(variables, options);
    } catch (error) {
      lock.release();
      throw error;
    }
  };

  const mutateAsync = async (variables: TVariables, options?: TOptions) => {
    if (!lock.acquire()) throw new VentaSubmissionInProgressError();

    let operation: Promise<TData>;
    try {
      operation = executor.mutateAsync(variables, options);
    } catch (error) {
      lock.release();
      throw error;
    }

    return operation;
  };

  return { mutate, mutateAsync };
}

/**
 * A process-wide lock prevents two sale screens/callbacks from submitting the
 * same cart before React Query has time to update isPending.
 */
export const ventaSubmissionLock = createSubmissionLock();
