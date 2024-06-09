import { forEachMatch, } from "src/utils/re";
import { UrlInfo, newUrlInfo, recieveMessage, saveOutgoingUrls, sendLog as sendLogImported } from "./state";

declare global {
    interface Window {
        __ran_content_script?: boolean;
    }
}

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded content main!")
}

recieveMessage((message, _sender) => {
    if (message.type ==="content_collect_urls") {
        collectUrls();
    }
}, "content");


async function collectUrls() {
    const urls = getUrls();
    if (!urls) {
        return;
    }

    const tabUrl = window.location.href;
    await saveOutgoingUrls(tabUrl, urls);
}

function sendLog(message: string) {
    const tabUrl = window.location.href;
    sendLogImported(tabUrl, message);
}

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

function getUrls(): UrlInfo[] | undefined {
    const root = document.querySelector("html");
    if (!root) {
        return undefined;
    }

    const urls: UrlInfo[] = [];
    const pushUrl = (urlInfo: UrlInfo) => {
        let url = urlInfo.url;
        url = url.trim();
        if (
            !url ||
            url.startsWith("data:") || 
            url.startsWith("javascript:") 
        ) {
            return;
        }

        urlInfo.url = url;
 
        urls.push(urlInfo);
    }

    sendLog("started collection");

    function pushAllOfAttr(tag: string, attr: string) {
        for (const el of document.getElementsByTagName(tag)) {
            const url = el.getAttribute(attr);
            if (!url) {
                continue;
            }

            pushUrl(newUrlInfo({ url, attrName: attr }));
        }
    }

    pushAllOfAttr("a", "href");
    pushAllOfAttr("link", "href");
    pushAllOfAttr("img", "src");

    sendLog("collected from attributes");

    // elements with inline styles
    for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
        for (const styleName in el.style) {
            const val = el.style[styleName];
            if (!val || typeof val !== "string") {
                continue;
            }

            forEachMatch(val, cssUrlRegex(), (matches) => {
                const url = matches[1];
                pushUrl(newUrlInfo({ 
                    url,
                }));
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
            pushUrl(newUrlInfo({ url, styleName }));
        });
    }

    sendLog("collected from styles");

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

            pushUrl(newUrlInfo({ url, contextString })); 
        });
    }

    sendLog("collected from all text");

    return urls;
}
