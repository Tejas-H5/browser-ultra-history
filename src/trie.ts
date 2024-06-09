import { findInSortedArray, findIndexIntoSortedArray } from "src/utils/array-utils";

function getKey(trie: Trie) {
    return trie.prefix;
}

function cmpStr(a: string, b: string) {
    return a.localeCompare(b);
}

export class Trie {
    prefix: string = "";

    // don't sort this, getNode relies on these being sorted in a specific order.
    // instead, use another array, like _sortedChildren
    children: Trie[] = [];

    _count = 0;
    _childrenSortedByCount: Trie[] = [];

    constructor(prefix: string) { 
        this.prefix = prefix;
    }

    getOrAddNode(prefix: string): Trie {
        const idx = findIndexIntoSortedArray(this.children, prefix, getKey, cmpStr);
        const node = this.children[idx];
        if (node && node.prefix === prefix) {
            return node;
        }

        const n = new Trie(prefix);

        this.children.splice(idx, 0, n);

        return n;
    }

    getNode(prefix: string): Trie | undefined {
        return findInSortedArray(this.children, prefix, getKey, cmpStr);
    }

    // NOTE: this function is suboptimal. Count is something we should be keep track of incrementally in a better-designed data structure
    recomputeCountsRecursive() {
        let count = 0;
        if (this.children.length === 0) {
            count++;
        }

        for (const c of this.children) {
            count += c.recomputeCountsRecursive();
        }

        this._count = count;

        return count;
    }

    recomputeChildrenSortedByCount() {
        this._childrenSortedByCount = [...this.children];
        this._childrenSortedByCount.sort((a, b) => b._count - a._count);
    }

    clear() {
        this.children.splice(0, this.children.length);
    }
}






