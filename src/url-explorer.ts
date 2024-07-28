import { SKIP_READ_KEY, getSchemaInstanceFields, pluck, runReadTx } from "./default-storage-area";
import { navigateToUrl } from "./open-pages";
import { SmallButton } from "./small-button";
import { URL_SCHEMA, UrlInfo, getCurrentTab, getUrlDomain } from "./state";
import { clear, filterInPlace } from "./utils/array-utils";
import { __experimental__inlineComponent, div, divClass, el, newComponent, newListRenderer, newRenderGroup, newState, newStyleGenerator, on, setAttr, setAttrs, setClass, setInputValue, setVisible, span } from "./utils/dom-utils";

type UrlListFilter = {
    urlContains: string;
    showAssets: boolean;
    showPages: boolean;
}

const sg = newStyleGenerator();

const cnLinkItem = sg.makeClass("linkItem", [
    `.incoming:hover::before { content: "<--- "; }`,
    `.outgoing:hover::after { content: " --->"; }`,
    `.alreadyInPath { color: #00F }`,
    `.recentlyVisited { background-color: #AFC2FF; }`,
    `.selected { background-color: var(--bg-color-focus); }`,
]);

// shift+select tends to highlight things in the browser by default.
// This will unselect the highlight
function deselectRanges() {
    document.getSelection()?.removeAllRanges();
}

export function LinkItem() {
    const s = newState<{
        url: string;
        linkText: string;
        onClick(url: string, type: SelectionType): void;
        isSelected : boolean;

        index?: number;
        linkInfo?: UrlInfo;
        isVisibleOnCurrentPage?: boolean;
    }>();

    const rg = newRenderGroup();
    const root = divClass(`hover-parent hover handle-long-words ${cnLinkItem}`, {}, [
        rg.text(() => s.args.isVisibleOnCurrentPage ? "[Visible] " : ""),
        rg.text(() => s.args.linkText),
        rg.text(() => " (" + s.args.url + ")"),
    ]);

    function render() {
        rg.render();

        setClass(root, "selected", s.args.isSelected);
    }

    on(root, "click", (e) => {
        const { onClick, url: linkUrl } = s.args;

        onClick(linkUrl, getSelectionType(e));
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

    const strLower = str.toLowerCase();
    return strLower.includes(queryStr.toLowerCase());
}

function urlInfoContains(urlInfo: UrlInfo, queryStr: string):  boolean {
    // this one is more important than the others
    return contains(urlInfo.url, queryStr) ||
        contains(urlInfo.styleName, queryStr) ||
        contains(urlInfo.attrName, queryStr) ||
        contains(urlInfo.contextString, queryStr) ||
        contains(urlInfo.linkText, queryStr) ||
        contains(urlInfo.linkImage, queryStr);
}

function filterUrls(
    src: UrlInfo[], 
    dst: UrlInfo[], 
    urlHistory: string[],
    filter: UrlListFilter,
) {
    dst.splice(0, dst.length);

    function pushSubset(recent: boolean) {
        for (const urlInfo of src) {
            const linkUrl = urlInfo.url;
            const isRecent = urlHistory.includes(linkUrl);

            if (recent !== isRecent) {
                continue;
            }

            if (!filter.showAssets && urlInfo.isAsset) {
                continue;
            }

            if (!filter.showPages && !urlInfo.isAsset) {
                continue;
            }

            // This expensive check goes last
            if (filter.urlContains && (
                !urlInfoContains(urlInfo, filter.urlContains)
            )) {
                // fallback to splitting the query string and anding all the results
                if (!filter.urlContains.split(" ").every(queryPart => {
                    return urlInfoContains(urlInfo, queryPart.trim());
                })) {
                    continue;
                }
            }

            dst.push(urlInfo);
        }
    }

    pushSubset(true);
    pushSubset(false);
}

function getFirstOrNone<T>(set: Set<T>): T | undefined {
    if (set.size > 1) {
        return undefined;
    }

    for (const v of set) {
        return v;
    }

    return undefined;
}

function UrlList()  {
    const s = newState<{
        links: UrlInfo[]; 
        state: UrlExplorerState;
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
                const { state } = s.args;
                const total = s.args.links.length;
                const filtered = state._filteredUrls.length;

                if (total !== filtered) {
                    return s.args.title + ": " + filtered + " / " + total;
                }

                return s.args.title + ": " + total;
            })]),
        ]),
        rg(newListRenderer(scrollContainer, LinkItem), c => c.render((getNext) => {
            const { currentlyVisibleUrls, selectedUrls, _filteredUrls } = s.args.state;

            for (const urlInfo of _filteredUrls) {
                const linkUrl = urlInfo.url;
                const isVisible = currentlyVisibleUrls.some(url => url === linkUrl);

                getNext().render({
                    // mainly for debugging, toggle as needed
                    // index: i,

                    url: linkUrl,
                    linkText: urlInfo.linkText?.join(", ") ?? "",
                    onClick(url, type) {
                        const { state } = s.args;
                        const index = state._filteredUrls.findIndex(info => info.url === url);
                        if (index === -1) {
                            return;
                        }

                        const lastIdx = state._filteredUrlsLastSelectedIdx;
                        state._filteredUrlsLastSelectedIdx = index;

                        updateSelection(
                            url,
                            index,
                            state.selectedUrls,
                            (i) => state._filteredUrls[i].url,
                            state._filteredUrls.length,
                            lastIdx,
                            type
                        );

                        deselectRanges();

                        state.renderUrlExplorer();
                    },
                    linkInfo: urlInfo,
                    isVisibleOnCurrentPage: isVisible,
                    isSelected: selectedUrls.has(urlInfo.url),
                });
            }
        })),
    ]);

    function render() {
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

function setSelectedSet(set: Set<string>, key: string, val: boolean) {
    if (val) {
        set.add(key);
    } else {
        set.delete(key);
    }
}

function setSelectedArray(array: string[], key: string, val: boolean) {
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

type SelectionType = "replace" | "range" | "toggle";

function updateSelection(
    key: string,
    selectIdx: number,
    selectedSet: Set<string>,
    getKey: (i: number) => string,
    numKeys: number,
    lastIdx: number,
    type: SelectionType
) {
    // disable range-selections if they can't be done
    const isSelected = selectedSet.has(key);

    if (
        (lastIdx < 0 || lastIdx >= numKeys)
        && type === "range"
    ) {
        type = "toggle";
    }

    if (type === "toggle") {
        setSelectedSet(selectedSet, key, !isSelected);
        return;
    }

    if (type === "replace") {
        selectedSet.clear();
        selectedSet.add(key);
        return;
    }

    if (type === "range") {
        const min = Math.min(lastIdx, selectIdx);
        const max = Math.max(lastIdx, selectIdx);
        for (let i = min; i <= max; i++) {
            const key = getKey(i);
            setSelectedSet(selectedSet, key, !isSelected);
        }

        return;
    }

    return;
}

function getSelectionType(e: MouseEvent): SelectionType {
    return e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "replace";
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
            rg.text(() => s.args.domain + " (" + getCountText() + ")")
        ]);

        on(root, "click", (e) => {
            s.args.onChange(getSelectionType(e));
        });

        function renderDomainItem() {
            setClass(root, "bg-color-focus", s.args.isChecked);
            g.render();
        }

        return newComponent(root, renderDomainItem, s);
    }

    const s = newState<{
        visible: boolean;
        state: UrlExplorerState;
    }>();


    function selectAllShouldDeselect(): boolean {
        const state = s.args.state;
        for (const domain of state._filteredDomains) {
            if (!state.selectedDomains.has(domain.url)) {
                return false;
            }
        }

        return true;
    }

    // TODO: literally use scroll container
    const scrollContainer = div({ 
        class: "nowrap overflow-y-auto", 
        // Need padding for the scrollbar
        style: "padding-bottom: 10px" 
    });
    const rg = newRenderGroup();
    const root = div({ class: "p-5 col", style: "max-height: 50%" }, [
        div({ class: "align-items-center row gap-5" }, [
            rg(setAttrs(SmallButton(), { class: " nowrap" }, true), c => {
                c.render({
                    text: selectAllShouldDeselect() ? "Deselect all" : "Select all",
                    onClick() {
                        const state = s.args.state;
                        const shouldSelect = !selectAllShouldDeselect();
                        for (const domain of state._filteredDomains) {
                            state.selectedDomains
                            setSelectedSet(state.selectedDomains, domain.url, shouldSelect);
                        }

                        state.renderUrlExplorer();
                    }
                })
            }),
            div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
            rg(setAttrs(TextInput(), { style: "width: 100%" }), (c) => c.render({
                text: s.args.state.domainFilter.urlContains,
                placeholder: "Domain contains...",
                onChange: (val) => {
                    s.args.state.domainFilter.urlContains = val;
                    s.args.state.renderUrlExplorer();
                }
            })),
        ]),
        rg.if(() => s.args.state.allDomains.length === 0, rg => (
            div({}, "No domains! Try browsing some internet")
        )),
        rg(newListRenderer(scrollContainer, DomainItem), c => c.render((getNext) => {
            const { state } = s.args;

            for(let i = 0; i < state._filteredDomains.length; i++) {
                const domain = state._filteredDomains[i];

                const isSelected = state.selectedDomains.has(domain.url);
                const c = getNext();

                c.render({
                    domain: domain.url,
                    count: domain.count,
                    isChecked: isSelected, 
                    onChange(type) {
                        const state = s.args.state;

                        // disable range-selections if they can't be done
                        const lastIdx = state._filteredDomainsLastSelectedIdx;
                        state._filteredDomainsLastSelectedIdx = i;

                        updateSelection(
                            domain.url,
                            i,
                            state.selectedDomains,
                            (i) => state._filteredDomains[i].url,
                            state._filteredDomains.length,
                            lastIdx,
                            type,
                        );

                        deselectRanges();

                        state.refetchData({ refetchDomains: true, refetchUrls: true });
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
            s.args.state.renderUrlExplorer();
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
        onNavigate(): void;
        onHighlightUrl(url: string): void;
    }>();

    function getSelectedUrlText() {
        const state = s.args.state;
        const sb = [];
        const sortedUrls = [...state.selectedUrls].sort();
        for(const url of sortedUrls) {
            sb.push(url);
            if (sb.length === 10) {
                sb.push("and " + (sortedUrls.length - 10) + " more...");
                break;
            }
        }
        return sb.join(", ");
    }

    function isCurrentUrlVisible(): boolean {
        const state = s.args.state;
        const url = getFirstOrNone(state.selectedUrls);
        if (!url) {
            return false;
        }
        return state.currentlyVisibleUrls.includes(url);
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        makeSeparator(),
        div({ class: "row justify-content-center" }, [
            rg.if(() => !!s.args.state.currentLinkInfo, rg => rg(LinkInfoDetails(), (c) => {
                if (!s.args.state.currentLinkInfo) return;

                c.render({ linkInfo: s.args.state.currentLinkInfo, });
            })),
        ]),
        makeSeparator(),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 10px" }, [
            div({ class: "b" }, [
                rg.text(() => getSelectedUrlText() || "...")
            ]),
        ]),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 10px" }, [
            div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
            div({ class: "flex-1" }, [
                rg(setAttrs(TextInput(), { style: "width: 100%" }), (c) => c.render({
                    text: s.args.state.urlFilter.urlContains,
                    placeholder: "Url contains...",
                    onChange(val) {
                        s.args.state.urlFilter.urlContains = val;
                        s.args.state.renderUrlExplorer();
                    },
                })),
            ]),
            rg(SmallButton(), c => c.render({
                text: "Pages",
                onClick: () => renderAction(() => s.args.state.urlFilter.showPages = !s.args.state.urlFilter.showPages),
                toggled: s.args.state.urlFilter.showPages,
                noBorderRadius: true,
            })),
            rg(SmallButton(), c => c.render({
                text: "Assets",
                onClick: () => renderAction(() => s.args.state.urlFilter.showAssets = !s.args.state.urlFilter.showAssets),
                toggled: s.args.state.urlFilter.showAssets,
                noBorderRadius: true,
            })),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg(UrlList(), c => c.render({
                // TODO: links on this domain
                links: s.args.state.allUrlsMetadata,
                title: "All",
                state: s.args.state,
            })),
        ]),
        makeSeparator(),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 5px;" }, [
            rg.if(() => isCurrentUrlVisible(), rg =>
                rg(SmallButton(), c => c.render({
                    text: "Where?",
                    onClick: onHighlightSelected,
                }))
            ),
            div({ class: "flex-1" }),
            rg.if(() => s.args.state.selectedUrls.size > 0, rg =>
                rg(SmallButton(), c => {
                    c.render({
                        text: "Go",
                        onClick() {
                            s.args.onNavigate();
                        }
                    })
                })
            )
        ])
    ]);

    function renderAction(fn: () => void) {
        fn();
        renderUrlsScreen();
    }

    function onHighlightSelected() {
        const { state } = s.args;
        const currentUrl = getFirstOrNone(state.selectedUrls);
        
        if (currentUrl) {
            s.args.onHighlightUrl(currentUrl);
        }
    }

    function renderUrlsScreen() {
        rg.render();
    }

    return newComponent(root, renderUrlsScreen, s);
}


type DomainData = {
    url: string;
    count: number | undefined;
};

type UrlExplorerStateRefetchOptions = { refetchUrls?: true; refetchDomains?: true; }

type UrlExplorerState = {
    renderUrlExplorer(): void;
    refetchData(options: UrlExplorerStateRefetchOptions): Promise<void>;
    urlFilter: UrlListFilter;
    currentScreen: "url" | "domain";
    currentlyVisibleUrls: string[];
    recentlyVisitedUrls: string[];
    selectedUrls: Set<string>;
    _filteredUrls: UrlInfo[];
    _filteredUrlsLastSelectedIdx: number;
    selectedDomains: Set<string>;
    allDomains: DomainData[];
    domainFilter: {
        urlContains: string;
    };
    _filteredDomains: DomainData[];
    _filteredDomainsLastSelectedIdx: number;
    allUrlsMetadata: UrlInfo[];
    currentLinkInfo?: UrlInfo;
    status: string;
};

export function UrlExplorer() {
    const s = newState<{
        openInNewTab: boolean;
        onHighlightUrl(url: string): void;
    }>();

    const state: UrlExplorerState = {
        renderUrlExplorer,
        refetchData,
        currentScreen: "url",
        currentlyVisibleUrls: [],
        recentlyVisitedUrls: [],
        selectedUrls: new Set(),
        _filteredUrls: [],
        _filteredUrlsLastSelectedIdx: -1,
        selectedDomains: new Set(),
        domainFilter: {
            urlContains: "",
        },
        allDomains: [],
        _filteredDomains: [],
        _filteredDomainsLastSelectedIdx: -1,
        allUrlsMetadata: [],
        status: "",
        urlFilter: {
            urlContains: "",
            showAssets: false,
            showPages: true,
        }
    }

    function getDomainsText(): string {
        const sb = [];
        const sortedDomains = [...state.selectedDomains].sort();
        for (const domain of sortedDomains) {
            if (sb.length > 10) {
                sb.push((sortedDomains.length - 10) + " more...")
                break;
            }

            sb.push(domain);
        }

        return sb.join(", ");
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        div({ class: "pointer b row p-5", style: "gap: 10px;" }, [
            rg(SmallButton(), c => {
                c.render({
                    text: state.currentScreen === "url" ? "Select domains" : "Done",
                    onClick() {
                        if (state.currentScreen === "url") {
                            state.currentScreen = "domain";
                            renderUrlExplorer();
                        } else {
                            state.currentScreen = "url";
                            renderAsync();
                        }
                    }
                });
            }),
            rg.text(() => getDomainsText() + " " + state.selectedDomains.size + "/" + state.allDomains.length || "<No domain>"),
        ]),
        rg(DomainsScreen(), c => c.render({
            state,
            visible: state.currentScreen === "domain",
        })),
        rg(UrlsScreen(), c => c.render({
            state,
            onNavigate() {
                if (state.selectedUrls.size === 0) {
                    return;
                }

                const url = getFirstOrNone(state.selectedUrls);
                if (url) {
                    if (s.args.openInNewTab) {
                        navigateToUrl(url, true, false);
                    } else {
                        navigateToUrl(url, false, false);
                    }
                    return;
                }

                // several confirm dialogs (peak UI design, actually) ...
                {
                    if (
                        state.selectedUrls.size > 10
                        && !confirm("You're about to open " + state.selectedUrls.size + " new tabs. Are you sure?")
                    ) {
                        return;
                    }

                    if (
                        state.selectedUrls.size > 50
                        && !confirm("You sure? " + state.selectedUrls.size + " new urls sounds like a bad idea")
                    ) {
                        return;
                    }

                    if (
                        state.selectedUrls.size > 100
                        && !confirm("No really, " + state.selectedUrls.size + " sounds like terrible idea. Most computers don't have enough ram for 20 new tabs! I shouldn't even be letting you do this! I hope you know what you're doing...")
                    ) {
                        return;
                    }
                }

                // if multiple selected, open them all in new tabs without leaving the current tab.
                for (const url of state.selectedUrls) {
                    navigateToUrl(url, true, false);
                }
            },
            onHighlightUrl: s.args.onHighlightUrl,
        })),
        makeSeparator(),
        div({}, [
            rg.text(() => state.status),
        ]),
    ]);


    async function refetchData(options: UrlExplorerStateRefetchOptions) {
        try {
            if (options.refetchDomains) {
                state.status = "loading domains...";
                renderUrlExplorer();
                let allDomains = await runReadTx("allDomains");

                allDomains = allDomains || [];
                const countTx: Record<string, string> = {};
                for (const domainUrl of allDomains) {
                    countTx[domainUrl] = "allUrlsCount:" + domainUrl;
                }

                state.status = "loading domain counts...";
                renderUrlExplorer();
                const countData = await runReadTx(countTx);

                state.allDomains = [];
                for (const domainUrl of allDomains) {
                    state.allDomains.push({
                        url: domainUrl,
                        count: countData[domainUrl],
                    });
                }
            }

            if (options.refetchUrls) {
                if (state.allDomains.length === 0) {
                    await refetchData({ refetchDomains: true });
                }

                state.status = "fetching url..."
                renderUrlExplorer();

                const tab = await getCurrentTab();
                const tabId = tab?.id;
                const tabUrl = tab?.url;

                // fetch all domains and urls
                const allUrls = [];
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
                    for (const domain of state.selectedDomains) {
                        const urls = data["allUrls:" + domain];
                        if (urls) {
                            allUrls.push(...urls);
                        }
                    }

                    // TODO: fix to only be the recently visited ones instead of all of them...
                    state.recentlyVisitedUrls = allUrls || [];
                    state.currentlyVisibleUrls = currentVisibleUrlsRead || [];
                }

                // fetch url metadata
                {
                    const readTx2: Record<string, any> = {};
                    for (const url of allUrls) {
                        readTx2[url] = getSchemaInstanceFields(URL_SCHEMA, url, [
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
                {
                    if (state.selectedDomains.size === 0 && tabUrl) {
                        const tabDomain = getUrlDomain(tabUrl);
                        if (state.allDomains.find(d => d.url === tabDomain)) {
                            setSelectedSet(state.selectedDomains, tabDomain, true);
                        } else {
                            setSelectedSet(state.selectedDomains, tabDomain, false);
                        }
                    }

                    if (state.selectedDomains.size === 0 && state.allDomains.length > 0) {
                        state.selectedDomains.add(state.allDomains[0].url);
                    }
                }
            }

            state.status = "ready";
            renderUrlExplorer();
        } catch (e) {
            state.status = "An error occured: " + e;
            renderUrlExplorer();
        }
    }

    function renderUrlExplorer() {
        // recompute state 
        if (!state.urlFilter.showPages && !state.urlFilter.showAssets) {
            // at least one of these must be true...
            state.urlFilter.showPages = true;
        }

        // recompute filtered domains
        {
            clear(state._filteredDomains);
            for (const domain of state.allDomains) {
                if (
                    !state.domainFilter.urlContains
                    || contains(domain.url, state.domainFilter.urlContains)
                ) {
                    state._filteredDomains.push(domain);
                }
            }
        }

        // recompute filtered urls
        {
            // TODO: check if this is hella slow or nah

            clear(state._filteredUrls);
            filterUrls(state.allUrlsMetadata, state._filteredUrls, state.currentlyVisibleUrls, state.urlFilter);
        }

        rg.render();
    }

    function renderAsync() {
        refetchData({ refetchDomains: true, refetchUrls: true });
    }

    return newComponent(root, renderAsync, s);
}
