import { describe, it, expect } from 'vitest';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { Wallet } from 'ethers';
import { migrateData } from '../../scripts/migrate-data-to-ethereum.js';

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-migrate-'));
  const eth = Wallet.createRandom().address;
  const w = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2));
  w('roles.json', { ['a'.repeat(40)]: 'ADMIN', [eth]: 'AUTHORITY' });
  w('user-departments.json', { ['b'.repeat(40)]: 'ROAD_DEPARTMENT', [eth]: { department: 'ROAD_DEPARTMENT', city: 'BHOPAL' } });
  w('report-cache.json', { reports: [{ id: 'r1', reporter: 'c'.repeat(40), category: 'GARBAGE', txId: 'r1', blockIndex: 7 }], lastBlock: 9, updatedAt: 1 });
  w('workflow-status.json', { r1: { status: 'VERIFIED' } });
  w('assignments.json', { r1: { reportId: 'r1', department: 'SANITATION_DEPARTMENT' } });
  w('duplicate-index.json', [{ hash: 'h', reportId: 'r1' }]);
  w('cities.json', [{ code: 'BHOPAL', name: 'Bhopal', state: 'MP' }]);
  return { dir, eth };
}
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

describe('migrate-data-to-ethereum', () => {
  it('dry-run changes nothing and makes no backup', () => {
    const { dir } = seed();
    const before = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
    const res = migrateData({ dataDir: dir, dryRun: true, env: {} });
    expect(res.changed).toBe(true);
    expect(res.backupDir).toBeNull();
    for (const [f, content] of before) expect(fs.readFileSync(path.join(dir, f), 'utf8')).toBe(content);
    expect(fs.readdirSync(dir).some((f) => f.startsWith('_backup'))).toBe(false);
  });

  it('keeps only 0x keys, flags legacy reports, keeps workflow/duplicates, creates a backup', () => {
    const { dir, eth } = seed();
    const admin = Wallet.createRandom().address;
    const res = migrateData({ dataDir: dir, env: { ADMIN_ADDRESSES: admin } });
    expect(res.backupDir).toBeTruthy();
    expect(fs.existsSync(path.join(res.backupDir, 'roles.json'))).toBe(true);
    expect(res.dropped['roles.json']).toEqual(['a'.repeat(40)]);

    expect(read(dir, 'roles.json')).toEqual({ [eth.toLowerCase()]: 'AUTHORITY', [admin.toLowerCase()]: 'ADMIN' });
    expect(Object.keys(read(dir, 'user-departments.json'))).toEqual([eth.toLowerCase()]);
    const cache = read(dir, 'report-cache.json');
    expect(cache.lastBlock).toBeUndefined();
    expect(cache.reports[0]).toMatchObject({ id: 'r1', reportId: 'r1', legacy: true, nft: { status: 'NOT_ELIGIBLE_LEGACY' } });
    expect(cache.reports[0].txId).toBeUndefined();
    expect(cache.reports[0].blockIndex).toBeUndefined();
    expect(read(dir, 'workflow-status.json')).toEqual({ r1: { status: 'VERIFIED' } });
    expect(read(dir, 'duplicate-index.json')).toHaveLength(1);
  });

  it('is idempotent — the second run changes nothing', () => {
    const { dir } = seed();
    migrateData({ dataDir: dir, env: {} });
    const again = migrateData({ dataDir: dir, env: {} });
    expect(again.changed).toBe(false);
    expect(again.backupDir).toBeNull();
  });

  it('--clean empties reports/workflow/assignments/duplicates but keeps cities', () => {
    const { dir } = seed();
    migrateData({ dataDir: dir, clean: true, env: {} });
    expect(read(dir, 'report-cache.json')).toEqual({ reports: [] });
    expect(read(dir, 'workflow-status.json')).toEqual({});
    expect(read(dir, 'assignments.json')).toEqual({});
    expect(read(dir, 'duplicate-index.json')).toEqual([]);
    expect(read(dir, 'cities.json')).toHaveLength(1);
  });

  it('seeds the deployer address as ADMIN when ADMIN_ADDRESSES is empty', () => {
    const { dir } = seed();
    const deployer = Wallet.createRandom();
    migrateData({ dataDir: dir, env: { DEPLOYER_PRIVATE_KEY: deployer.privateKey } });
    expect(read(dir, 'roles.json')[deployer.address.toLowerCase()]).toBe('ADMIN');
  });
});
