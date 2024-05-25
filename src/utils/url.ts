import { matchAllRanges } from "./re";


// Tests:
// https://www.youtube.com
// https://www.youtube.com
//
//
//


function urlRegex() {
    // urls are a string of non-whitespace that start with "https:", and contain at least 1 dot in there somewhere
    return /http\S+\.\S+(\b|",)/g;
}

export function getUrlPositions(text: string): [number, number][] {
    return matchAllRanges(text, urlRegex());
}

export function openUrlInNewTab(url: string) {
    if (!url.startsWith("https")) {
        return;
    }

    window.open(url, '_blank')?.focus();
}

export function forEachUrl(text: string, fn: (url: string) => void) {
    const urlPositions = getUrlPositions(text);
    for (const [start, end] of urlPositions) {
        fn(text.slice(start, end));
    }
}


