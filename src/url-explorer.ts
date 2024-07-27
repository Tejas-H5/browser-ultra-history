import { Checkbox } from "./components/checkbox";
import { SKIP_READ_KEY, getSchemaInstanceFields, pluck, runReadTx } from "./default-storage-area";
import { SmallButton } from "./small-button";
import { URL_SCHEMA, UrlInfo, getCurrentTab, getUrlDomain } from "./state";
import { filterInPlace } from "./utils/array-utils";
import { __experimental__inlineComponent, div, divClass, el, newComponent, newListRenderer, newRenderGroup, newState, newStyleGenerator, on, setAttr, setAttrs, setClass, setInputValue, setVisible, span } from "./utils/dom-utils";
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
    ` .link-part:hover { cursor: pointer; text-decoration: underline; text-decoration-color: var(--fg-color); }`,
    `.alreadyInPath { color: #00F }`,
    `.recentlyVisited { background-color: #AFC2FF; }`,
    `.selected { background-color: var(--bg-color-focus); }`,
]);

export function LinkItem() {
    const s = newState<{
        url: string;
        linkText: string;
        onClick(url: string): void;
        onUrlPartClick(url: string): void;

        index?: number;
        linkInfo?: UrlInfo;
        isVisibleOnCurrentPage?: boolean;
        currentUrl?: string;
    }>();

    const rg = newRenderGroup();
    const root = divClass(`hover-parent hover handle-long-words ${cnLinkItem}`, {}, [
        rg.text(() => s.args.isVisibleOnCurrentPage ? "[Visible] " : ""),
        rg.text(() => s.args.linkText),
        on(
            span({ class: "link-part" }, [
                rg.text(() => " (" + s.args.url + ")"),
            ]), 
            "click", 
            () => s.args.onUrlPartClick(s.args.url),
        )
    ]);

    function render() {
        rg.render();

        setClass(root, "selected", s.args.currentUrl === s.args.url);
    }

    on(root, "click", () => {
        const { onClick, url: linkUrl } = s.args;
        onClick(linkUrl);
    });

    return newComponent(root, render, s);
}

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
function filterUrls(
    src: UrlInfo[], 
    dst: UrlInfo[], 
    urlHistory: string[],
    filter: UrlListFilter,
) {
    dst.splice(0, dst.length);

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
        onClick(url: string): void;
        onUrlClick(url: string): void;

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
        rg(newListRenderer(scrollContainer, LinkItem), c => c.render((getNext) => {
            const { currentlyVisibleUrls } = s.args;

            for (const linkInfo of filteredSortedLinks) {
                const linkUrl = linkInfo.url;
                const isVisible = currentlyVisibleUrls.some(url => url === linkUrl);

                getNext().render({
                    // mainly for debugging, toggle as needed
                    // index: i,

                    url: linkUrl,
                    linkText: linkInfo.linkText?.join(", ") ?? "",
                    onClick: s.args.onClick,
                    onUrlPartClick: s.args.onUrlClick,
                    linkInfo,
                    isVisibleOnCurrentPage: isVisible,
                    currentUrl: s.args.currentUrl ?? "",
                });
            }
        })),
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
    `{ width: 100%; color: var(--fg-color); background-color: var(--bg-color); }`,
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
        rg( newListRenderer(
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
            })),
            c => c.render((getNext) => {
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
            })
        )
    ]);

    return newComponent(root, rg.render, s);
}


function makeSeparator() {
    return div({ style: "height: 1px; background-color: var(--fg-color)" });
}

function setSelected(array: string[], key: string, val: boolean) {
    const isSelected = array.includes(key);
    if (isSelected === val) {
        return;
    }

    if (isSelected) {
        filterInPlace(array, (d) => d !== key);
    } else {
        array.push(key);
    }
}

function DomainsScreen() {
    function DomainItem() {
        const s = newState<{
            domain: string;
            count: number | undefined;
            isChecked: boolean;
            onChange(selectType: "replace" | "range" | "toggle"): void;
        }>();        

        function getCountText(): string {
            const count = s.args.count;
            if (count ===  undefined) {
                return "unknown count";
            }

            return "" + count;
        }

        const g = newRenderGroup();
        const root = div({ class: "row" }, [
            g(Checkbox(), c => c.render({
                value: s.args.isChecked,
                label: s.args.domain + " (" + getCountText() + ")",
                onChange(value, e) {
                    const selectType = e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "replace";
                    s.args.onChange(selectType);
                }
            })),
        ]);

        function renderDomainItem() {
            g.render();
        }

        return newComponent(root, renderDomainItem, s);
    }

    const s = newState<{
        visible: boolean;
        state: UrlExplorerState;
    }>();


    const refetcher = newRefetcher({
        async refetch() {
            const { state } = s.args;

            state.status = "loading domains...";
            state.renderUrlExplorer();
            let allDomains = await runReadTx("allDomains");
            allDomains = allDomains || [];

            const countTx: Record<string, string> = {};
            for (const domainUrl of allDomains) {
                countTx[domainUrl] = "allUrlsCount:" + domainUrl;
            }
            state.status = "loading domain counts...";
            state.renderUrlExplorer();
            const countData = await runReadTx(countTx);

            state.allDomains = [];
            for (const domainUrl of allDomains) {
                state.allDomains.push({
                    url: domainUrl,
                    count: countData[domainUrl],
                });
            }

            state.status = "done";
            state.renderUrlExplorer(true);
        },
        onError() {
            const { state } = s.args;
            state.status = "Error fetching statuses";
        }
    });

    let domainContains = "";
    function isDomainFiltered(domain: string) {
        return !domainContains || contains(domain, domainContains);
    }

    // TODO: literally use scroll container
    const scrollContainer = div({ 
        class: "nowrap overflow-y-auto", 
        // Need padding for the scrollbar
        style: "padding-bottom: 10px" 
    });
    const rg = newRenderGroup();
    const root = div({ class: "p-5 col", style: "max-height: 50%" }, [
        rg(setAttrs(TextInput(), { style: "width: 100%" }), (c) => c.render({
            text: domainContains,
            placeholder: "Domain contains...",
            onChange: (val) => {
                domainContains = val;
                renderDomainsScreen();
            }
        })),
        rg.if(() => s.args.state.allDomains.length === 0, rg => (
            div({}, "No domains! Try browsing some internet")
        )),
        rg(newListRenderer(scrollContainer, DomainItem), c => c.render((getNext) => {
            const { state } = s.args;

            for(let i = 0; i < state.allDomains.length; i++) {
                const domain = state.allDomains[i];
                if (!isDomainFiltered(domain.url)) continue;

                const isSelected = state.selectedDomains.includes(domain.url);
                const c = getNext();

                c.render({
                    domain: domain.url,
                    count: domain.count,
                    isChecked: isSelected, 
                    onChange(type) {
                        const state = s.args.state;

                        // disable range-selections if they can't be done
                        const lastIdx = state.allDomainsLastSelectedIdx;
                        state.allDomainsLastSelectedIdx = i;

                        if (
                            (lastIdx < 0 || lastIdx >= state.allDomains.length)
                            && type === "range"
                        ) {
                            type = "toggle";
                        }

                        if (type === "toggle") {
                            setSelected(state.selectedDomains, domain.url, !isSelected);
                            state.renderUrlExplorer(true);
                            return;
                        }

                        if (type === "replace") {
                            state.selectedDomains = [domain.url]
                            state.renderUrlExplorer(true);
                            return;
                        }

                        if (type === "range") {
                            const min = Math.min(lastIdx, i);
                            const max = Math.max(lastIdx, i);
                            for (let i = min; i <= max; i++) {
                                const domain = state.allDomains[i];
                                if (!isDomainFiltered(domain.url)) continue;
                                setSelected(state.selectedDomains, domain.url, !isSelected);
                            }

                            state.renderUrlExplorer(true);
                            return;
                        }

                        state.renderUrlExplorer(true);
                        return;
                    }
                });
            }
        }))
    ]);

    let lastVisible = false;
    function renderDomainsScreen() {
        if (lastVisible !== setVisible(root, s.args.visible)) {
            lastVisible = s.args.visible;
            refetcher.refetch();
            return;
        }

        if (!lastVisible) {
            return;
        }

        rg.render();
    }

    return newComponent(root, renderDomainsScreen, s);
}

function UrlsScreen() {
    const s = newState<{
        state: UrlExplorerState;
        onNavigate(url: string, newTab: boolean): void;
        onHighlightUrl(url: string): void;
    }>();

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        makeSeparator(),
        rg.if(() => !!s.args.state.currentUrl, (rg) =>
            div({ class: "row gap-5 justify-content-center align-items-center", style: "padding: 0 5px;" }, [
                rg.if(() => !!s.args.state.currentUrl, rg =>
                    rg(SmallButton(), c => c.render({
                        text: "Where?",
                        onClick: onHighlightSelected,
                    }))
                ),
                div({ class: "flex-1" }),
                div({ class: "b" }, [rg.text(() => s.args.state.currentUrl || "...")]),
                div({ class: "flex-1" }),
            ])
        ),
        div({ class: "row justify-content-center" }, [
            rg.if(() => !!s.args.state.currentLinkInfo, rg => rg(LinkInfoDetails(), (c) => {
                if (!s.args.state.currentLinkInfo) return;

                c.render({ linkInfo: s.args.state.currentLinkInfo, });
            })),
        ]),
        makeSeparator(),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 10px" }, [
            div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
            div({ class: "flex-1" }, [
                rg(setAttrs(TextInput(), { style: "width: 100%" }), (c) => c.render({
                    text: s.args.state.linkInfoFilter.urlContains,
                    placeholder: "Url contains...",
                    onChange: (val) => renderAction(() => s.args.state.linkInfoFilter.urlContains = val),
                })),
            ]),
            rg(SmallButton(), c => c.render({
                text: "Pages",
                onClick: () => renderAction(() => s.args.state.linkInfoFilter.showPages = !s.args.state.linkInfoFilter.showPages),
                toggled: s.args.state.linkInfoFilter.showPages,
                noBorderRadius: true,
            })),
            rg(SmallButton(), c => c.render({
                text: "Assets",
                onClick: () => renderAction(() => s.args.state.linkInfoFilter.showAssets = !s.args.state.linkInfoFilter.showAssets),
                toggled: s.args.state.linkInfoFilter.showAssets,
                noBorderRadius: true,
            })),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg(UrlList(), c => c.render({
                // TODO: links on this domain
                links: s.args.state.allUrlsMetadata,

                onClick: (url) => setCurrentUrl(url),
                onUrlClick: (url) => s.args.onNavigate(url, true),
                currentUrl: s.args.state.currentUrl,
                recentlyVisitedUrls: s.args.state.recentlyVisitedUrls,
                currentlyVisibleUrls: s.args.state.currentlyVisibleUrls,
                filter: s.args.state.linkInfoFilter,
                title: "All",
            })),
        ]),
    ]);

    function renderAction(fn: () => void) {
        fn();
        renderUrlsScreen();
    }

    function setCurrentUrl(url: string) {
        s.args.state.currentUrl = url;
        renderUrlsScreen();
    }

    function onHighlightSelected() {
        if (s.args.state.currentUrl) {
            s.args.onHighlightUrl(s.args.state.currentUrl);
        }
    }


    function renderUrlsScreen() {
        rg.render();
    }

    return newComponent(root, renderUrlsScreen, s);
}

type UrlExplorerState = {
    renderUrlExplorer(refetch?: boolean): void;
    linkInfoFilter: UrlListFilter;
    currentScreen: "url" | "domain";
    currentUrl?: string;
    currentlyVisibleUrls: string[];
    recentlyVisitedUrls: string[];
    allUrls: string[];
    selectedDomains: string[];
    allDomains: {
        url: string;
        count: number | undefined;
    }[];
    allDomainsLastSelectedIdx: number;
    allUrlsMetadata: UrlInfo[];
    currentLinkInfo?: UrlInfo;
    status: string;
};

export function UrlExplorer() {
    const s = newState<{
        onNavigate(url: string, newTab: boolean): void;
        onHighlightUrl(url: string): void;
    }>();

    const state: UrlExplorerState = {
        renderUrlExplorer: renderUrlExplorer,
        currentScreen: "url",
        currentlyVisibleUrls: [],
        recentlyVisitedUrls: [],
        allUrls: [],
        selectedDomains: [],
        allDomains: [],
        allDomainsLastSelectedIdx: -1,
        allUrlsMetadata: [],
        status: "",
        linkInfoFilter: {
            urlContains: "",
            showAssets: false,
            showPages: true,
        }
    }

    function getDomainsText(): string {
        const sb = [];
        for (const domain of state.selectedDomains) {
            if (sb.length > 10) {
                sb.push((state.selectedDomains.length - 10) + " more...")
                break;
            }

            sb.push(domain);
        }

        return sb.join(", ");
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        div({ class: "pointer b row p-5", style: "gap: 10px;" }, [
            rg(SmallButton(), c => c.render({
                text: state.currentScreen === "url" ? "Domains" : "Done",
                onClick() {
                    if (state.currentScreen === "url") {
                        state.currentScreen = "domain";
                        renderUrlExplorer();
                    } else {
                        state.currentScreen = "url";
                        renderAsync();
                    }
                }
            })),
            rg.text(() => getDomainsText() + " " + state.selectedDomains.length + "/" + state.allDomains.length || "<No domain>"),
        ]),
        rg(DomainsScreen(), c => c.render({
            state,
            visible: state.currentScreen === "domain",
        })),
        rg(UrlsScreen(), c => c.render({
            state,
            onNavigate: s.args.onNavigate,
            onHighlightUrl: s.args.onHighlightUrl,
        })),
        makeSeparator(),
        div({}, [
            rg.text(() => state.status),
        ]),
    ]);

    function renderUrlExplorer(refetch = false) {
        if (refetch) {
            renderAsync();
            return;
        }

        if (!state.linkInfoFilter.showPages && !state.linkInfoFilter.showAssets) {
            // at least one of these must be true...
            state.linkInfoFilter.showPages = true;
        }

        rg.render();
    }

    const fetchState = newRefetcher({
        refetch: async () => {
            state.status = "fetching url..."
            renderUrlExplorer();

            const tab = await getCurrentTab();
            const tabId = tab?.id;
            const tabUrl = tab?.url;

            // fetch all domains and urls
            {
                // fetch the data

                state.status = "loading all data..."
                renderUrlExplorer();

                const readTx: Record<string, any> = {};
                for (const domain of state.selectedDomains) {
                    readTx["allUrls:" + domain] = "allUrls:" + domain;
                    readTx["allUrlsCount:" + domain] = "allUrls:" + domain;
                }
                if (tabId !== undefined) {
                    readTx["currentVisibleUrlsRead"] = "currentVisibleUrls:" + tabId;
                } else {
                    readTx[SKIP_READ_KEY + "currentVisibleUrls"] = -1;
                }

                const data = await runReadTx(readTx);

                // process the data

                const currentVisibleUrlsRead = data["currentVisbleUrlsRead"];
                state.allUrls = [];
                for (const domain of state.selectedDomains) {
                    const urls = data["allUrls:" + domain];
                    if (urls) {
                        state.allUrls.push(...urls);
                    }
                }

                // TODO: fix to only be the recently visited ones instead of all of them...
                state.recentlyVisitedUrls = state.allUrls || [];
                state.currentlyVisibleUrls = currentVisibleUrlsRead || [];
            }

            // fetch url metadata
            {
                const readTx2: Record<string, any> = {};
                for (const url of state.allUrls) {
                    readTx2[url] = getSchemaInstanceFields(URL_SCHEMA, url, [
                        // TODO: ui should set thiS
                        "linkText",
                        "isAsset"
                    ]);
                }

                state.status = "fetching url metadata..."
                renderUrlExplorer();
                const data = await runReadTx(readTx2);

                state.status = "done"
                state.recentlyVisitedUrls = pluck(data, "allUrls") ?? [];
                state.allUrlsMetadata = Object.values(data);

                renderUrlExplorer();
            }

            // make sure we have a domain enabled if applicable
            if (state.selectedDomains.length === 0 && tabUrl) {
                const tabDomain = getUrlDomain(tabUrl);
                if (state.allDomains.find(d => d.url === tabDomain)) {
                    setSelected(state.selectedDomains, tabDomain, true);
                } else {
                    setSelected(state.selectedDomains, tabDomain, false);
                }
            }

            // reset the status
            setTimeout(() => {
                state.status = "";
                renderUrlExplorer();
            }, 3000);
        },
        onError: () => {
            state.status = "An error occured: " + fetchState.errorMessage;
            renderUrlExplorer();
        }
    });

    function renderAsync() {
        fetchState.refetch();
    }

    return newComponent(root, renderAsync, s);
}
