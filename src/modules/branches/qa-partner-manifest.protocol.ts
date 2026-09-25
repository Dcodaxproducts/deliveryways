import { randomUUID } from 'node:crypto';
import {
  link,
  open,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

export type ManifestStatus = 'PENDING' | 'FINALIZED';
export type RecoveryInspection =
  | 'CLEAN'
  | 'APPLIED'
  | 'RETRYABLE_COLLISION'
  | 'COLLISION';

export interface RecoverableManifest {
  protocolVersion: 1;
  operationId: string;
  status: ManifestStatus;
  fixtureHash: string;
}

interface ExistingOptions<T extends RecoverableManifest> {
  path: string;
  validate: (manifest: T) => void;
  inspect: (manifest: T) => Promise<RecoveryInspection>;
  prepareFinalized: (manifest: T) => Promise<T> | T;
}

interface ApplyOptions<
  T extends RecoverableManifest,
> extends ExistingOptions<T> {
  createPending: () => Promise<T> | T;
  transaction: (manifest: T) => Promise<void>;
  afterPending?: () => Promise<void> | void;
  afterCommit?: () => Promise<void> | void;
}

interface RollbackOptions<
  T extends RecoverableManifest,
> extends ExistingOptions<T> {
  transaction: (manifest: T) => Promise<void>;
}

interface LockOwner {
  host: string;
  pid: number;
  nonce: string;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
}

async function readOptional<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.tmp-' + process.pid + '-' + randomUUID();
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
  });
  try {
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function createAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.pending-' + process.pid + '-' + randomUUID();
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
  });
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(errorCode(error) === 'ESRCH');
  }
}

async function acquireLock(path: string, owner: LockOwner): Promise<void> {
  const lockPath = path + '.lock';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify(owner) + '\n');
      await handle.close();
      return;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const current = await readOptional<LockOwner>(lockPath);
      if (
        attempt === 0 &&
        current?.host === owner.host &&
        Number.isInteger(current.pid) &&
        !processIsAlive(current.pid)
      ) {
        await unlink(lockPath);
        continue;
      }
      throw new Error('Manifest operation is already in progress');
    }
  }
  throw new Error('Unable to acquire manifest lock');
}

async function withLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  const lockPath = path + '.lock';
  const owner: LockOwner = {
    host: hostname(),
    pid: process.pid,
    nonce: randomUUID(),
  };
  await mkdir(dirname(path), { recursive: true });
  await acquireLock(path, owner);
  try {
    return await work();
  } finally {
    const current = await readOptional<LockOwner>(lockPath);
    if (current?.nonce === owner.nonce)
      await unlink(lockPath).catch(() => undefined);
  }
}

async function unlinkOwned<T extends RecoverableManifest>(
  path: string,
  manifest: T,
): Promise<void> {
  const current = await readOptional<T>(path);
  if (current?.operationId !== manifest.operationId)
    throw new Error('Manifest changed concurrently; refusing cleanup');
  await unlink(path);
}

async function finalize<T extends RecoverableManifest>(
  options: ExistingOptions<T>,
  manifest: T,
): Promise<T> {
  const current = await readOptional<T>(options.path);
  if (current?.operationId !== manifest.operationId)
    throw new Error('Manifest changed concurrently; refusing finalization');
  const prepared = await options.prepareFinalized(manifest);
  const finalized = { ...prepared, status: 'FINALIZED' as const };
  options.validate(finalized);
  await writeAtomic(options.path, finalized);
  return finalized;
}

async function applyLocked<T extends RecoverableManifest>(
  options: ApplyOptions<T>,
): Promise<'APPLIED' | 'RECOVERED' | 'ALREADY_APPLIED'> {
  let existing = await readOptional<T>(options.path);
  if (existing) {
    options.validate(existing);
    const inspection = await options.inspect(existing);
    if (inspection === 'COLLISION')
      throw new Error('Manifest collides with changed or non-fixture data');
    if (inspection === 'APPLIED') {
      if (existing.status === 'PENDING') {
        await finalize(options, existing);
        return 'RECOVERED';
      }
      return 'ALREADY_APPLIED';
    }
    if (inspection === 'RETRYABLE_COLLISION') {
      if (existing.status !== 'PENDING')
        throw new Error('Finalized manifest collides with non-fixture data');
      await unlinkOwned(options.path, existing);
      throw new Error('Fixture collision preflight failed');
    }
    await unlinkOwned(options.path, existing);
    existing = null;
  }

  const pending = await options.createPending();
  options.validate(pending);
  if (pending.status !== 'PENDING' || !pending.fixtureHash)
    throw new Error('New manifest must be pending with a fixture hash');
  await createAtomic(options.path, pending);
  await options.afterPending?.();
  try {
    await options.transaction(pending);
  } catch (error) {
    const inspection = await options.inspect(pending);
    if (inspection === 'CLEAN' || inspection === 'RETRYABLE_COLLISION')
      await unlinkOwned(options.path, pending);
    throw error;
  }
  await options.afterCommit?.();
  await finalize(options, pending);
  return 'APPLIED';
}

export async function runRecoverableApply<T extends RecoverableManifest>(
  options: ApplyOptions<T>,
): Promise<'APPLIED' | 'RECOVERED' | 'ALREADY_APPLIED'> {
  return withLock(options.path, () => applyLocked(options));
}

export async function verifyRecoverableManifest<T extends RecoverableManifest>(
  options: ExistingOptions<T>,
): Promise<T> {
  return withLock(options.path, async () => {
    const manifest = await readOptional<T>(options.path);
    if (!manifest) throw new Error('Manifest is required');
    options.validate(manifest);
    const inspection = await options.inspect(manifest);
    if (inspection !== 'APPLIED')
      throw new Error('Fixture is not in the manifest applied state');
    return manifest.status === 'PENDING'
      ? finalize(options, manifest)
      : manifest;
  });
}

export async function runRecoverableRollback<T extends RecoverableManifest>(
  options: RollbackOptions<T>,
): Promise<'ROLLED_BACK' | 'CLEANED_PENDING'> {
  return withLock(options.path, async () => {
    const manifest = await readOptional<T>(options.path);
    if (!manifest) throw new Error('Manifest is required');
    options.validate(manifest);
    const inspection = await options.inspect(manifest);
    if (inspection === 'COLLISION' || inspection === 'RETRYABLE_COLLISION')
      throw new Error('Manifest collides with changed or non-fixture data');
    if (inspection === 'CLEAN') {
      await unlinkOwned(options.path, manifest);
      return 'CLEANED_PENDING';
    }
    await options.transaction(manifest);
    await unlinkOwned(options.path, manifest);
    return 'ROLLED_BACK';
  });
}
