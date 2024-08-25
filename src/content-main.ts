import { forEachMatch, } from "src/utils/re";
import { hasExternalStateChanged, insertAndInitializeAppAndRenderContext, rerenderApp } from "./render-context";
import { EnabledFlags, UrlInfo, UrlType, getEnabledFlags, newUrlInfo, recieveMessage, saveNewUrls, sendLog as sendLogImported, sendMessage } from "./state";
import { RenderGroup, div, isVisibleElement, newComponent, setVisible } from "./utils/dom-utils";

const MAX_STRING_SIZE = 100;

let collectionTimeout = 0;
let clearMessageTimeout = 0;

type Status = ""
    | "about_to_collect_urls"
    | "collecting_urls"
    | "saving_urls"
    | "save_urls_complete"
    | "url_not_found"
    | "scrolling_to_url"
    | "no_new_urls_found"
    | "scrolling_to_url_invisible";

let currentStatus: Status = "";
let numNewUrls = 0;
let numNewUrlsTotal = 0;

let lastCollectedUrls: LinkQueryResult[] = [];
let enabledFlags: EnabledFlags | undefined;

const tabUrlString = window.location.href;
const tabUrl = new URL(tabUrlString);

function isEnabled() {
    if (protocolIsExtension(tabUrl.protocol)) {
        return false;
    }

    return enabledFlags?.extension;
}

recieveMessage(async (message, _sender) => {
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
        numNewUrls = message.numNewUrls;
        numNewUrlsTotal += numNewUrls;
        currentStatus = "save_urls_complete";

        startClearMessageTimeout();

        rerenderApp();
        return;
    }

}, "content");

// Collect URLs whenever we scroll the page.
// Some pages will bind the scroll wheel to something, so we improvise
document.addEventListener("scroll", collectUrlsDebounced);
document.addEventListener("wheel", collectUrlsDebounced);

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
export function highlightPortionOfScreen({ top, bottom, left, right }: { top: number, bottom: number, left: number, right: number }) {
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
    const res = lastCollectedUrls.find(result => result.linkInfo.url === url);
    const domNode = res?.domNode;
    if (!domNode) {
        currentStatus = "url_not_found";
    } else {
        if (isVisibleElement(domNode)) {
            currentStatus = "scrolling_to_url";
        } else {
            currentStatus = "scrolling_to_url_invisible";
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

    rerenderApp();
    startClearMessageTimeout();
}

function sendLog(message: string) {
    const tabUrl = window.location.href;
    sendLogImported(tabUrl, message);
}

function getStyleName(inlineStyleAttributeText: string, startOfValue: number): string {
    const colonIdx = inlineStyleAttributeText.lastIndexOf(":", startOfValue);
    if (colonIdx === -1) {
        return "";
    }

    let semiColonIdx = inlineStyleAttributeText.lastIndexOf(";", colonIdx - 1);
    if (semiColonIdx === -1) {
        semiColonIdx = 0;
    }

    return inlineStyleAttributeText.substring(semiColonIdx + 1, colonIdx);
}

function cssUrlRegex() {
    return /url\(["'](.*?)["']\)/g;
}

function getImageUrl(el: Element): string | null {
    if (el.tagName === "img") {
        return el.getAttribute("src");
    }

    let url = getComputedStyle(el).backgroundImage
        || getComputedStyle(el, ":before").backgroundImage
        || getComputedStyle(el, ":after").backgroundImage;

    if (!url) {
        return null;
    }

    let parsed: string | null = null;
    forEachMatch(url, cssUrlRegex(), (matches, _start) => {
        parsed = matches[1];
    });

    return parsed;
}

type LinkQueryResult = {
    linkInfo: UrlInfo;
    domNode?: HTMLElement;
}

// NOTE: this thing works well for links that are actually associated with a thumbnail image:
// ```
// <div class="tile-item">
//      <div class="thumbnail"> ... <img/> </div>
//      <div class="info"> ... <a/> </div>
// </div>
// ```
// However, it won't work for regular links:
// ```
// <div class="article-page">
//      <div class="image-carousel" />  <--- We dont want to collect this shite, but we DEF want to collect the one above, so my compromise
//                                           is to limit this collection to just 1 link at a time.
//      <div class="section" />
//      <div class="section" />
//      <div class="section" />
//      <div class="seciton" > ... <a/> </div>
// </div>
// ```
function findImagesFor(el: Element): string[] | undefined {
    const MAX_LEVELS = 10;
    let currentEl = el;
    for (let i = 0; i < MAX_LEVELS; i++) {
        for (const anything of currentEl.querySelectorAll("*")) {
            let src: string | null = null;
            if (anything.tagName === "IMG") {
                src = anything.getAttribute("src");
            } else {
                src = getImageUrl(anything);
            }

            if (!src) {
                continue;
            }

            try {
                const protocol = new URL(src).protocol;
                // The trent micro green check bruh
                if (protocolIsExtension(protocol)) {
                    continue;
                }
            } catch (e) {
                continue;
            }

            return [src];
        }
    }

    return undefined;
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
        urlInfoPartial: UrlInfo,
        domNode: HTMLElement | null | undefined,
    ) => {
        const linkInfo = newUrlInfo({
            ...urlInfoPartial,
            urlFrom: [tabUrlString],
        });

        let url = linkInfo.url;
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
            const parsed = new URL(url, window.location.href);
            const parts = parsed.href.split("?", 2);
            let updatedUrl = parts[0];
            if (parts[1]) {
                const params = new URLSearchParams(parts[1]);
                for (const [k, v] of params) {
                    if (v.length > 100) {
                        params.delete(k);
                    }
                }
                updatedUrl += "?" + params.toString();
            }

            linkInfo.url = updatedUrl;

        } catch (e) {
            console.error("Error collecting link:", linkInfo, e);
            // this was an invalid url. dont bother collecting it
            return;
        }

        if (linkInfo.url === window.location.href) {
            // ignore self referencials
            return;
        }

        urls.push({ linkInfo, domNode: domNode || undefined });
    }

    sendLog("started collection");

    function pushAllOfAttr(tag: string, attr: string, type: UrlType = "url") {
        for (const el of document.getElementsByTagName(tag)) {
            const url = el.getAttribute(attr);
            if (!url) {
                continue;
            }

            let linkText = undefined;
            if (tag === "a") {
                // truncate the link text if the text is too big
                linkText = el.textContent?.trim().substring(0, MAX_STRING_SIZE);
                if (linkText && linkText?.length === MAX_STRING_SIZE) {
                    linkText += "...";
                }
            }

            let linkImageUrl: string[] | undefined;
            if (type === "image") {
                linkImageUrl = [url];
            } else if (type === "url") {
                // attempt to do some tree poking to find the image associated with this link
                linkImageUrl = findImagesFor(el);
            }

            pushUrl({
                url: url,
                linkImageUrl,
                type,
                attrName: [attr],
                linkText: linkText ? [linkText] : undefined,
            }, el as HTMLElement);
        }
    }

    pushAllOfAttr("a", "href");
    if (enabledFlags.deepCollect) {
        // TODO: something idk
    }
    pushAllOfAttr("link", "href");
    pushAllOfAttr("img", "src", "image");
    pushAllOfAttr("video", "src", "video");
    pushAllOfAttr("source", "src", "video");

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
                    pushUrl({ url: url, styleName: [styleName], type: "url" }, el);
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
                pushUrl({ url: url, styleName: [styleName], type: "url" }, el);
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
            const prefix = start - CONTEXT > 0 ? "..." : "";
            const suffix = start + CONTEXT < val.length ? "..." : "";
            const contextString = prefix + val.substring(start - CONTEXT, end + CONTEXT) + suffix;

            pushUrl({
                url: url,
                linkText: [contextString],
                parentType: !parentElType ? undefined : [parentElType],
                type: "url"
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
        currentStatus = "";
        rerenderApp();
    }, 1000);
}

function collectUrlsDebounced() {
    if (!isEnabled()) {
        return;
    }

    clearTimeout(collectionTimeout);
    collectionTimeout = setTimeout(() => {
        currentStatus = "collecting_urls";
        collectionTimeout = 0;
        rerenderApp();

        collectLinks();
    }, 1000);

    currentStatus = "about_to_collect_urls";
    rerenderApp();
}

function exhaustiveSwitchGuard(_: never): never {
    throw new Error("unreachable");
}

const idClass = "c1078634182346018234607012374102";

// NOTE: we can't use our style system here - all styles must be inline or created with style generators in this file.
function ContentOverlayComponent(rg: RenderGroup) {
    let message = "";

    function statusToMessage(): string {
        switch (currentStatus) {
            case "":
                return "";
            case "url_not_found":
                return "URL couldn't be found on this page at the moment";
            case "save_urls_complete":
                let message;
                if (numNewUrls === 1) {
                    message = "Saved 1 new URL!";
                } else {
                    message = "Saved " + numNewUrls + " new URLs" + (numNewUrls > 0 ? "!" : "");
                }
                message += ` (${numNewUrlsTotal} overall)`;
                return message;
            case "about_to_collect_urls":
                return "About to collect URLS...";
            case "collecting_urls":
                return "Collecting urls...";
            case "no_new_urls_found":
                return "No new URLs found :(";
            case "scrolling_to_url":
                return "Scrolling to url..."
            case "saving_urls":
                return "Saving new URLS...";
            case "scrolling_to_url_invisible":
                return "Scrolling to url (however, it might not be present) ..."
            default:
                break;
        }

        exhaustiveSwitchGuard(currentStatus);
    }

    function isStatusSupressed() {
        if (
            currentStatus === "scrolling_to_url"
            || currentStatus === "scrolling_to_url_invisible"
            || currentStatus === "url_not_found"
        ) {
            return false;
        }

        return true;
    }

    // return value may only have 4 chars max
    function statusToBadgeString(): string {
        switch (currentStatus) {
            case "about_to_collect_urls":
                return ".";
            case "scrolling_to_url":
            case "scrolling_to_url_invisible":
            case "collecting_urls":
                return "..";
            case "url_not_found":
            case "no_new_urls_found":
                return "x";
            case "saving_urls":
                return "...";
            case "save_urls_complete":
                return numberToBadgeString(numNewUrls);
            case "":
                return numberToBadgeString(numNewUrlsTotal);
            default:
                break;
        }

        exhaustiveSwitchGuard(currentStatus);
    }


    let startedFetching = false;
    async function refetch() {
        if (startedFetching) {
            return;
        }
        startedFetching = true;

        enabledFlags = await getEnabledFlags();

        startedFetching = false;

        rerenderApp();
    }

    let needsRecollect = false;
    rg.preRenderFn(function renderPopup() {
        if (!enabledFlags) {
            needsRecollect = true;
        }

        if (!enabledFlags || hasExternalStateChanged()) {
            refetch();
            return;
        }

        if (needsRecollect) {
            needsRecollect = false;
            collectUrlsDebounced();
        }

        if (!isEnabled()) {
            overlayRoot.el.remove();
            clearTimeout(collectionTimeout)
            clearTimeout(clearMessageTimeout)
            return;
        }

        const silent = enabledFlags.silent && isStatusSupressed();
        if (setVisible(overlayRoot, !silent && !!currentStatus)) {
            document.body.appendChild(overlayRoot.el);

            message = statusToMessage();
            if (enabledFlags.deepCollect) {
                message = "[Deep collect]: " + message;
            }
        }

        if (enabledFlags.silent) {
            // only show the badge if we're collecting this silently.
            sendMessage({
                type: "set_tab_badge_text",
                text: statusToBadgeString(),
            });
        }

    })

    // NOTE: I've not figured out how to get css classes to work here yet, since it's a content script.
    // TODO: use style generator
    const overlayRoot = div({
        class: idClass,
        style: "all: unset; z-index: 999999; font-family: monospace; font-size: 14px; position: fixed; top: 0px; left: 0px; background-color: rgb(0,0,0,0.5); color: #FFF; text-align: right;" +
            "padding: 2px;"
    }, [
        div({}, [
            rg.text(() => message)
        ])
    ]);

    return overlayRoot;
}

const popup = newComponent(ContentOverlayComponent, null);
for (const oldPopup of document.querySelectorAll("." + idClass)) {
    oldPopup.remove();
}
insertAndInitializeAppAndRenderContext(popup.renderWithCurrentState);

async function collectLinks() {
    if (!isEnabled()) {
        return;
    }

    const tabUrlString = window.location.href;

    if (collectionTimeout !== 0) {
        clearTimeout(collectionTimeout);
        clearTimeout(clearMessageTimeout);
        collectionTimeout = 0;
    }

    rerenderApp();

    const links = getLinks();
    lastCollectedUrls = links ?? [];

    if (!links || links.length === 0) {
        currentStatus = "no_new_urls_found"

        rerenderApp();
        startClearMessageTimeout();
        return;
    }

    currentStatus = "saving_urls";
    rerenderApp();

    await saveNewUrls({
        type: "save_urls",
        currentTablUrl: tabUrlString,
        urls: links.map(result => result.linkInfo),
    });
}

// https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml
// (moz-extension isn't on there, but I use firefox, so I know it's legit)
function protocolIsExtension(protocol: string) {
    return protocol === 'ms-browser-extension:' ||
        protocol === 'moz-extension:' ||
        protocol === 'chrome-extension:';
}

// The web extension badge can only have 4 letters...
export function numberToBadgeString(n: number) {
    if (n < 1000) {
        // 0 - 999
        return "" + n;
    }

    if (n < 1000_000) {
        // 1k - 999k (thousand)
        return Math.floor(n / 1000) + "k";
    }

    if (n < 1000_000_000) {
        // 1m - 999m (million)
        return Math.floor(n / 1000) + "m";
    }

    if (n < 1000_000_000_000) {
        // 1b - 999b (billion)
        return Math.floor(n / 1000) + "b";
    }

    if (n < 1000_000_000_000_000) {
        // 1t - 999t  (trillion)
        return Math.floor(n / 1000) + "t";
    }

    throw new Error("Nah aint no way ur number this high bruh 😭😭😭 💀💀💀")
}

