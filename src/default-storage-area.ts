import browser from "webextension-polyfill";

const defaultStorageArea = browser.storage.local;

let debug = true;

export async function getAll() {
    return await defaultStorageArea.get(null);
}

export async function clearKeys() {
    return await defaultStorageArea.clear();
}

async function getKeys(keys?: null | string | string[] | Record<string, any>) {
    if (debug) {
        console.log("read: ", keys);
    }
    return await defaultStorageArea.get(keys);
}

async function setKeys(values: Record<string, any>) {
    if (debug) {
        console.log("write: ", values);
    }

    return await defaultStorageArea.set(values);
}

export async function removeKey(keys: string | string[]) {
    return await defaultStorageArea.remove(keys);
}

export function onStateChange(fn: () => void) {
    defaultStorageArea.onChanged.addListener(() => {
        fn();
    });
}

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

export type WriteTx = Record<string, any>;

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

/**
 * Use this to get object keys that you might put into a read transaction
 */
export function getSchemaInstance<T extends string[]>(schema: Schema<T>, id: string): Record<string, string> {
    const keys: Record<string, string> = {};
    for (const field of schema.fields) {
        keys[field] = makeTypeFieldIdKey(schema.type, field, id);
    }
    return keys;
}

export function getSchemaInstanceFields<T extends string[]>(schema: Schema<T>, id: string, fields: T[number][]): Record<string, string> {
    const keys: Record<string, string> = {};
    for (const field of fields) {
        keys[field] = makeTypeFieldIdKey(schema.type, field, id);
    }
    if (!(schema.idField in keys)) {
        keys[schema.idField] = makeTypeFieldIdKey(schema.type, schema.idField, id);
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
    rewritingPredicate?: (key: keyof T) => any,
) {
    const id = data[schema.idField];
    if (!id) {
        throw new Error("data was missing the id field, which is _required_ if you want to save it");
    }

    for (const field of schema.fields) {
        if (field in data) {
            let value = data[field];

            if (rewritingPredicate) {
                value = rewritingPredicate(field);
                if (value === NO_OP) {
                    continue;
                }
            }

            const key = makeTypeFieldIdKey(schema.type, field, id);
            tx[key] = value;
        }
    }
}

export function undefinedOrEmpty(obj: any): boolean {
    if (obj === undefined) {
        return true;
    }

    for (const _k in obj) {
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

    const dfs = (tx: ReadTx) => {
        if (typeof tx === "string") {
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
                dfs(tx[k]);
            }
            return;
        }

        throw new Error("Your read transaction contained an invalid object");
    }
    dfs(tx);

    const data = await getKeys(flatKeys);

    console.log("keys gotten", {
        data, 
        flatKeys
    });

    const dfs2 = (tx: ReadTx): any => {
        if (typeof tx === "string") {
            return data[tx];
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
 */
export async function runWriteTx(tx: WriteTx): Promise<void> {
    await setKeys(tx);
}
