import { Message, UrlInfo, UrlMetadata, recieveMessage, sendLog, sendMessage, } from "./message";
import { forEachMatch, } from "./utils/re";

declare global {
    interface Window {
        __ran_content_script?: boolean;
    }
}


if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded content main!")
}

recieveMessage((message, _sender, response) => {
    function respond(message: Message | undefined) {
        if (message) {
            response(message);
        }
    }

    switch (message.type) {
        case "collect_urls": return respond(getUrls());
    }

}, "content");

function getStyleName(inlineStyleAttributeText: string, startOfValue: number): string{ 
    const colonIdx = inlineStyleAttributeText.lastIndexOf(":", startOfValue);
    if (colonIdx === -1) {
        return "";
    }

    let semiColonIdx = inlineStyleAttributeText.lastIndexOf(";", colonIdx - 1);
    if (semiColonIdx === -1) {
        semiColonIdx = 0;
    }

    return inlineStyleAttributeText.substring(semiColonIdx +1, colonIdx);
}

function cssUrlRegex() {
    return /url\(["'](.*?)["']\)/g;
}

function getUrls(): Message | undefined {
    const root = document.querySelector("html");
    if (!root) {
        return undefined;
    }


    const tabUrl = window.location.href;
    const urls: UrlInfo[] = [];
    const pushUrl = (url: string, metadata: UrlMetadata) => {
        url = url.trim();
        if (
            !url ||
            url.startsWith("data:") || 
            url.startsWith("javascript:") 
        ) {
            return;
        }

        urls.push({
            url, 
            urlCollectedFrom: tabUrl,
            visitedAt: new Date().toISOString(),
            metadata,
        });
    }

    pushUrl(tabUrl, { source: "directly-visited" });

    sendLog(tabUrl, "started collection");

    function pushAllOfAttr(tag: string, attr: string) {
        for (const el of document.getElementsByTagName(tag)) {
            // @ts-expect-error trust me bro
            pushUrl(el[attr], { source: "attribute", attrName: attr });
        }
    }

    pushAllOfAttr("a", "href");
    pushAllOfAttr("link", "href");
    pushAllOfAttr("img", "src");

    sendLog(tabUrl, "collected from attributes");

    // elements with inline styles
    for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
        for (const styleName in el.style) {
            const val = el.style[styleName];
            if (!val || typeof val !== "string") {
                continue;
            }

            forEachMatch(val, cssUrlRegex(), (matches, start) => {
                const url = matches[1];
                if (styleName === "cssText") {
                    sendLog(tabUrl, matches.join(", "));
                }

                pushUrl(url, { source: "style", styleName });
            });
        }
    }

    // stylesheets
    for (const el of document.getElementsByTagName("style")) {
        const val = el.textContent;
        if (!val) {
            continue;
        }

        // Matching the css url("blah") function contents here.
        forEachMatch(val, cssUrlRegex(), (matches, start) => {
            const url = matches[1]

            const styleName = getStyleName(val, start);
            pushUrl(url, { source: "style", styleName });
        });
    }

    sendLog(tabUrl, "collected from styles");

    // all text
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const val = walker.currentNode.textContent;
        if (!val) {
            continue;
        }

        const urlRegex = /((http|blob|https|ftp):\/\/\S+?)([ "']|$)/g;
        forEachMatch(val, urlRegex, (matches, start, end) => {
            const url = matches[1];

            // Saving the entire text will slow down the extention and even cause saving to fail...
            const CONTEXT = 50;
            const prefix = start-CONTEXT > 0 ? "..." : "";
            const suffix = start+CONTEXT < val.length ? "..." : "";
            const contextString = prefix + val.substring(start-CONTEXT, end+CONTEXT) + suffix;

            pushUrl(url, { source: "text", text:contextString }); 
        });
    }

    sendLog(tabUrl, "collected from all text");

    return { type: "urls", urls };
}
