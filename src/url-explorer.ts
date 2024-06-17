import { renderContext } from "./render-context";
import { SmallButton } from "./small-button";
import { CurrentLocationData, LinkInfo, getCurrentLocationData, getCurrentTabUrl, getLinkInfo, getLinkKey, getRecentlyVisitedUrls } from "./state";
import { __experimental__inlineComponent, div, divClass, el, newComponent, newRenderGroup, newStyleGenerator, on, setAttr, setAttrs, setClass, setInputValue, span } from "./utils/dom-utils";
import { newRefetcher } from "./utils/refetcher";

type UrlStackData = {
    url: string;
    isIncoming: boolean;
}

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
    type Args = {
        linkUrl: string;
        onClick(url: string): void;

        index?: number;
        linkInfo?: LinkInfo;
        isVisible?: boolean;
        isIncoming?: boolean;
        isAlreadyInPath?: boolean;
        isRecent?: boolean;
    };

    const rg = newRenderGroup();
    const root = divClass(`hover-parent hover handle-long-words ${cnLinkItem}`, {}, [
        rg.text(() => c.args.isVisible ? "[Visible] " : ""),
        rg.text(() => c.args.linkUrl),
    ]);

    const c = newComponent<Args>(root, render);

    function canClick() {
        return !c.args.isAlreadyInPath;
    }

    function render() {
        rg.render();

        setClass(root, "incoming", c.args.isIncoming === true);
        setClass(root, "outgoing", c.args.isIncoming === false);
        setClass(root, "alreadyInPath", !!c.args.isAlreadyInPath);
        setClass(root, "recentlyVisited", !!c.args.isRecent);
    }

    on(root, "click", () => {
        const { onClick, linkUrl } = c.args;

        if (canClick()) {
            onClick(linkUrl);
        }
    });

    return c;
}

function UrlList()  {
    type Args = {
        links: LinkInfo[]; 
        isIncoming: boolean;
        onClick: (url: string) => void;

        currentUrlsPath: UrlStackData[];
        recentlyVisitedUrls: string[];
        currentlyVisibleUrls: string[];
        filter: UrlListFilter;
        title: string;
    };

    const scrollContainer = div({ 
        class: "nowrap overflow-y-auto", 
        // Need padding for the scrollbar
        style: "padding-bottom: 10px" 
    });
    const rg = newRenderGroup();
    const root = divClass("flex-1 overflow-x-auto col", {}, [
        div({ class: "row justify-content-center", style: "padding: 0 10px;" }, [
            div({ class: "b" }, [rg.text(() => {
                const total = c.args.links.length;
                const filtered = filteredSortedLinks.length;

                if (total !== filtered) {
                    return c.args.title + ": " + filtered + " / " + total;
                }

                return c.args.title + ": " + total;
            })]),
        ]),
        rg.list(scrollContainer, LinkItem, (getNext) => {
            const { isIncoming, currentUrlsPath, recentlyVisitedUrls, currentlyVisibleUrls } = c.args;

            for (const linkInfo of filteredSortedLinks) {
                const linkUrl = isIncoming ? linkInfo.urlFrom : linkInfo.urlTo;
                const isRecent = recentlyVisitedUrls.includes(linkUrl);

                const isAlreadyInPath = currentUrlsPath.some(url => url.url === linkUrl);
                const isVisible = currentlyVisibleUrls.some(url => url === linkUrl);

                getNext().render({
                    // mainly for debugging, toggle as needed
                    // index: i,

                    linkUrl,
                    onClick: c.args.onClick,
                    isAlreadyInPath,
                    isRecent,
                    linkInfo,
                    isIncoming,
                    isVisible,
                });
            }
        }),
    ]);

    let filteredSortedLinks: LinkInfo[] = [];
    function recomputeSate() {
        const { links, isIncoming, recentlyVisitedUrls, filter } = c.args;

        filteredSortedLinks.splice(0, filteredSortedLinks.length);

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
            for (const linkInfo of links) {
                const linkUrl = isIncoming ? linkInfo.urlFrom : linkInfo.urlTo;
                const isRecent = recentlyVisitedUrls.includes(linkUrl);

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

                filteredSortedLinks.push(linkInfo);
            }
        }

        pushSubset(true);
        pushSubset(false);
    }

    const c = newComponent<Args>(root, render);

    function render() {
        recomputeSate();
        rg.render();
    }

    return c;
}

const cnTextInput = sg.makeClass("text-input", [
    `{ color: var(--fg-color); background-color: var(--bg-color); }`,
    `:focus { background-color: var(--bg-color-focus); }`,
]);

export function TextInput() {
    type Args = {
        text: string;
        placeholder: string;
        onChange(val: string): void;
    }

    const input = el<HTMLInputElement>("input", { class: cnTextInput })
    const root = div({ class: "row" }, [
        input,
    ]);

    const c = newComponent<Args>(root, render);

    function render() {
        setInputValue(input, c.args.text);
        setAttr(input, "placeholder", c.args.placeholder);
    }

    function onEdit() {
        c.args.onChange(input.el.value);
    }

    on(input, "input", onEdit);
    on(input, "blur", onEdit);

    return c;
}



export function LinkInfoDetails() {
    type LinkInfoDetailsArgs = {
        linkInfo: LinkInfo;
        incoming?: boolean;
    };

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
                rg.text(() => {
                    if (c.args.incoming === true) {
                        return "<-- " + c.args.linkInfo.urlFrom;
                    }

                    if (c.args.incoming === false) {
                        return c.args.linkInfo.urlTo + " -->";
                    }
                    
                    return c.args.linkInfo.urlFrom + " --> " + c.args.linkInfo.urlTo;
                })
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

                if (c.args.linkInfo.redirect) {
                    getNext().render({
                        alwaysRenderKey: true,
                        key: "This link was created by a redirect.", 
                        value: undefined,
                    });
                }

                if (c.args.linkInfo.isAsset) {
                    getNext().render({
                        alwaysRenderKey: true,
                        key: "This link should point to an asset.", 
                        value: undefined,
                    });
                }

                getNext().render({
                    key: "Link Text", 
                    value: c.args.linkInfo.linkText,
                });

                // TODO: highlight the url or something. 
                getNext().render({
                    key: "Surrounding Context", 
                    value: c.args.linkInfo.contextString,
                });

                getNext().render({
                    key: "[debug] Parent element tag name", 
                    value: c.args.linkInfo.parentType,
                });


                getNext().render({
                    key: "Attributes", 
                    value: c.args.linkInfo.attrName,
                });

                getNext().render({
                    key: "Styles", 
                    value: c.args.linkInfo.styleName,
                });
            }
        )
    ]);

    const c = newComponent<LinkInfoDetailsArgs>(root, rg.render);
    return c;
}

export function UrlExplorer() {
    type Args = { 
        onNavigate(url: string): void; 
        onHighlightUrl(url: string): void; 
    };

    function makeSeparator() {
        return div({ style: "height: 1px; background-color: var(--fg-color)" });
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        rg.if(() => urlStack.length > 1, (rg) => 
            div({ class: "row gap-5 justify-content-center align-items-center", style: "padding: 0 10px;" }, [
                rg.cArgs(SmallButton(), () => ({
                    text: "<- (" + urlStack.length + ")",
                    onClick: popPath,
                })),
                rg.if(() => canHighlightCurrentUrl(), rg => 
                    rg.cArgs(SmallButton(), () => ({
                        text: "Where?",
                        onClick: onHighlightSelected,
                    }))
                ),
                div({ class: "flex-1" }),
                div({ class: "b" }, [rg.text(() => "Currently selected")]),
                div({ class: "flex-1" }),
                rg.cArgs(SmallButton(), () => ({
                    text: "Go",
                    onClick: navigateToTopOfTabstack,
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
        div({ class: "col", style: "max-height: 50%" }, [
            rg.cArgs(UrlList(), () => {
                if (!data) return;

                return {
                    title: "Incoming",
                    links: data.incoming,
                    isIncoming: true,
                    onClick: (url) => pushPath(url, true),
                    currentUrlsPath: urlStack,
                    currentlyVisibleUrls,
                    recentlyVisitedUrls,
                    filter: linkInfoFilter,
                }
            }),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg.cArgs(UrlList(), () => {
                if (!data) return;

                return {
                    title: "Outgoing",
                    links: data.outgoing,
                    isIncoming: false,
                    onClick: (url) => pushPath(url, false),
                    currentUrlsPath: urlStack,
                    recentlyVisitedUrls,
                    currentlyVisibleUrls,
                    filter: linkInfoFilter,
                }
            }),
        ]),
    ]);

    const c = newComponent<Args>(root, () => {
        renderAsync(renderContext.forceRefetch);
    });

    function render() {
        if (!linkInfoFilter.showPages && !linkInfoFilter.showAssets) {
            // at least one of these must be true...
            linkInfoFilter.showPages = true;
        }

        rg.render();
    }

    function renderAction(fn: () => void) {
        fn();
        render();
    }

    const linkInfoFilter: UrlListFilter = {
        urlContains: "",
        showAssets: false,
        showPages: true,
    };

    const urlStack: UrlStackData[] = [];

    let data: CurrentLocationData | undefined;
    let currentlyVisibleUrls: string[] = [];
    let recentlyVisitedUrls: string[] = [];
    let currentLinkInfo: LinkInfo | undefined;
    let currentLinkInfoIsIncoming: boolean;

    const fetchState = newRefetcher(render, async () => {
        const currentUrl = peekUrls();
        const prevUrl = peekUrlsPrev();

        currentLinkInfo = undefined;
        if (currentUrl && prevUrl) {
            let linkKey: string | undefined;
            currentLinkInfoIsIncoming = currentUrl.isIncoming;
            if (currentUrl.isIncoming) {
                // this url was an incoming url into the previous url
                linkKey = getLinkKey(currentUrl.url, prevUrl.url);
            } else {
                linkKey = getLinkKey(prevUrl.url, currentUrl.url);
            }
            currentLinkInfo = await getLinkInfo(linkKey);
        }

        data = undefined;
        if (currentUrl) {
            data = await getCurrentLocationData(currentUrl.url);
            data.incoming.sort((a, b) => a.urlTo.localeCompare(b.urlTo));
            data.outgoing.sort((a, b) => a.urlTo.localeCompare(b.urlTo));

            recentlyVisitedUrls = await getRecentlyVisitedUrls();
            currentlyVisibleUrls = data.currentVisibleUrls;
        }
    });

    async function renderAsync(forceRefetch: boolean) {
        const currentTabUrl = await getCurrentTabUrl();
        if (!currentTabUrl) {
            // not in a tab! so wtf are we even doing here...
            // hence, early exit
            return;
        }

        if (
            (forceRefetch && urlStack.length === 1) ||
            currentTabUrl !== urlStack[0]?.url
        ) {
            resetPath(currentTabUrl);
            return;
        }

        if (!currentTabUrl) {
            return;
        }
    }

    function peekUrls(): UrlStackData | undefined {
        return urlStack[urlStack.length - 1];
    }

    function peekUrlsPrev(): UrlStackData | undefined {
        return urlStack[urlStack.length - 2];
    }


    async function resetPath(url: string) {
        urlStack.splice(0, urlStack.length);
        pushPath(
            url, 
            // The incoming of the first url doesn't matter at all. it will never be used. 
            false,
        );
    }

    async function pushPath(url: string, isIncoming: boolean) {
        if (peekUrls()?.url === url) {
            return;
        }

        urlStack.push({ 
            url,
            isIncoming,
        });
        await fetchState.refetch();
    }

    async function popPath() {
        if (urlStack.length > 1) {
            urlStack.pop();
            await fetchState.refetch();
        }
    }

    function navigateToTopOfTabstack() {
        const url = peekUrls();
        if (url) {
            c.args.onNavigate(url.url);
        }
    }

    function canHighlightCurrentUrl() {
        // Only applicable if we've clicked on a URL from the current page, i.e the 
        // stack looks like [current url, next url, also outgoing]
        return urlStack.length === 2 && !urlStack[1].isIncoming;
    }

    function onHighlightSelected() {
        if (!canHighlightCurrentUrl()) {
            return;
        }

        const url = urlStack[1].url;
        c.args.onHighlightUrl(url);
    }

    return c;
}
