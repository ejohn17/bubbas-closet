/**
 * In-memory stand-in for the slice of the firebase-admin Firestore API that
 * the data layer uses: collections, docs, single-field `==` / `<` queries,
 * batches, and transactions.
 *
 * Transactions buffer their writes and apply them only if the callback
 * resolves, so a rule that throws mid-transaction leaves the store untouched,
 * the same all-or-nothing behaviour the rental logic relies on in production.
 */

type Data = Record<string, unknown>;

type Filter = { field: string; op: "==" | "<"; value: unknown };

type Write =
  | { kind: "set"; ref: FakeDocRef; data: Data; merge: boolean }
  | { kind: "update"; ref: FakeDocRef; data: Data }
  | { kind: "delete"; ref: FakeDocRef };

export class FakeDocSnapshot {
  constructor(
    readonly id: string,
    private readonly value: Data | undefined,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): Data | undefined {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }
}

export class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly collectionName: string,
    readonly id: string,
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return this.db.snapshot(this);
  }

  async set(data: Data, options?: { merge?: boolean }): Promise<void> {
    this.db.apply({ kind: "set", ref: this, data, merge: Boolean(options?.merge) });
  }

  async update(data: Data): Promise<void> {
    this.db.apply({ kind: "update", ref: this, data });
  }

  async delete(): Promise<void> {
    this.db.apply({ kind: "delete", ref: this });
  }
}

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    readonly collectionName: string,
    readonly filters: Filter[] = [],
    readonly max?: number,
  ) {}

  where(field: string, op: Filter["op"], value: unknown): FakeQuery {
    return new FakeQuery(
      this.db,
      this.collectionName,
      [...this.filters, { field, op, value }],
      this.max,
    );
  }

  limit(max: number): FakeQuery {
    return new FakeQuery(this.db, this.collectionName, this.filters, max);
  }

  async get(): Promise<FakeQuerySnapshot> {
    return this.db.run(this);
  }
}

export class FakeCollectionRef extends FakeQuery {
  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, this.collectionName, id ?? this.db.newId());
  }
}

export class FakeTransaction {
  private readonly writes: Write[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async get(target: FakeDocRef): Promise<FakeDocSnapshot>;
  async get(target: FakeQuery): Promise<FakeQuerySnapshot>;
  async get(
    target: FakeDocRef | FakeQuery,
  ): Promise<FakeDocSnapshot | FakeQuerySnapshot> {
    return target instanceof FakeDocRef
      ? this.db.snapshot(target)
      : this.db.run(target);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeDocSnapshot[]> {
    return refs.map((ref) => this.db.snapshot(ref));
  }

  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }): this {
    this.writes.push({ kind: "set", ref, data, merge: Boolean(options?.merge) });
    return this;
  }

  update(ref: FakeDocRef, data: Data): this {
    this.writes.push({ kind: "update", ref, data });
    return this;
  }

  delete(ref: FakeDocRef): this {
    this.writes.push({ kind: "delete", ref });
    return this;
  }

  commit(): void {
    for (const write of this.writes) this.db.apply(write);
  }
}

export class FakeFirestore {
  private store = new Map<string, Map<string, Data>>();
  private idCounter = 0;
  private pendingHooks: Array<() => void> = [];

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this, name);
  }

  async getAll(...refs: FakeDocRef[]): Promise<FakeDocSnapshot[]> {
    return refs.map((ref) => this.snapshot(ref));
  }

  batch() {
    const writes: Write[] = [];
    return {
      set: (ref: FakeDocRef, data: Data, options?: { merge?: boolean }) => {
        writes.push({ kind: "set", ref, data, merge: Boolean(options?.merge) });
      },
      commit: async () => {
        for (const write of writes) this.apply(write);
      },
    };
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    this.pendingHooks.shift()?.();
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  // --- test helpers ---------------------------------------------------------

  reset(): void {
    this.store = new Map();
    this.idCounter = 0;
    this.pendingHooks = [];
  }

  /** Runs `hook` just before the next transaction starts, e.g. to simulate a race. */
  beforeNextTransaction(hook: () => void): void {
    this.pendingHooks.push(hook);
  }

  seed(collection: string, id: string, data: Data): void {
    this.docs(collection).set(id, structuredClone(data));
  }

  read<T = Data>(collection: string, id: string): (T & { id: string }) | null {
    const value = this.docs(collection).get(id);
    return value ? ({ id, ...structuredClone(value) } as T & { id: string }) : null;
  }

  all<T = Data>(collection: string): Array<T & { id: string }> {
    return [...this.docs(collection).entries()].map(
      ([id, value]) => ({ id, ...structuredClone(value) }) as T & { id: string },
    );
  }

  // --- internals ------------------------------------------------------------

  newId(): string {
    this.idCounter += 1;
    return `auto-${this.idCounter}`;
  }

  snapshot(ref: FakeDocRef): FakeDocSnapshot {
    return new FakeDocSnapshot(ref.id, this.docs(ref.collectionName).get(ref.id));
  }

  run(query: FakeQuery): FakeQuerySnapshot {
    const matches = [...this.docs(query.collectionName).entries()].filter(
      ([, value]) => query.filters.every((f) => matchesFilter(value, f)),
    );
    const limited = query.max === undefined ? matches : matches.slice(0, query.max);
    return new FakeQuerySnapshot(
      limited.map(([id, value]) => new FakeDocSnapshot(id, value)),
    );
  }

  apply(write: Write): void {
    const docs = this.docs(write.ref.collectionName);
    const existing = docs.get(write.ref.id);

    if (write.kind === "delete") {
      docs.delete(write.ref.id);
      return;
    }

    assertNoUndefined(write.data, `${write.ref.collectionName}/${write.ref.id}`);

    if (write.kind === "update") {
      if (!existing) {
        throw new Error(`NOT_FOUND: no document to update at ${write.ref.id}`);
      }
      docs.set(write.ref.id, { ...existing, ...structuredClone(write.data) });
      return;
    }

    docs.set(
      write.ref.id,
      write.merge && existing
        ? { ...existing, ...structuredClone(write.data) }
        : structuredClone(write.data),
    );
  }

  private docs(collection: string): Map<string, Data> {
    let docs = this.store.get(collection);
    if (!docs) {
      docs = new Map();
      this.store.set(collection, docs);
    }
    return docs;
  }
}

function matchesFilter(value: Data, filter: Filter): boolean {
  const actual = value[filter.field];
  if (filter.op === "==") return actual === filter.value;
  return (
    typeof actual === "number" &&
    typeof filter.value === "number" &&
    actual < filter.value
  );
}

/** Firestore rejects `undefined` field values; mirror that so tests catch it. */
function assertNoUndefined(data: Data, path: string): void {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      throw new Error(`Cannot write undefined to field "${key}" at ${path}`);
    }
  }
}

export const fakeDb = new FakeFirestore();

/** Factory for `vi.mock("@/lib/firebase-admin", ...)`. */
export const firebaseAdminMock = {
  isFirebaseConfigured: () => true,
  getDb: () => fakeDb,
  requireDb: () => fakeDb,
  getAuthAdmin: () => null,
  requireAuthAdmin: () => {
    throw new Error("Auth is not available in unit tests.");
  },
  getBucket: () => null,
};
