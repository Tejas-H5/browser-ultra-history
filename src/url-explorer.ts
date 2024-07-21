import { getSchemaInstanceFields, pluck, runReadTx } from "./default-storage-area";
import { SmallButton } from "./small-button";
import { URL_SCHEMA, UrlInfo, getCurrentTabUrl } from "./state";
import { __experimental__inlineComponent, div, divClass, el, newComponent, newRenderGroup, newState, newStyleGenerator, on, setAttr, setAttrs, setClass, setInputValue, span } from "./utils/dom-utils";
import { newRefetcher } from "./utils/refetcher";

type UrlListFilter = {
    urlContains: string;
    showAssets: boolean;
    showPages: boolean;
}

const sg = newStyleGenerator();

const cnLinkItem = sg.makeClass("linkItem", [
    `.incoming:hover::before { content: "<--- "; }`,
    `.outgoing:hover::after { content: " --->"; }`,
    `:hover { cursor: pointer; text-decoration: underline; text-decoration-color: var(--fg-color); }`,
    `.alreadyInPath { color: #00F }`,
    `.recentlyVisited { background-color: #AFC2FF; }`,
]);

export function LinkItem() {
    const s = newState<{
        linkUrl: string;
        onClick(url: string): void;

        index?: number;
        linkInfo?: UrlInfo;
        isVisible?: boolean;
        isIncoming?: boolean;
        isAlreadyInPath?: boolean;
        isRecent?: boolean;
    }>();

    const rg = newRenderGroup();
    const root = divClass(`hover-parent hover handle-long-words ${cnLinkItem}`, {}, [
        rg.text(() => s.args.isVisible ? "[Visible] " : ""),
        rg.text(() => s.args.linkUrl),
    ]);

    function canClick() {
        return !s.args.isAlreadyInPath;
    }

    function render() {
        rg.render();

        setClass(root, "incoming", s.args.isIncoming === true);
        setClass(root, "outgoing", s.args.isIncoming === false);
        setClass(root, "alreadyInPath", !!s.args.isAlreadyInPath);
        setClass(root, "recentlyVisited", !!s.args.isRecent);
    }

    on(root, "click", () => {
        const { onClick, linkUrl } = s.args;

        if (canClick()) {
            onClick(linkUrl);
        }
    });

    return newComponent(root, render, s);
}

function filterUrls(
    src: UrlInfo[], 
    dst: UrlInfo[], 
    urlHistory: string[],
    filter: UrlListFilter,
) {
    dst.splice(0, dst.length);
    function contains(thing: string | string[] | undefined, queryStr: string): boolean {
        if (!thing) {
            return false;
        }

        let str = thing;
        if (Array.isArray(str)) {
            str = str.join(" ");
        }

        return str.toLowerCase().includes(queryStr.toLowerCase());
    }

    function pushSubset(recent: boolean) {
        for (const linkInfo of src) {
            const linkUrl = linkInfo.url;
            const isRecent = urlHistory.includes(linkUrl);

            if (recent !== isRecent) {
                continue;
            }

            if (filter.urlContains && (
                // this one is more important than the others
                !contains(linkUrl, filter.urlContains) &&
                !contains(linkInfo.styleName, filter.urlContains) &&
                !contains(linkInfo.attrName, filter.urlContains) &&
                !contains(linkInfo.contextString, filter.urlContains) &&
                !contains(linkInfo.linkText, filter.urlContains) &&
                !contains(linkInfo.linkImage, filter.urlContains)
            )) {
                continue;
            }

            if (!filter.showAssets && linkInfo.isAsset) {
                continue;
            }

            if (!filter.showPages && !linkInfo.isAsset) {
                continue;
            }

            dst.push(linkInfo);
        }
    }

    pushSubset(true);
    pushSubset(false);
}

function UrlList()  {
    const s = newState<{
        links: UrlInfo[]; 
        onClick: (url: string) => void;

        currentUrl: string | undefined;
        recentlyVisitedUrls: string[];
        currentlyVisibleUrls: string[];
        filter: UrlListFilter;
        title: string;
    }>();

    // TODO: literally use scroll container
    const scrollContainer = div({ 
        class: "nowrap overflow-y-auto", 
        // Need padding for the scrollbar
        style: "padding-bottom: 10px" 
    });
    const rg = newRenderGroup();
    const root = divClass("flex-1 overflow-x-auto col", {}, [
        div({ class: "row justify-content-center", style: "padding: 0 10px;" }, [
            div({ class: "b" }, [rg.text(() => {
                const total = s.args.links.length;
                const filtered = filteredSortedLinks.length;

                if (total !== filtered) {
                    return s.args.title + ": " + filtered + " / " + total;
                }

                return s.args.title + ": " + total;
            })]),
        ]),
        rg.list(scrollContainer, LinkItem, (getNext) => {
            const { currentlyVisibleUrls } = s.args;

            for (const linkInfo of filteredSortedLinks) {
                const linkUrl = linkInfo.url;
                const isVisible = currentlyVisibleUrls.some(url => url === linkUrl);

                getNext().render({
                    // mainly for debugging, toggle as needed
                    // index: i,

                    linkUrl,
                    onClick: s.args.onClick,
                    linkInfo,
                    isVisible,
                });
            }
        }),
    ]);

    const filteredSortedLinks: UrlInfo[] = [];
    function recomputeSate() {
        const { links, recentlyVisitedUrls, filter } = s.args;

        filterUrls(links, filteredSortedLinks, recentlyVisitedUrls, filter);
    }

    function render() {
        recomputeSate();
        rg.render();
    }

    return newComponent(root, render, s);
}

const cnTextInput = sg.makeClass("text-input", [
    `{ color: var(--fg-color); background-color: var(--bg-color); }`,
    `:focus { background-color: var(--bg-color-focus); }`,
]);

export function TextInput() {
    const s = newState<{
        text: string;
        placeholder: string;
        onChange(val: string): void;
    }>();

    const input = el<HTMLInputElement>("input", { class: cnTextInput })
    const root = div({ class: "row" }, [
        input,
    ]);

    function render() {
        setInputValue(input, s.args.text);
        setAttr(input, "placeholder", s.args.placeholder);
    }

    function onEdit() {
        s.args.onChange(input.el.value);
    }

    on(input, "input", onEdit);
    on(input, "blur", onEdit);

    return newComponent(root, render, s);
}



export function LinkInfoDetails() {
    const s = newState<{
        linkInfo: UrlInfo;
        incoming?: boolean;
    }>();

    function fmt(str: string[] | undefined) {
        if (!str) {
            return "";
        }

        return str.join(", ");
    }

    const rg = newRenderGroup();
    const root = div({}, [
        div({ class: "row handle-long-words" }, [
            div({}, [
                rg.text(() => s.args.linkInfo.url)
            ]),
        ]),
        rg.list(
            div(),
            () => __experimental__inlineComponent<{ 
                key: string; value: string[] | undefined; alwaysRenderKey?: boolean; 
            }>((rg, c) => {
                const hasValue = () => !!c.args.value && c.args.value.length > 0;

                return div({ class: "row"}, [
                    // always render a key
                    rg.if(() => c.args.alwaysRenderKey || hasValue(), 
                        rg => div({ class:"b" }, [ rg.text(() => "" + c.args.key) ])),
                    // only render this value if we have a value
                    rg.if(hasValue, (rg) => span({}, [
                        span({ class:"b" }, [ ":" ]),
                        rg.text(() => ": " + fmt(c.args.value))
                    ])),
                ])
            }),
            (getNext) => {
                // TODO:
                // rg.if(() => !!c.args.index, rg => rg.text(() => "" + c.args.index!)),
                // rg.text(() => fmt("Image", c.args.linkInfo?.linkImage)),
                //
                // [x] rg.text(() => fmt("Link text", c.args.linkInfo?.linkText)),
                // [~x] rg.text(() => fmt("Context", c.args.linkInfo?.contextString)),
                // [x] rg.text(() => fmt("Redirect", c.args.linkInfo?.redirect && ["redirect"])),
                // [x] rg.text(() => fmt("Attribute", c.args.linkInfo?.attrName)),
                // [x]rg.text(() => fmt("Style", c.args.linkInfo?.styleName)),

                if (s.args.linkInfo.isRedirect) {
                    getNext().render({
                        alwaysRenderKey: true,
                        key: "This link was created by a redirect.", 
                        value: undefined,
                    });
                }

                if (s.args.linkInfo.isAsset) {
                    getNext().render({
                        alwaysRenderKey: true,
                        key: "This link is an asset.", 
                        value: undefined,
                    });
                }

                getNext().render({
                    key: "Link Text", 
                    value: s.args.linkInfo.linkText,
                });

                // TODO: highlight the url or something. 
                getNext().render({
                    key: "Surrounding Context", 
                    value: s.args.linkInfo.contextString,
                });

                getNext().render({
                    key: "[debug] Parent element tag name", 
                    value: s.args.linkInfo.parentType,
                });


                getNext().render({
                    key: "Attributes", 
                    value: s.args.linkInfo.attrName,
                });

                getNext().render({
                    key: "Styles", 
                    value: s.args.linkInfo.styleName,
                });
            }
        )
    ]);

    return newComponent(root, rg.render, s);
}

export function UrlExplorer() {
    const s = newState<{ 
        onNavigate(url: string, newTab: boolean): void; 
        onHighlightUrl(url: string): void; 
    }>();

    function makeSeparator() {
        return div({ style: "height: 1px; background-color: var(--fg-color)" });
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        rg.if(() => !!currentUrl, (rg) => 
            div({ class: "row gap-5 justify-content-center align-items-center", style: "padding: 0 10px;" }, [
                rg.if(() => !!currentUrl, rg => 
                    rg.cArgs(SmallButton(), () => ({
                        text: "Where?",
                        onClick: onHighlightSelected,
                    }))
                ),
                div({ class: "flex-1" }),
                div({ class: "b" }, [rg.text(() => currentUrl || "...")]),
                div({ class: "flex-1" }),
                rg.cArgs(SmallButton(), () => ({
                    text: "Go",
                    onClick: () => navigateToTopOfTabstack(false),
                })),
                rg.cArgs(SmallButton(), () => ({
                    text: "New tab",
                    onClick: () => navigateToTopOfTabstack(true),
                })),
            ])
        ),
        div({ class: "row justify-content-center" }, [
            rg.if(() => !!currentLinkInfo, rg => rg.cArgs(LinkInfoDetails(), () => {
                if (!currentLinkInfo) return;

                return {
                    linkInfo: currentLinkInfo,
                    incoming: currentLinkInfoIsIncoming,
                };
            })),
        ]),
        makeSeparator(),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 10px" }, [
            div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
            rg.cArgs(setAttrs(TextInput(), { style: "max-width: 35%" }), () => ({
                text: linkInfoFilter.urlContains, 
                placeholder: "Url Contains...",
                onChange: (val) => renderAction(() => linkInfoFilter.urlContains = val),
            })),
            div({ class: "flex-1" }),
            rg.cArgs(SmallButton(), () => ({
                text: "Pages",
                onClick: () => renderAction(() => linkInfoFilter.showPages = !linkInfoFilter.showPages),
                toggled: linkInfoFilter.showPages,
                noBorderRadius: true,
            })),
            rg.cArgs(SmallButton(), () => ({
                text: "Assets",
                onClick: () => renderAction(() => linkInfoFilter.showAssets = !linkInfoFilter.showAssets),
                toggled: linkInfoFilter.showAssets,
                noBorderRadius: true,
            })),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg.cArgs(UrlList(), () => {
                return {
                    // TODO: links on this domain
                    links: allUrlsMetadata,

                    onClick: (url) => setCurrentUrl(url),
                    currentUrl: currentUrl,
                    recentlyVisitedUrls: recentlyVisitedUrls,
                    currentlyVisibleUrls: currentlyVisibleUrls,
                    filter: linkInfoFilter,
                    title: "All",
                }
            }),
        ]),
        makeSeparator(),
        div({}, [
            rg.text(() => status),
        ]),
    ]);

    function renderElements() {
        if (!linkInfoFilter.showPages && !linkInfoFilter.showAssets) {
            // at least one of these must be true...
            linkInfoFilter.showPages = true;
        }

        rg.render();
    }

    function renderAction(fn: () => void) {
        fn();
        renderElements();
    }

    const linkInfoFilter: UrlListFilter = {
        urlContains: "",
        showAssets: false,
        showPages: true,
    };

    let currentUrl: string | undefined;
    let currentlyVisibleUrls: string[] = [];
    let recentlyVisitedUrls: string[] = [];
    let allUrls: string[] = [];
    let allUrlsMetadata: UrlInfo[] = [];
    let currentLinkInfo: UrlInfo | undefined;
    let currentLinkInfoIsIncoming: boolean;
    let status = "";

    const fetchState = newRefetcher({
        refetch: async () => {
            status = "fetching url..."
            renderElements();

            if (!currentUrl) {
                currentUrl = await getCurrentTabUrl();
            }

            status = "fetching all urls..."
            renderElements();

            const readTx: Record<string, any> = {};
            readTx["allUrls"] = "allUrls";
            readTx["currentVisibleUrls"] = "currentVisibleUrls";

            const { 
                allUrls: allUrlsRead, 
                currentVisibleUrls: currentVisibleUrlsRead,
            } = await runReadTx(readTx);

            allUrls = allUrlsRead || [];

            // TODO: fix to only be the recently visited ones instead of all of them...
            recentlyVisitedUrls = allUrls || [];
            currentlyVisibleUrls = currentVisibleUrlsRead || [];

            const readTx2: Record<string, any> = {};
            for (const url of allUrls) {
                readTx2[url] = getSchemaInstanceFields(URL_SCHEMA, url, [
                    "linkText",
                    "isAsset"
                ]);
            }

            status = "fetching url metadata..."
            renderElements();
            const data = await runReadTx(readTx2);

            console.log({ readTx, allUrlsRead, allUrls, readTx2, data })

            status = "done"
            recentlyVisitedUrls = pluck(data, "allUrls") ?? [];
            allUrlsMetadata = Object.values(data);

            renderElements();

            setTimeout(() => {
                status = "";
                renderElements();
            }, 3000);
        }, 
        onError: () => {
            status = "An error occured: "  + fetchState.errorMessage;
            renderElements();
        }
    });

    async function renderAsync() {
        await fetchState.refetch();
    }

    function setCurrentUrl(url: string) {
        currentUrl = url;
        renderAsync();
    }

    function onHighlightSelected() {
        if (currentUrl) {
            s.args.onHighlightUrl(currentUrl);
        }
    }

    function navigateToTopOfTabstack(newTab: boolean) {
        if (currentUrl) {
            s.args.onNavigate(currentUrl, newTab);
        }
    }

    return newComponent(root, () => renderAsync(), s);
}
