import { decodeCurrentPresetEntry } from './currentPresetSchema';
import { compressVersions, getVersionData } from './codec';
import { extractPresetVersionMetadata, presetValuesEqual } from './presetUtils';
import { normalizePresetTags } from './presetPool';
import { canonicalizePresetScope } from './presetScopeAliases';
import type { IPresetStore } from './PresetStore';
import type {
  PresetEntry,
  PresetIdentityMetadata,
  PresetLevel,
  PresetMetadataPatch,
  PresetMetadataUpdateOptions,
  PresetRenameIdentity,
  PresetSaveIdentity,
  PresetVersionMetadata,
} from './types';

export type PresetSaveKind = 'create' | 'update' | 'noop';

export interface PresetSaveCommand {
  type: PresetLevel;
  scope?: string;
  name: string;
  data: Record<string, unknown>;
  note?: string;
  tags?: string[];
  metadata?: PresetVersionMetadata;
  identity?: PresetSaveIdentity;
  /** Treat a bundled/factory match as a template for a new user preset. */
  forkReadOnly?: boolean;
  /** Reject a stale write when the loaded entry is not at this version. */
  expectedVersion?: number;
  /** Injectable clock for deterministic callers/tests. */
  now?: number;
}

export interface PresetSavePlan {
  entry: PresetEntry;
  changed: boolean;
  /** Whether this save appends versioned musical content/metadata/note. */
  versionChanged: boolean;
  version: number;
  kind: PresetSaveKind;
}

export interface PresetCommandResult extends PresetSavePlan {}

/** A conflict that callers can surface as a retry/refresh action. */
export class PresetCommandConflictError extends Error {
  readonly code = 'PRESET_COMMAND_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'PresetCommandConflictError';
  }
}

export function getPresetCommandErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) return parts.join(' · ');
  }
  return 'Preset action failed. Please try again.';
}

type PresetStoreWritePort = Pick<
  IPresetStore,
  'load' | 'save' | 'rename' | 'updateMetadata' | 'delete'
>;

const IDENTITY_KEYS: readonly (keyof PresetIdentityMetadata)[] = [
  'creator',
  'description',
  'visibility',
  'familyId',
  'familyName',
  'variantId',
  'variantName',
  'variantRank',
  'rating',
];

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through for values crossing a different realm.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Remove values JSON cannot represent before the schema boundary validates them. */
function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : omitUndefined(item));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child !== undefined) result[key] = omitUndefined(child);
    }
    return result;
  }
  return value;
}

function normalizeData(data: Record<string, unknown>): Record<string, unknown> {
  return omitUndefined(cloneJson(data)) as Record<string, unknown>;
}

function normalizeMetadata(metadata: PresetVersionMetadata | undefined): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const normalized = omitUndefined(cloneJson(metadata)) as PresetVersionMetadata;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function stripInternalDerivedRefs(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata?.refs) return metadata;
  const refs = Object.fromEntries(
    Object.entries(metadata.refs).filter(([, ref]) => !ref.name.startsWith('__derived__/')),
  );
  if (Object.keys(refs).length === Object.keys(metadata.refs).length) return metadata;
  const next = { ...metadata };
  if (Object.keys(refs).length > 0) next.refs = refs;
  else delete next.refs;
  return Object.keys(next).length > 0 ? next : undefined;
}

function applyIdentity(
  target: PresetEntry,
  identity: PresetSaveIdentity | undefined,
): void {
  if (!identity) return;
  for (const key of IDENTITY_KEYS) {
    if (identity[key] !== undefined) {
      (target as unknown as Record<string, unknown>)[key] = cloneJson(identity[key]);
    }
  }
}

function hasIdentityChanges(
  existing: PresetEntry,
  identity: PresetSaveIdentity | undefined,
): boolean {
  if (!identity) return false;
  return IDENTITY_KEYS.some((key) => identity[key] !== undefined && !presetValuesEqual(existing[key], identity[key]));
}

function buildIdentityMetadataPatch(
  command: PresetSaveCommand,
  entry: PresetEntry,
): PresetMetadataPatch {
  const patch: PresetMetadataPatch = {};
  const identity = command.identity;
  if (identity?.creator !== undefined) patch.creator = entry.creator ?? null;
  if (identity?.description !== undefined) patch.description = entry.description ?? null;
  if (identity?.visibility !== undefined && entry.visibility !== undefined) patch.visibility = entry.visibility;
  if (identity?.familyName !== undefined) patch.familyName = entry.familyName ?? null;
  if (identity?.variantName !== undefined) patch.variantName = entry.variantName ?? null;
  if (identity?.variantRank !== undefined) patch.variantRank = entry.variantRank ?? null;
  if (identity?.rating !== undefined) patch.rating = entry.rating ?? null;
  if (command.tags !== undefined) patch.tags = entry.tags ?? [];
  return patch;
}

function logicalKey(type: PresetLevel, scope: string | undefined, name: string): string {
  const normalizedScope = canonicalizePresetScope(scope) ?? scope?.trim() ?? '';
  return `${type}:${normalizedScope}:${name.trim().toLowerCase()}`;
}

/**
 * Pure save planner. It never mutates `existing` or the command payload.
 * The final entry is decoded at the current schema boundary before returning.
 */
export function buildPresetSavePlan(
  existing: PresetEntry | null,
  command: PresetSaveCommand,
): PresetSavePlan {
  const name = command.name.trim();
  if (!name) throw new Error('Preset name is required.');

  const now = command.now ?? Date.now();
  const data = normalizeData(command.data);
  const tags = command.tags === undefined ? undefined : normalizePresetTags(command.tags);
  const nextMetadata = normalizeMetadata(stripInternalDerivedRefs(command.metadata));

  if (existing) {
    const source = decodeCurrentPresetEntry(cloneJson(existing));
    if (command.expectedVersion !== undefined && source.currentVersion !== command.expectedVersion) {
      throw new PresetCommandConflictError(
        `Preset "${source.name}" changed from v${command.expectedVersion} to v${source.currentVersion}.`,
      );
    }

    const currentData = getVersionData(source) ?? {};
    const currentVersion = source.versions.find(version => version.v === source.currentVersion)
      ?? source.versions[source.versions.length - 1];
    const previousMetadata = normalizeMetadata(stripInternalDerivedRefs(
      extractPresetVersionMetadata(currentVersion),
    )) ?? {};
    const mergedMetadata = normalizeMetadata({ ...previousMetadata, ...(nextMetadata ?? {}) }) ?? {};
    const metadataChanged = !presetValuesEqual(previousMetadata, mergedMetadata);
    const tagsChanged = tags !== undefined && !presetValuesEqual(source.tags ?? [], tags);
    const dataChanged = !presetValuesEqual(currentData, data);
    const noteChanged = Boolean(command.note?.trim());
    const identityChanged = hasIdentityChanges(source, command.identity);

    if (!dataChanged && !metadataChanged && !tagsChanged && !noteChanged && !identityChanged) {
      const immutable = decodeCurrentPresetEntry(cloneJson(source));
      return {
        entry: immutable,
        changed: false,
        versionChanged: false,
        version: immutable.currentVersion,
        kind: 'noop',
      };
    }

    const next: PresetEntry = cloneJson(source);
    // Name changes are a separate command; an overwrite must preserve the
    // store's canonical casing and stable logical identity.
    next.name = source.name;
    next.updatedAt = now;
    if (tags !== undefined) next.tags = [...tags];
    applyIdentity(next, command.identity);
    const versionChanged = dataChanged || metadataChanged || noteChanged;
    if (!versionChanged) {
      const decoded = decodeCurrentPresetEntry(omitUndefined(next));
      return {
        entry: decoded,
        changed: true,
        versionChanged: false,
        version: decoded.currentVersion,
        kind: 'update',
      };
    }

    const nextVersion = Math.max(...source.versions.map(version => version.v)) + 1;
    next.currentVersion = nextVersion;
    next.versions = [
      ...source.versions.map(version => cloneJson(version)),
      {
        v: nextVersion,
        note: command.note?.trim() ?? '',
        timestamp: now,
        data,
        ...(mergedMetadata ?? {}),
      },
    ];
    const decoded = decodeCurrentPresetEntry(omitUndefined(next));
    return {
      entry: decoded,
      changed: true,
      versionChanged: true,
      version: nextVersion,
      kind: 'update',
    };
  }

  const identity = command.identity ?? {};
  const next: PresetEntry = {
    type: command.type,
    scope: command.scope,
    engine: command.type === 'engine' ? command.scope : undefined,
    source: command.type !== 'engine' ? command.scope : undefined,
    name,
    author: 'user',
    library: 'user',
    creator: identity.creator,
    description: identity.description,
    visibility: identity.visibility ?? 'private',
    familyId: identity.familyId,
    familyName: identity.familyName ?? name,
    variantId: identity.variantId,
    variantName: identity.variantName ?? name,
    variantRank: identity.variantRank,
    rating: identity.rating,
    tags: tags ?? [],
    versions: [{
      v: 1,
      note: command.note?.trim() ?? '',
      timestamp: now,
      data,
      ...(nextMetadata ?? {}),
    }],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  const decoded = decodeCurrentPresetEntry(omitUndefined(next));
  return { entry: decoded, changed: true, versionChanged: true, version: 1, kind: 'create' };
}

/**
 * UI-independent orchestration for generic L1-L4 saves. Commands for the same
 * logical key are serialized; unrelated presets can save concurrently.
 */
export class PresetCommandService {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly store: PresetStoreWritePort) {}

  private enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tail = next.then(() => undefined, () => undefined);
    this.tails.set(key, tail);
    return next.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
  }

  /**
   * Reserve every key before waiting for prior work. Sorting makes the
   * acquisition deterministic, and publishing one shared tail prevents
   * operations on either side of a rename from interleaving.
   */
  private enqueueMany<T>(keys: readonly string[], operation: () => Promise<T>): Promise<T> {
    const uniqueKeys = [...new Set(keys)].sort();
    if (uniqueKeys.length === 1) return this.enqueue(uniqueKeys[0]!, operation);
    if (uniqueKeys.length === 0) return operation();

    const previousTails: Promise<void>[] = [];
    for (const key of uniqueKeys) {
      const previous = this.tails.get(key);
      if (previous) previousTails.push(previous);
    }
    const ready = previousTails.length === 0
      ? Promise.resolve()
      : Promise.all(previousTails.map(previous => previous.catch(() => undefined))).then(() => undefined);
    const next = ready.then(operation);
    const tail = next.then(() => undefined, () => undefined);
    for (const key of uniqueKeys) this.tails.set(key, tail);
    return next.finally(() => {
      for (const key of uniqueKeys) {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      }
    });
  }

  runExclusive<T>(
    type: PresetLevel,
    scope: string | undefined,
    name: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.enqueue(logicalKey(type, scope, name), operation);
  }

  runExclusiveForNames<T>(
    type: PresetLevel,
    scope: string | undefined,
    names: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.enqueueMany(
      names.map(name => logicalKey(type, scope, name)),
      operation,
    );
  }

  save(command: PresetSaveCommand): Promise<PresetCommandResult> {
    return this.runExclusive(command.type, command.scope, command.name, async () => {
      const existing = await this.store.load(command.type, command.name.trim(), command.scope);
      const writableExisting = command.forkReadOnly
        && existing
        && (existing.author === 'factory' || existing.library === 'stock')
        ? null
        : existing;
      const forkIdentity = writableExisting || !existing
        ? command.identity
        : {
          creator: command.identity?.creator ?? existing.creator,
          description: command.identity?.description ?? existing.description,
          visibility: command.identity?.visibility ?? 'private',
          familyId: command.identity?.familyId ?? existing.familyId,
          familyName: command.identity?.familyName ?? existing.familyName,
          variantId: command.identity?.variantId ?? existing.variantId,
          variantName: command.identity?.variantName ?? existing.variantName,
          variantRank: command.identity?.variantRank ?? existing.variantRank,
          rating: command.identity?.rating ?? existing.rating,
        };
      const plan = buildPresetSavePlan(writableExisting, {
        ...command,
        identity: forkIdentity,
        tags: command.tags ?? (writableExisting ? undefined : existing?.tags),
      });
      if (plan.changed && !plan.versionChanged && writableExisting) {
        const metadataPatch = buildIdentityMetadataPatch(command, plan.entry);
        if (Object.keys(metadataPatch).length > 0) {
          const updated = await this.store.updateMetadata(
            command.type,
            writableExisting.name,
            metadataPatch,
            command.scope,
            {
              targetId: writableExisting.remoteId ?? writableExisting.id,
              expectedUpdatedAt: writableExisting.updatedAtRevision,
            },
          );
          if (!updated) throw new Error(`Preset "${writableExisting.name}" metadata was not updated.`);
          const canonical = await this.store.load(command.type, writableExisting.name, command.scope);
          if (canonical) {
            return {
              ...plan,
              entry: canonical,
              version: canonical.currentVersion,
            };
          }
          return plan;
        }
      }
      if (plan.changed) await this.store.save(cloneJson(plan.entry));
      return plan;
    });
  }

  importEntry(entry: PresetEntry): Promise<PresetEntry> {
    const imported = decodeCurrentPresetEntry(cloneJson(entry));
    const scope = imported.scope ?? imported.engine ?? imported.source;
    return this.runExclusive(imported.type, scope, imported.name, async () => {
      const existing = await this.store.load(imported.type, imported.name, scope);
      if (!existing) {
        await this.store.save(cloneJson(imported));
        return await this.store.load(imported.type, imported.name, scope) ?? imported;
      }

      const importedVersion = imported.versions.find(version => version.v === imported.currentVersion)
        ?? imported.versions[imported.versions.length - 1]!;
      const importedData = getVersionData(imported, importedVersion.v) ?? importedVersion.data;
      const writableExisting = existing.author === 'factory' || existing.library === 'stock'
        ? null
        : existing;
      const plan = buildPresetSavePlan(writableExisting, {
        type: imported.type,
        scope,
        name: imported.name,
        data: importedData,
        note: importedVersion.note.trim() || 'Imported from preset file',
        tags: imported.tags,
        metadata: extractPresetVersionMetadata(importedVersion),
        identity: {
          creator: imported.creator,
          description: imported.description,
          visibility: imported.visibility,
          familyId: imported.familyId,
          familyName: imported.familyName,
          variantId: imported.variantId,
          variantName: imported.variantName,
          variantRank: imported.variantRank,
          rating: imported.rating,
        },
        forkReadOnly: true,
      });
      if (plan.changed) await this.store.save(cloneJson(plan.entry));
      return await this.store.load(imported.type, plan.entry.name, scope) ?? plan.entry;
    });
  }

  rename(
    type: PresetLevel,
    name: string,
    nextName: string,
    scope?: string,
    identity?: PresetRenameIdentity,
    beforeRename?: () => Promise<boolean>,
  ): Promise<PresetEntry | null> {
    const currentName = name.trim();
    const targetName = nextName.trim();
    if (!currentName || !targetName) return Promise.resolve(null);
    return this.runExclusiveForNames(type, scope, [currentName, targetName], async () => {
      if (beforeRename && !(await beforeRename())) return null;
      return this.store.rename(type, currentName, targetName, scope, identity);
    });
  }

  updateMetadata(
    type: PresetLevel,
    name: string,
    metadata: PresetMetadataPatch,
    scope?: string,
    options?: PresetMetadataUpdateOptions,
  ): Promise<boolean> {
    return this.runExclusive(type, scope, name, () =>
      this.store.updateMetadata(type, name, metadata, scope, options));
  }

  remove(
    type: PresetLevel,
    name: string,
    scope?: string,
    beforeRemove?: () => Promise<boolean>,
  ): Promise<boolean> {
    return this.runExclusive(type, scope, name, async () => {
      if (beforeRemove && !(await beforeRemove())) return false;
      await this.store.delete(type, name, scope);
      return true;
    });
  }

  compactLocalVersions(type: PresetLevel, name: string, scope?: string): Promise<void> {
    return this.runExclusive(type, scope, name, async () => {
      const current = await this.store.load(type, name, scope);
      if (!current || current.remoteId || current.author !== 'user' || current.versions.length < 2) return;
      if (!current.versions.some((version, index) => index > 0 && !version._isDelta)) return;
      const compacted = cloneJson(current);
      compressVersions(compacted);
      await this.store.save(compacted);
    });
  }
}

const commandServicesByStore = new WeakMap<object, PresetCommandService>();

/**
 * Share one keyed command queue across every UI surface backed by the same
 * store. This prevents two mounted preset controls from racing each other.
 */
export function getPresetCommandService(store: PresetStoreWritePort): PresetCommandService {
  const storeKey = store as object;
  const existing = commandServicesByStore.get(storeKey);
  if (existing) return existing;
  const service = new PresetCommandService(store);
  commandServicesByStore.set(storeKey, service);
  return service;
}
