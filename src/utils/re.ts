/**
 * @deprecated use {@link forEachMatch} instead to avoid materializing matches
 */
export function matchAllRanges(text: string, re: RegExp) {
    const indices: [number, number][] = [];
    let match;
    while ((match = re.exec(text))) {
        indices.push([match.index, match.index + match[0].length]);
    }

    return indices;
}

export function forEachMatch(text: string, re: RegExp, fn: (captures: RegExpExecArray, start: number, end: number) => void) {
    const indices: [number, number][] = [];
    let match;
    while ((match = re.exec(text))) {
        const start = match.index;
        const end = match.index + match[0].length;

        fn(match, start, end);
    }

    return indices;
}
