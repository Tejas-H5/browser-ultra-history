import browser from "webextension-polyfill";

const defaultStorageArea = browser.storage.local;

let debug = false;

export async function getAll() {
    return await defaultStorageArea.get(null);
}

export async function clearKeys() {
    return await defaultStorageArea.clear();
}

export async function getKeys(keys?: null | string | string[] | Record<string, any>) {
    if (debug) {
        console.log("read: ", keys);
    }
    return await defaultStorageArea.get(keys);
}

export async function setKeys(values: Record<string, any>) {
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
