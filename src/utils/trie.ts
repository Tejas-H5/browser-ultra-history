import { findInSortedArray, findIndexIntoSortedArray } from "./array-utils";

export type TrieNode = {
    prefix: string;
    children: TrieNode[];
};

export function newNode(prefix: string): TrieNode {
    return {
        prefix,
        children: [],
    };
}

function cmpStr(a: string, b: string) {
    return a.localeCompare(b);
}

function getPrefix(t: TrieNode) {
    return t.prefix;
}

export function getOrAddNode(t: TrieNode, prefix: string): TrieNode {
    const idx = findIndexIntoSortedArray(t.children, prefix, getPrefix, cmpStr);
    const node = t.children[idx];
    if (node && node.prefix === prefix) {
        return node;
    }

    const n = newNode(prefix);
    t.children.splice(idx, 0, n);
    return n;
}

export function getNode(t: TrieNode, prefix: string): TrieNode | undefined {
    return findInSortedArray(t.children, prefix, getPrefix, cmpStr);
}

export function clear(t: TrieNode) {
    t.children.splice(0, t.children.length);
}
