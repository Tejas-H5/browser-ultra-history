import { forEachMatch, } from "src/utils/re";
import { EnabledFlags, LinkInfo, getEnabledFlags, newLinkInfo, recieveMessage, saveOutgoingLinks, sendLog as sendLogImported } from "./state";
import { div, isVisibleElement, newRenderGroup } from "./utils/dom-utils";
import { onStateChange } from "./default-storage-area";

declare global {
    interface Window {
        __ran_content_script?: boolean;
    }
}

let saving = false;
let noneFound = false;
let collectionTimeout = 0;
let clearMessageTimeout = 0;
let currentMessage = "";
let initialized = false;
let lastCollectedUrls: LinkQueryResult[] = [];
let enabledFlags: EnabledFlags | undefined;

const tabUrlString = window.location.href;
const tabUrl = new URL(tabUrlString);

// Only works _after_ init() is called
function isEnabled() {
    return initialized && enabledFlags?.extension;
}

async function init() {
    if (initialized) {
        return;
    }

    initialized = true;
    enabledFlags = await getEnabledFlags();

    // disable this script if we are on the extension page itself.
    if (
        !isEnabled() ||
        protocolIsExtension(tabUrl.protocol)
    ) {
        return;
    }

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
    if (!isEnabled()) {
        return;
    }

    if (message.type === "content_collect_urls") {
        collectUrlsDebounced();
        return;
    }

    if (message.type === "content_highlight_url") {
        highlightUrlOnPage(message.url);
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
    if (!isEnabled()) {
        return;
    }

    collectUrlsDebounced();
});

onStateChange(async () => {
    const enabledFlags = await getEnabledFlags();
    if (enabledFlags.extension) {
        init();
    } else {
        uninit();
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
    if (!isEnabled() ) {
        return;
    }

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
    lastCollectedUrls = links ?? [];

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

    const visibleUrls = links.filter(result => result.domNode && isVisibleElement(result.domNode))
            .map(result => result.linkInfo.urlTo);

    await saveOutgoingLinks(tabUrlString, links.map(result => result.linkInfo), visibleUrls);
}


const rectEl = div({ id: "highlightRectThing", style: "position: fixed; background-color: #F00; z-index: 999999;" });
let removeTimout = 0;
let opacity = 1.0;
let increment = 1.0 / 15;
function animateOpacity() {
    rectEl.el.style.backgroundColor = `rgba(255, 0, 0, ${opacity})`;
    opacity -= increment;

    // Recursive timeout!!!!
    if (opacity > 0) {
        removeTimout = setTimeout(animateOpacity, 1000 / 30);
    } else {
        rectEl.el.remove();
    }
}
export function highlightPortionOfScreen({top, bottom, left, right} : { top: number, bottom: number, left: number, right: number }) {
    document.body.appendChild(rectEl.el);

    opacity = 1;
    rectEl.el.style.top = top + "px";
    rectEl.el.style.left = left + "px";
    // https://developer.mozilla.org/docs/Web/API/Element/getBoundingClientRect
    // inset left and right isn't the same as this lmao
    rectEl.el.style.right = (window.window.innerWidth - right) + "px";
    rectEl.el.style.bottom = (window.window.innerHeight - bottom) + "px";

    clearTimeout(removeTimout);
    animateOpacity();
}

function highlightUrlOnPage(url: string) {
    const res = lastCollectedUrls.find(result => result.linkInfo.urlTo === url);
    const domNode = res?.domNode;
    if (!domNode) {
        currentMessage = "This URL doesn't seem to be on an item on this page";
    } else {
        currentMessage = "Attempting to scroll to the node";
        if (!isVisibleElement(domNode)) {
            currentMessage = "Attempting to scroll to the node. However, it may not not work, as it doesn't seem to be visible...";
        }

        domNode.scrollIntoView({
            behavior: "instant",
            block: "center",
            inline: "center",
        });

        setTimeout(() => {
            const rect = domNode.getBoundingClientRect();
            const { top, bottom, left, right } = rect;
            highlightPortionOfScreen({ top, bottom, left, right });
        }, 300)
    }

    renderPopup();
    startClearMessageTimeout();
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

type LinkQueryResult = {
    linkInfo: LinkInfo;
    domNode?: HTMLElement;
}

function getLinks(): LinkQueryResult[] | undefined {
    if (!enabledFlags || !enabledFlags.extension) {
        sendLog("Warning: ran `getLinks` without any enabled flags - indicates a bug in our code");
        return [];
    }

    const root = document.querySelector("html");
    if (!root) {
        return undefined;
    }

    const urls: LinkQueryResult[] = [];

    const pushUrl = (
        urlInfoPartial: Omit<LinkInfo, "visitedAt" | "urlFrom">,
        domNode: HTMLElement | null | undefined,
    ) => {
        const linkInfo = newLinkInfo({
            ...urlInfoPartial,
            urlFrom: tabUrlString,
        });

        let url = linkInfo.urlTo;
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
            linkInfo.urlTo = parsed.href;
        } catch {
            // this was an invalid url. dont bother collecting it
            return;
        }

        if (linkInfo.urlTo === window.location.href) {
            // ignore self referencials
            return;
        }

        urls.push({ linkInfo, domNode: domNode || undefined });
    }

    sendLog("started collection");

    function pushAllOfAttr(tag: string, attr: string, isAsset: true | undefined = undefined) {
        for (const el of document.getElementsByTagName(tag)) {
            const url = el.getAttribute(attr);
            if (!url) {
                continue;
            }

            let linkText = undefined;
            if (tag === "a") {
                // truncate the link text if the text is too big
                linkText = el.textContent?.substring(0, 500);
                if (linkText && linkText?.length === 500) {
                    linkText += "...";
                }
            }

            pushUrl({ 
                urlTo: url, 
                attrName: [attr], 
                linkText: linkText ? [linkText] : undefined, 
                isAsset,
            }, el as HTMLElement);
        }
    }

    pushAllOfAttr("a", "href");
    if (enabledFlags.deepCollect) {
    }
    pushAllOfAttr("link", "href", true);
    pushAllOfAttr("img", "src", true);
    pushAllOfAttr("video", "src", true);
    pushAllOfAttr("source", "src", true);

    sendLog("collected from attributes");

    if (enabledFlags.deepCollect) {
        // elements with inline styles
        for (const el of document.querySelectorAll<HTMLElement>("[style]")) {
            for (const styleName in el.style) {
                const val = el.style[styleName];
                if (!val || typeof val !== "string") {
                    continue;
                }

                forEachMatch(val, cssUrlRegex(), (matches) => {
                    const url = matches[1];
                    pushUrl({ urlTo: url, styleName: [styleName], isAsset: true, }, el);
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
                const url = matches[1];

                const styleName = getStyleName(val, start);
                pushUrl({ urlTo: url, styleName: [styleName], isAsset: true }, el);
            });
        }

        sendLog("collected from styles");
    }


    // all text
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const val = walker.currentNode.textContent;
        if (!val) {
            continue;
        }

        const parentEl = walker.currentNode.parentElement;
        let parentElType = undefined;

        // name is actually a mistype. I really want to know if its a div or script or whatever.
        if (parentEl?.tagName) {
            parentElType = parentEl?.tagName.toUpperCase();
        }

        let isAsset = undefined;
        if (
            parentElType === "SCRIPT" ||
            parentElType === "STYLE" ||
            val.length > 3000   // source for length of 3000 as the asset cutoff: I made it tf up
        ) {
            isAsset = true;
        }

        if (isAsset && !enabledFlags.deepCollect) {
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

            pushUrl({ 
                urlTo: url, 
                contextString: [contextString], 
                parentType: !parentElType ? undefined : [parentElType] ,
                isAsset,
            }, parentEl); 
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
const popupRoot = rg.if(() => !!currentMessage, (rg) => div({ 
    style: "all: unset; z-index: 999999; font-family: monospace; font-size: 16px; position: fixed; bottom: 10px; left: 10px; background-color: black; color: white; text-align: right;" +
        "padding: 10px;"
}, [
    rg.text(() => currentMessage),
]));

function renderPopup() {
    if (isEnabled()) {
        document.body.appendChild(popupRoot.el);
        rg.render();
    } else {
        popupRoot.el.remove();
    }
}

init();
