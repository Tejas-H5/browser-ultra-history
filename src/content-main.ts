import { Message, UrlInfo, UrlMetadata, recieveMessage, sendLog, } from "./message";
import { forEachMatch, } from "./re";

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
            pushUrl(el[attr], { source: "attribute", attrName: attr });
        }
    }

    pushAllOfAttr("a", "href");
    pushAllOfAttr("link", "href");
    pushAllOfAttr("img", "src");

    sendLog(tabUrl, "collected from attributes");

    // elements with inline styles
    for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
        for (const i of el.style) {
            const val = el.style[i];
            if (!val) {
                continue;
            }

            forEachMatch(val, /url\((.*?)\)/g, (matches) => {
                const url = matches[1];
                pushUrl(url, { source: "style", styleName: "" });
            })
        }
    }

    // stylesheets
    for (const el of document.getElementsByTagName("style")) {
        const val = el.textContent;
        if (!val) {
            continue;
        }

        // Matching the css url("blah") function contents here.
        forEachMatch(val, /url\(["'](.*?)["']\)/g, (matches) => {
            const url = matches[1];
            pushUrl(url, { source: "style", styleName: "" });
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

        // going to use a regex off the internet to make this a bit faster, hopefully
        const urlRegex = /((http|blob|https|ftp):\/\/\S+?)([ "']|$)/g;
        forEachMatch(val, urlRegex, (matches) => {
            const url = matches[1];
            console.log(url)
            pushUrl(url, { source: "text", text: val });
        });
    }

    sendLog(tabUrl, "collected from all text");

    return { type: "urls", urls };
}
