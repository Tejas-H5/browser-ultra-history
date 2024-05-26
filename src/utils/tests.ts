import { findIndexIntoSortedArray } from "./array-utils";
import { assert } from "./assert";
import { logTrace } from "./log";

export function runTests() {
    logTrace("Testing findInSortedArray");

    function cmp(a: number, b: number) {
        return a - b;
    }

    function key<T>(a: T) { 
        return a;
    }

    assert(findIndexIntoSortedArray([], 1, key, cmp) === 0, 
        "findIndexIntoSortedArray([], 1, key, cmp) === 0");
    assert(findIndexIntoSortedArray([0], 1, key, cmp) === 1, 
        "findIndexIntoSortedArray([0], 1, key, cmp) === 1");
    assert(findIndexIntoSortedArray([0], 0, key, cmp) === 0, 
        "findIndexIntoSortedArray([0], 0, key, cmp) === 0");
    assert(findIndexIntoSortedArray([0], -1, key, cmp) === 0, 
        "findIndexIntoSortedArray([0], -1, key, cmp) === 0");
    assert(findIndexIntoSortedArray([10, 20, 30], 0, key, cmp) === 0, 
        "findIndexIntoSortedArray([10, 20, 30], 0, key, cmp) === 0");
    assert(findIndexIntoSortedArray([10, 20, 30], 10, key, cmp) === 0, 
        "findIndexIntoSortedArray([10, 20, 30], 10, key, cmp) === 0");
    assert(findIndexIntoSortedArray([10, 20, 30], 15, key, cmp) === 1, 
        "findIndexIntoSortedArray([10, 20, 30], 15, key, cmp) === 1");
    assert(findIndexIntoSortedArray([10, 20, 30], 15, key, cmp) === 1, 
        "findIndexIntoSortedArray([10, 20, 30], 15, key, cmp) === 1");
    assert(findIndexIntoSortedArray([10, 20, 30], 25, key, cmp) === 2, 
        "findIndexIntoSortedArray([10, 20, 30], 25, key, cmp) === 2");
    assert(findIndexIntoSortedArray([10, 20, 30], 30, key, cmp) === 2, 
        "findIndexIntoSortedArray([10, 20, 30], 30, key, cmp) === 2");
    assert(findIndexIntoSortedArray([10, 20, 30], 35, key, cmp) === 3, 
        "findIndexIntoSortedArray([10, 20, 30], 35, key, cmp) === 3");

    // insertions
    logTrace("Testing findInSortedArray insertions");
    assert(findIndexIntoSortedArray([0], 1, key, cmp) === 1, 
        "findIndexIntoSortedArray([0], 1, key, cmp) === 1");
    assert(findIndexIntoSortedArray([0], -1, key, cmp) === 0, 
        "findIndexIntoSortedArray([0], -1, key, cmp) === 0");
    assert(findIndexIntoSortedArray([0, 1, 2], 3, key, cmp) === 3, 
        "findIndexIntoSortedArray([0, 1, 2], 3, key, cmp) === 3");
    assert(findIndexIntoSortedArray([0, 1, 2], -1, key, cmp) === 0, 

        "findIndexIntoSortedArray([0, 1, 2], -1, key, cmp) === 0");
    assert(findIndexIntoSortedArray([0, 0, 1, 1, 1], 1, key, cmp) === 2, 
        "findIndexIntoSortedArray([0, 0, 1, 1, 1], 1, key, cmp) === 2");
    assert(findIndexIntoSortedArray([0, 1, 1, 1, 1], 1, key, cmp) === 1, 
        "findIndexIntoSortedArray([0, 1, 1, 1, 1], 1, key, cmp) === 1");
    assert(findIndexIntoSortedArray([1, 1, 1, 1, 1], 1, key, cmp) === 0, 

        "findIndexIntoSortedArray([1, 1, 1, 1, 1], 1, key, cmp) === 0");
    assert(findIndexIntoSortedArray([0, 0, 2, 2, 2], 1, key, cmp) === 2, 
        "findIndexIntoSortedArray([0, 0, 2, 2, 2], 1, key, cmp) === 2");
    assert(findIndexIntoSortedArray([0, 2, 2, 2, 2], 1, key, cmp) === 1, 
        "findIndexIntoSortedArray([0, 2, 2, 2, 2], 1, key, cmp) === 2");
    assert(findIndexIntoSortedArray([2, 2, 2, 2, 2], 1, key, cmp) === 0, 
        "findIndexIntoSortedArray([2, 2, 2, 2, 2], 1, key, cmp) === 0");

    logTrace("Testing complete!");
}
