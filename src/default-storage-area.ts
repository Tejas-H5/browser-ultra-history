import browser from "webextension-polyfill";
const defaultStorageArea = browser.storage.local;

// every interaction with the storage area is now cached, since it's way too slow.
const kvCache = new Map<string, any>();

export async function getAll() {
    const data = await defaultStorageArea.get(null);

    // update the cache with the new values.
    // TODO: a flag indicating that we've loaded all data, so that every read must use the cache.
    {
        for (const k of kvCache.keys()) {
            kvCache.set(k, undefined);
        }

        for (const k in data) {
            kvCache.set(k, data[k]);
        }
    }

    return data;
}

export async function clearKeys() {
    await defaultStorageArea.clear();
    for (const k of kvCache.keys()) {
        kvCache.set(k, undefined);
    }
}

async function getKeys(keys?: null | string | string[]) {
    if (keys === null || keys === undefined) {
        return await getAll();
    }

    if (typeof keys === "string") {
        keys = [keys];
    }
        
    const unreadKeys: string[] = [];
    const data: Record<string, any> = {};
    for (const key of keys) {
        if (kvCache.has(key)) {
            const val = kvCache.get(key);

            if (val !== undefined) {
                data[key] = kvCache.get(key);
            }
        } else {
            unreadKeys.push(key);
        }
    }

    console.log({
        cacheMisses: unreadKeys,
        cacheHits: data,
    })

    const dbData = await defaultStorageArea.get(unreadKeys);
    for (const k of unreadKeys) {
        const val = dbData[k];
        kvCache.set(k, val);

        if (val !== undefined) {
            data[k] = val;
        }
    }
    return data;
}

async function setKeys(values: Record<string, any>) {
    const keysToRemove: string[] = [];
    for (const k in values) {
        const val = values[k];
        if (val === undefined) {
            keysToRemove.push(k);
            delete values[k];
        }
    }

    await defaultStorageArea.set(values);
    for (const k in values) {
        kvCache.set(k, values[k]);
    }

    await defaultStorageArea.remove(keysToRemove);
    for (const k of keysToRemove) {
        kvCache.set(k, undefined);
    }
}

export function onStateChange(fn: (changes: browser.Storage.StorageAreaOnChangedChangesType) => void) {
    defaultStorageArea.onChanged.addListener((changes) => {
        fn(changes);
    });
}

// we need to update our cache when these values are changed from another context - i.e a popup 
// deleting stuff from the database should reflect in the tab.
onStateChange((changes) => {
    for (const k in changes) {
        const change = changes[k];
        kvCache.set(k, change.newValue);
    }
});

export async function getAllData() {
    return await getKeys(null);
}



/**
 * Maps a bunch of flat kv pairs into an object. Because reading and writing objects takes a stupid amount of time
 * in web extensions...
 *
 * Using any here because typescript can't handle recursive types (it isn't a real language).
 * In your head, just replace `any` with `ReadTransaction`
 */
export type ReadTx = Record<string, string | any> | (string | any)[] | string;

export type WriteTx<T = any> = Record<string, T>;

export function newTransaction(): ReadTx {
    return {};
}

function makeTypeFieldIdKey(type: string, field: string, id: string) {
    return type + ":" + field + ":" + id;
}

export type Schema<T extends string[]> = {
    type: string;
    idField: string;
    fields: T;
}

export function newSchema<T extends string[]>(schema: Schema<T>) {
    if (!schema.fields.includes(schema.idField)) {
        schema.fields.push(schema.idField);
    }
    return schema;
}

export function isTypeKey<T extends string[]>(key: string, schema: Schema<T>) {
    return key.startsWith(schema.type);
}

export const SKIP_READ_KEY = "$$SKIP_READ$$";

/**
 * Use this to get object keys that you might put into a read transaction
 */
export function getSchemaInstanceFields<T extends string[]>(schema: Schema<T>, id: string, fields?: T[number][]): Record<string, string> {
    const keys: Record<string, string> = {};
    if (!fields) {
        fields = schema.fields;
    } 
    if (!fields.includes(schema.idField)) {
        fields.push(schema.idField);
    }
    for (const field of fields) {
        if (field === schema.idField) {
            // Don't bother writing the ID field, we already know what that is. We'll add it to the readTx anyway, and
            // then the runReadTx method can have a carve-out for this type of key, where it will just set it without doing a database read
            const key = SKIP_READ_KEY + field;
            keys[key] = id;
            continue;
        }

        keys[field] = makeTypeFieldIdKey(schema.type, field, id);
    }
    return keys;
}

export function getInstanceField<T extends string[], K extends T[number]>(_schema: Schema<T>, field: K): K {
    // The typescript type inferencing has already done the heavy lifting, hopefully
    return field;
}

export const NO_OP = {};
export function setInstanceFieldKeys<K extends string[], T extends Record<string, any>>(
    tx: WriteTx, 
    schema: Schema<K>, 
    data: T, 
) {
    const id = data[schema.idField];
    if (id === undefined) {
        throw new Error("data was missing the id field, which is _required_ if you want to save it");
    }

    for (const field of schema.fields) {
        if (field === schema.idField) {
            continue;
        }

        if (field in data) {
            let value = data[field];
            const key = makeTypeFieldIdKey(schema.type, field, id);
            tx[key] = value;
        }
    }
}

type Mergable = string | number | boolean;
export function mergeArrays<T extends Mergable>(a: undefined | T[], b: undefined | T[]) {
    if(!a && !b) {
        return undefined;
    }

    if (!a) {
        return b;
    }

    if (!b) {
        return a;
    }

    return [...new Set([...a, ...b])];
}

export function hasNewItems(existing: unknown[] | undefined, incoming: unknown[] | undefined) {
    // NOTE: order matters
    if (!incoming) return false;
    if (!existing) return true;

    for (const item in incoming) {
        if (!existing.includes(item)) {
            return true;
        }
    }

    return false;
}

export function filterObject<T extends Record<string, any>>(
    obj: T, 
    rewritingPredicate: (key: keyof T, value: T[keyof T]) => any,
): Record<string, any> {
    const filtered: Record<string, any> = {};

    for (const k in obj) {
        const val = rewritingPredicate(k, obj[k]);
        if (val !== undefined) {
            filtered[k] = val;
        }
    }

    return filtered;
}

export function undefinedOrEmptyInstance(obj: any, schema: Schema<any>): boolean {
    if (obj === undefined) {
        return true;
    }

    for (const k in obj) {
        if (k === schema.idField) {
            continue;
        }
        return false;
    }

    return true;
}

/**
 * Returns an object of the same shape as specified by your read-transaction.
 * Does some magic to return your stuff in the shape you asked for it.
 *
 * ```
 * const readTransaction: ReadTransaction = {
 *      a: "key1",
 *      b: "key2",
 *      c: [ "key3", "key4", "key5" ]
 * };
 *
 * const { a, b, c } = await runReadTransaction(readTransaction);
 * const [ k1, k2, k3 ] = c;
 * ```
 */
export async function runReadTx(tx: ReadTx): Promise<any> {
    const flatKeys: string[] = [];
    const data = new Map<string, any>();

    const dfs = (tx: ReadTx) => {
        if (typeof tx === "string") {
            // use the cache if we can. else, we need to fetch this key from the database
            flatKeys.push(tx);

            return;
        }

        if (Array.isArray(tx)) {
            for (const val of tx) {
                dfs(val);
            }

            return;
        }

        if (typeof tx === "object") {
            if (tx === null) {
                throw new Error("Your read transaction contained a null object");
            }

            for (const k in tx) {
                if (k.startsWith(SKIP_READ_KEY)) {
                    continue;
                }

                dfs(tx[k]);
            }
            return;
        }

        throw new Error("Your read transaction contained an invalid object");
    }
    dfs(tx);

    const dataFromDb = await getKeys(flatKeys);
    for (const k in dataFromDb) {
        const val = dataFromDb[k];
        data.set(k, val);
    }

    const dfs2 = (tx: ReadTx): any => {
        if (typeof tx === "string") {
            return data.get(tx)!;
        }

        if (Array.isArray(tx)) {
            const arr: any[] = [];

            for (const txPart of tx) {
                const value = dfs2(txPart);
                if (value !== undefined) {
                    arr.push(value);
                }
            }

            return arr;
        }

        if (typeof tx === "object") {
            if (tx === null) {
                throw new Error("x2 Your read transaction contained a null object (again!!! HOW!!!)");
            }

            const obj: Record<string, any> = {};

            for (const k in tx) {
                if (k.startsWith(SKIP_READ_KEY)) {
                    const idField = k.substring(SKIP_READ_KEY.length);
                    obj[idField] = tx[k];
                    continue;
                }

                const txPart = tx[k];
                const value = dfs2(txPart);
                if (value !== undefined) {
                    obj[k] = value;
                }
            }

            return obj;
        }

        throw new Error("x3 Your read transaction contained an invalid object (again!!! HOW!!!)");
    }

    return dfs2(tx);
}

export function pluck(obj: Record<string, any>, key: string) {
    const val = obj[key];
    delete obj[key];
    return val;
}

/**
 * Saves the 'objects' you want to save in the write transaction.
 * It's basically just going to call defaultStorageArea.set(values) directly.
 * const writeTx: WriteTransaction = {
 *      ["key1"]: 
 * }
 *
 * Actually now we've added a caching layer to cache every value, since default storage is
 * horribly slow...
 */
export async function runWriteTx(tx: WriteTx): Promise<void> {
    await setKeys(tx);
}
