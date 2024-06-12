import { forEachMatch, } from "src/utils/re";
import { LinkInfo, getIsDisabled, newLinkInfo, onStateChange, recieveMessage, saveOutgoingLinks, sendLog as sendLogImported } from "./state";
import { div, newRenderGroup } from "./utils/dom-utils";
import browser from "webextension-polyfill";

declare global {
    interface Window {
        __ran_content_script?: boolean;
    }
}

const foundUrls = new Set<string>();
let saving = false;
let noneFound = false;
let collectionTimeout = 0;
let clearMessageTimeout = 0;
let currentMessage = "";
let initialized = false;

const tabUrlString = window.location.href;
const tabUrl = new URL(tabUrlString);

async function init() {
    if (initialized) {
        return;
    }

    initialized = true;

    const isDisabled = await getIsDisabled();

    // disable this script if we are on the extension page itself.
    if (
        isDisabled ||
        protocolIsExtension(tabUrl.protocol)
    ) {
        return;
    }

    document.body.append(popupRoot.el);
    renderPopup();

    // Collect URLs as soon as we load the page (after the debounce time, of course)
    collectUrlsDebounced();
}

function uninit() {
    popupRoot.el.remove();
    clearTimeout(collectionTimeout)
    clearTimeout(clearMessageTimeout)
    initialized = false;
}


recieveMessage((message, _sender) => {
    if (!initialized) {
        return;
    }

    if (message.type === "content_collect_urls") {
        collectUrlsDebounced();
        return;
    }

    if (message.type === "save_urls_finished") {
        saving = false;

        const numNewUrls = message.numNewUrls;
        if (numNewUrls === 1) {
            currentMessage = "Saved 1 new URL!";
        } else {
            currentMessage = "Saved " + numNewUrls + " new URLs" + (numNewUrls > 0 ? "!" : "");
        }

        startClearMessageTimeout();

        renderPopup();
        return;
    }

}, "content");


// Collect URLs whenever we scroll the page
document.addEventListener("scroll", () => {
    if (!initialized) {
        return;
    }

    collectUrlsDebounced();
});

onStateChange(async () => {
    const isDisabled = await getIsDisabled();
    if (isDisabled) {
        uninit();
    } else {
        init();
    }
});



// https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml
// (moz-extension isn't on there, but I use firefox, so I know it's legit)
function protocolIsExtension(protocol: string) {
    return protocol === 'ms-browser-extension:' ||
        protocol === 'moz-extension:' ||
        protocol === 'chrome-extension:';
}

async function collectLinks() {
    const tabUrlString = window.location.href;
    const tabUrl = new URL(tabUrlString);

    // don't allow collecting links in special circumstances
    if (protocolIsExtension(tabUrl.protocol)) {
        return;
    }


    saving = false;
    noneFound = false;
    if (collectionTimeout !== 0) {
        clearTimeout(collectionTimeout);
        clearTimeout(clearMessageTimeout);
        collectionTimeout = 0;
    }

    renderPopup();

    const links = getLinks();
    if (!links || links.length === 0) {
        saving = false;
        noneFound = true;
        currentMessage = "No new URLs found :(";

        renderPopup();
        startClearMessageTimeout();
        return;
    }

    saving = true;
    currentMessage = "Saving new URLs...";
    renderPopup();

    saveOutgoingLinks(tabUrlString, links);
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

function getLinks(): LinkInfo[] | undefined {
    const root = document.querySelector("html");
    if (!root) {
        return undefined;
    }

    const urls: LinkInfo[] = [];


    const pushUrl = (urlInfoPartial: Omit<LinkInfo, "visitedAt" | "urlFrom">) => {
        const urlInfo = newLinkInfo({
            ...urlInfoPartial,
            urlFrom: tabUrlString,
        });

        let url = urlInfo.urlTo;
        url = url.trim();
        if (
            !url ||
            url.startsWith("data:") || 
            url.startsWith("javascript:") 
        ) {
            return;
        }

        try {
            // Convert the URL to an absolute url relative to the current origin.
            const parsed = new URL(url, window.location.origin);
            urlInfo.urlTo = parsed.href;
        } catch {
            // this was an invalid url. dont bother collecting it
            return;
        }

        if (foundUrls.has(urlInfo.urlTo)) {
            return;
        }

        foundUrls.add(urlInfo.urlTo);
        urls.push(urlInfo);
    }

    sendLog("started collection");

    function pushAllOfAttr(tag: string, attr: string) {
        for (const el of document.getElementsByTagName(tag)) {
            const url = el.getAttribute(attr);
            if (!url) {
                continue;
            }

            pushUrl({ urlTo: url, attrName: [attr] });
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
                pushUrl({ urlTo: url, styleName: [styleName] });
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
            pushUrl({ urlTo: url, styleName: [styleName] });
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

            pushUrl({ urlTo: url, contextString: [contextString] }); 
        });
    }

    sendLog("collected from all text");

    return urls;
}

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded content main!")
}

function startClearMessageTimeout() {
    clearTimeout(clearMessageTimeout);
    clearMessageTimeout = setTimeout(() => {
        currentMessage = "";
        renderPopup();
    }, 1000);
}

function collectUrlsDebounced() {
    clearTimeout(collectionTimeout);
    collectionTimeout = setTimeout(() => {
        currentMessage = "Collecting URLS...";
        collectionTimeout = 0;
        renderPopup();

        collectLinks();
    }, 1000);

    currentMessage = "About to collect URLS...";
    renderPopup();
}

const rg = newRenderGroup();
// NOTE: I've not figured out how to get css classes to work here yet, since it's a content script.
const popupRoot = rg.if(() => !!currentMessage, div({ 
    style: "all: unset; z-index: 999999; font-family: monospace; font-size: 16px; position: fixed; bottom: 10px; right: 10px; background-color: black; color: white; text-align: right;" +
        "padding: 10px;"
}, [
    rg.text(() => currentMessage),
]));

function renderPopup() {
    rg.render();
}

init();
