/* eslint-disable @typescript-eslint/require-await */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RecoverableManifest,
  RecoveryInspection,
  runRecoverableApply,
  runRecoverableRollback,
  verifyRecoverableManifest,
} from './qa-partner-manifest.protocol';

interface TestManifest extends RecoverableManifest {
  runKey: string;
}

describe('recoverable QA manifest protocol', () => {
  let directory: string;
  let path: string;
  let state: RecoveryInspection;
  let sequence: number;

  const pending = (): TestManifest => ({
    protocolVersion: 1,
    operationId: 'operation-' + String(sequence++),
    status: 'PENDING',
    fixtureHash: 'fixture-sha256',
    runKey: 'qa-partner-branch-v1-20260925',
  });
  const validate = (manifest: TestManifest) => {
    expect(manifest.protocolVersion).toBe(1);
    expect(manifest.operationId).toMatch(/^operation-/);
    expect(manifest.runKey).toBe('qa-partner-branch-v1-20260925');
    if (manifest.status === 'FINALIZED')
      expect(manifest.fixtureHash).toBe('fixture-sha256');
  };
  const inspect = async () => state;
  const prepareFinalized = async (manifest: TestManifest) => ({
    ...manifest,
    fixtureHash: 'fixture-sha256',
  });
  const read = async () =>
    JSON.parse(await readFile(path, 'utf8')) as TestManifest;
  const options = () => ({
    path,
    createPending: pending,
    validate,
    inspect,
    prepareFinalized,
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ff-partner-manifest-'));
    path = join(directory, 'manifest.json');
    state = 'CLEAN';
    sequence = 1;
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('recovers a pre-transaction crash without leaving a permanent blocker', async () => {
    await expect(
      runRecoverableApply({
        ...options(),
        transaction: async () => {
          state = 'APPLIED';
        },
        afterPending: () => {
          throw new Error('crash before transaction');
        },
      }),
    ).rejects.toThrow('crash before transaction');
    expect(await read()).toMatchObject({
      status: 'PENDING',
      fixtureHash: 'fixture-sha256',
    });

    const result = await runRecoverableApply({
      ...options(),
      transaction: async () => {
        state = 'APPLIED';
      },
    });

    expect(result).toBe('APPLIED');
    expect((await read()).status).toBe('FINALIZED');
  });

  it('cleans the pending manifest when the transaction rolls back', async () => {
    await expect(
      runRecoverableApply({
        ...options(),
        transaction: async () => {
          throw new Error('transaction failed');
        },
      }),
    ).rejects.toThrow('transaction failed');
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await runRecoverableApply({
      ...options(),
      transaction: async () => {
        state = 'APPLIED';
      },
    });
    expect((await read()).status).toBe('FINALIZED');
  });

  it('cleans a retryable collision and never runs a destructive retry', async () => {
    state = 'RETRYABLE_COLLISION';
    const transaction = jest.fn(async () => {
      throw new Error('collision');
    });
    await expect(
      runRecoverableApply({ ...options(), transaction }),
    ).rejects.toThrow('collision');
    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('finalizes on retry after a post-commit crash without replaying writes', async () => {
    await expect(
      runRecoverableApply({
        ...options(),
        transaction: async () => {
          state = 'APPLIED';
        },
        afterCommit: () => {
          throw new Error('crash before finalization');
        },
      }),
    ).rejects.toThrow('crash before finalization');
    expect((await read()).status).toBe('PENDING');

    const transaction = jest.fn();
    const result = await runRecoverableApply({
      ...options(),
      transaction,
    });

    expect(result).toBe('RECOVERED');
    expect(transaction).not.toHaveBeenCalled();
    expect(await read()).toMatchObject({
      status: 'FINALIZED',
      fixtureHash: 'fixture-sha256',
    });
  });

  it('verify recovers a committed pending manifest', async () => {
    await runRecoverableApply({
      ...options(),
      transaction: async () => {
        state = 'APPLIED';
      },
      afterCommit: () => {
        throw new Error('crash before finalization');
      },
    }).catch(() => undefined);

    const verified = await verifyRecoverableManifest(options());
    expect(verified).toMatchObject({
      status: 'FINALIZED',
      fixtureHash: 'fixture-sha256',
    });
  });

  it('rolls back applied fixture state and removes its manifest', async () => {
    await runRecoverableApply({
      ...options(),
      transaction: async () => {
        state = 'APPLIED';
      },
    });
    const rollback = jest.fn(async () => {
      state = 'CLEAN';
    });

    await expect(
      runRecoverableRollback({ ...options(), transaction: rollback }),
    ).resolves.toBe('ROLLED_BACK');
    expect(rollback).toHaveBeenCalledTimes(1);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rollback never invokes deletion for collided non-fixture data', async () => {
    await runRecoverableApply({
      ...options(),
      transaction: async () => {
        state = 'APPLIED';
      },
    });
    state = 'COLLISION';
    const rollback = jest.fn();

    await expect(
      runRecoverableRollback({ ...options(), transaction: rollback }),
    ).rejects.toThrow('collides with changed or non-fixture data');
    expect(rollback).not.toHaveBeenCalled();
    expect((await read()).status).toBe('FINALIZED');
  });
});
