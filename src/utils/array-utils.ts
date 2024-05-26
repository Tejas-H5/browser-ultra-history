import { assert } from "./assert";

export function swap(arr: unknown[], a: number, b: number) {
    if (
        a < 0 || a >= arr.length ||
        b < 0 || b >= arr.length
    ) {
        throw new Error("Index a or b out of bounds");
    }

    const temp = arr[a];
    arr[a] = arr[b];
    arr[b] = temp;
}

export function filterInPlace<T>(arr: T[], predicate: (v: T) => boolean) {
    for (let i = 0; i < arr.length; i++) {
        if (!predicate(arr[i])) {
            arr.splice(i, 1);
            i--;
        }
    }
}

export function countOccurances<T>(arr: T[], predicate: (v: T) => boolean): number {
    let count = 0;
    for (const val of arr) {
        if (predicate(val)) {
            count++;
        }
    }
    return count;
}

// This is a certified JavaScript moment
export function boundsCheck(arr: unknown[], i: number): boolean {
    return i >= 0 && i < arr.length;
}

/** 
 * Assumes arr is sorted. Finds where val is, or where it should be inserted if it isn't there already 
 *
 * NOTE: can return arr.length as an insert position
 */
export function findIndexIntoSortedArray<T, K>(arr: T[], val: K, key: (a: T) => K, comp: (a: K, b: K) => number) {
    if (arr.length === 0) {
        return 0;
    }

    if (comp(val, key(arr[0])) <= 0) {
        return 0;
    }

    if (comp(val, key(arr[arr.length - 1])) > 0) {
        return arr.length;
    }

    let start = 0, end = arr.length - 1;
    
    let safetyCounter = 100000;

    let mid = -1;
    while (start + 1 < end) {
        safetyCounter--;
        if (safetyCounter <= 1) {
            throw new Error("Hit the safety counter!!! - your data structure is just too big");
        }

        mid = start + Math.floor((end - start) / 2);
        const res = comp(val, key(arr[mid]));
        if (res <= 0) {
            // val is smaller than arr[mid].
            end = mid;
        } else {
            // val is >= arr[mid].
            start = mid;
        }
    }

    return end;
}

export function findInSortedArray<T, K>(arr: T[], val: K, key: (a: T) => K, comp: (a: K, b: K) => number) {
    const idx = findIndexIntoSortedArray(arr, val, key, comp);
    if (idx < arr.length && key(arr[idx]) !== val) {
        return undefined;
    }

    return arr[idx];
}

