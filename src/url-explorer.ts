import { SKIP_READ_KEY, getSchemaInstanceFields, runReadTx } from "./default-storage-area";
import { navigateToUrl } from "./open-pages";
import { SmallButton } from "./small-button";
import { UrlInfo, deleteDomains, deleteUrls, getCurrentTab, getUrlDomain, urlSchema } from "./state";
import { clear } from "./utils/array-utils";
import { InsertableList, RenderGroup, div, el, getState, newComponent, newStyleGenerator, setAttr, setAttrs, setClass, setInputValue, setText, span } from "./utils/dom-utils";

const DEBOUNCE_AMOUNT = 200;

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
    // Thanks bro: https://stackoverflow.com/questions/35361986/css-gradient-checkerboard-pattern
    ` .checkerboard {
          background-image: linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }`
]);

// shift+select tends to highlight things in the browser by default.
// This will unselect the highlight
function deselectRanges() {
    document.getSelection()?.removeAllRanges();
}

function contains(thing: string | string[] | undefined, queryStr: string): boolean {
    if (!thing) {
        return false;
    }

    let str = thing;
    if (Array.isArray(str)) {
        // prevent matching a word accross multiple different strings by adding a space
        str = str.join(" ");
    }

    const strLower = str.toLowerCase();
    return strLower.includes(queryStr.toLowerCase());
}

function urlInfoContains(urlInfo: UrlInfo, queryStr: string): boolean {
    // this one is more important than the others
    return contains(urlInfo.url, queryStr) ||
        contains(urlInfo.styleName, queryStr) ||
        contains(urlInfo.attrName, queryStr) ||
        contains(urlInfo.linkText, queryStr) ||
        contains(urlInfo.linkImageUrl, queryStr);
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

function UrlList(rg: RenderGroup<{ state: UrlExplorerState }>) {
    function ListItem(rg: RenderGroup<{
        urlInfo: UrlInfo;
        state: UrlExplorerState;
        urlText: string;
        onClick(info: UrlInfo, type: SelectionType): void;
        isSelected: boolean;
        isTile: boolean;

        isVisibleOnCurrentPage?: boolean;
    }>) {
        return div({ class: `hover-parent hover handle-long-words ${cnLinkItem}` }, [
            rg.class("selected", s => s.isSelected),
            rg.style("width", (s) => s.isTile ? "25%" : ""),
            rg.style("textWrap", (s) => s.isTile ? "wrap" : ""),
            rg.style("display", (s) => s.isTile ? "inline-block" : "block"),
            rg.on("mousedown", (s, e) => {
                const { onClick, urlInfo: linkInfo } = s;
                onClick(linkInfo, getSelectionType(e));
            }),
            rg.with(
                ({ state, urlInfo }) => {
                    if (state.showImages && !!urlInfo.linkImageUrl && urlInfo.linkImageUrl.length > 0) {
                        // a url may have multiple images against it - for now we're just displaying the last one...
                        return urlInfo.linkImageUrl[urlInfo.linkImageUrl.length - 1];
                    }
                },
                rg => el<HTMLImageElement>("img", {
                    class: "w-100 checkerboard overflow-y-auto",
                    loading: "lazy",
                    style: "max-height: 200vh;"
                }, [
                    rg.attr("src", imageUrl => imageUrl)
                ])
            ),
            div({ class: "handle-long-words" }, [
                span({}, rg.text(s => s.isVisibleOnCurrentPage ? "[Visible] " : "")),
                span({ class: "b" }, rg.text(s => s.urlText)),
                span({}, rg.text(s => " (" + s.urlInfo.url + ")"))
            ])
        ]);
    }

    function onItemClick(urlInfo: UrlInfo, type: SelectionType) {
        const { state } = getState(rg);
        const index = state._filteredUrls.findIndex(info => info === urlInfo);
        if (index === -1) {
            return;
        }

        const lastIdx = state._filteredUrlsLastSelectedIdx;
        state._filteredUrlsLastSelectedIdx = index;

        updateSelection(
            urlInfo.url,
            index,
            state.selectedUrls,
            (i) => state._filteredUrls[i].url,
            state._filteredUrls.length,
            lastIdx,
            type
        );

        state.renderUrlExplorer();
    }

    return div({ class: "flex-1 overflow-x-auto" }, [
        rg.list(
            div({
                class: "nowrap overflow-y-auto",
                // Need padding for the scrollbar style: "padding-bottom: 10px", 
            }),
            ListItem,
            (s, getNext, listViewRoot) => {
                const { _currentlyVisibleUrls, selectedUrls, _filteredUrls, isTileView } = s.state;

                // const isTileView = urlFilter.showAssets;
                // Turns out that this view is better for viewing a large number of links as well. lol.
                setClass(listViewRoot, "col", !isTileView);
                setClass(listViewRoot, "row", isTileView);
                setClass(listViewRoot, "flex-wrap", isTileView);

                for (const urlInfo of _filteredUrls) {
                    const linkUrl = urlInfo.url;
                    const isVisible = _currentlyVisibleUrls.has(linkUrl);

                    getNext().render({
                        // mainly for debugging, toggle as needed
                        // index: i,

                        urlInfo: urlInfo,
                        urlText: formatStringArray(urlInfo.linkText, "<unknown link text>"),
                        onClick: onItemClick,
                        isVisibleOnCurrentPage: isVisible,
                        isSelected: selectedUrls.has(urlInfo.url),
                        isTile: isTileView,
                        state: s.state,
                    });
                }
            }
        )
    ])
}

const cnTextInput = sg.makeClass("text-input", [
    `{ width: 100%; color: var(--fg-color); background-color: var(--bg-color); }`,
    `:focus { background-color: var(--bg-color-focus); }`,
]);

export function TextInput(rg: RenderGroup<{
    text: string;
    placeholder: string;
    onChange(val: string): void;
}>) {
    function onEdit() {
        const s = getState(rg);
        s.onChange(input.el.value);
    }

    const input = el<HTMLInputElement>("input", { class: cnTextInput }, [
        rg.on("input", onEdit),
        rg.on("blur", onEdit),
        rg.functionality((input, s) => {
            setInputValue(input, s.text);
            setAttr(input, "placeholder", s.placeholder);
        })
    ]);

    return div({ class: "row" }, [
        input
    ]);
}

function formatStringArray(str: string[] | undefined, defaultReturn: string) {
    if (!str || str.length === 0) {
        return defaultReturn;
    }

    return str.join(", ");
}

// TODO: needs to render multiple urls
export function UrlInfoDetails(rg: RenderGroup<{ urlInfo: UrlInfo }>) {
    const mainTextEl = div({ class: "inline-block b" });
    const urlTextEl = div({ class: "inline-block" });
    const collectedFromEl = div({ class: "inline-block" });

    rg.preRenderFn(function renderUrlInfoDetails(s) {
        const { urlInfo: { linkText, url, urlFrom } } = s;
        setText(mainTextEl, formatStringArray(linkText, "<unknown link text>"));
        setText(urlTextEl, "(" + url + ")");
        setText(collectedFromEl, "Collected from " + formatStringArray(urlFrom, "<unkown url!!!>"));
    });

    return div({}, [
        mainTextEl,
        div({ class: "row handle-long-words" }, [
            div({ style: "width: 20px;" }),
            urlTextEl,
            div({ style: "width: 20px;" }),
            collectedFromEl,
        ])
    ]);
}


function makeSeparator() {
    return div({ style: "height: 1px; background-color: var(--fg-color)" });
}

function setSelectedSet<K extends string | number>(set: Set<K>, key: K, val: boolean) {
    if (val) {
        set.add(key);
    } else {
        set.delete(key);
    }
}

type SelectionType = "replace" | "range" | "toggle";

function updateSelection<K extends string | number>(
    key: K,
    selectIdx: number,
    selectedSet: Set<K>,
    getKey: (i: number) => K,
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

        deselectRanges();

        return;
    }

    return;
}

function getSelectionType(e: MouseEvent): SelectionType {
    return e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "replace";
}

function DomainsScreen(rg: RenderGroup<{
    visible: boolean;
    state: UrlExplorerState;
}>) {
    function DomainItem(rg: RenderGroup<{
        domain: string;
        count: number | undefined;
        isChecked: boolean;
        onChange(selectType: "replace" | "range" | "toggle"): void;
    }>) {

        function getCountText(): string {
            const s = getState(rg);

            const count = s.count;
            if (count === undefined) {
                return "unknown count";
            }

            return "" + count;
        }

        return div({}, [
            rg.class("bg-color-focus", s => s.isChecked),
            rg.text(s => s.domain + " (" + getCountText() + ")"),
            rg.on("mousedown", (s, e) => s.onChange(getSelectionType(e))),
        ]);
    }

    let domainFilterInputDebounceTimeout = 0;
    function handleFilterInputChange(val: string) {
        const { state } = getState(rg);
        clearTimeout(domainFilterInputDebounceTimeout);
        domainFilterInputDebounceTimeout = setTimeout(() => {
            state.domainFilter.urlContains = val;
            state.renderUrlExplorer();
        }, DEBOUNCE_AMOUNT)
    }

    function handleDomainItemChange(i: number, type: SelectionType) {
        const s = getState(rg);
        const state = s.state;

        // disable range-selections if they can't be done
        const lastIdx = state._filteredDomainsLastSelectedIdx;
        state._filteredDomainsLastSelectedIdx = i;

        const domain = state._filteredDomains[i];
        updateSelection(
            domain.url,
            i,
            state.selectedDomains,
            (i) => state._filteredDomains[i].url,
            state._filteredDomains.length,
            lastIdx,
            type,
        );

        s.state.refetchData({ refetchUrls: true });

        return;
    }


    let lastVisible = false;
    rg.preRenderFn(function renderDomainsScreen(s) {
        const { visible, state } = s;
        if (lastVisible === visible) {
            return;
        }

        lastVisible = visible;
        if (visible) {
            state.refetchData({ refetchDomains: true });
        }
    });

    return rg.if(
        (s) => s.visible,
        (rg) =>
            div({ class: "p-5 col", style: "max-height: 50%" }, [
                div({ class: "align-items-center row gap-5" }, [
                    div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
                    rg.inlineFn(
                        setAttrs(newComponent(TextInput), { style: "width: 100%" }),
                        (c, { state }) => c.render({
                            text: state.domainFilter.urlContains,
                            placeholder: "Domain contains...",
                            onChange: handleFilterInputChange
                        }),
                    ),
                ]),
                rg.if((s) => s.state.allDomains.length === 0,
                    rg => div({}, "No domains! Try browsing some internet"),
                ),
                rg.list(
                    div({
                        class: "nowrap overflow-y-auto",
                        // Need padding for the scrollbar
                        style: "padding-bottom: 10px"
                    }),
                    DomainItem,
                    (s, getNext) => {
                        const { state } = s;

                        for (let i = 0; i < state._filteredDomains.length; i++) {
                            const domain = state._filteredDomains[i];
                            const isSelected = state.selectedDomains.has(domain.url);
                            getNext().render({
                                domain: domain.url,
                                count: domain.count,
                                isChecked: isSelected,
                                onChange(type) {
                                    handleDomainItemChange(i, type);
                                }
                            });
                        }
                    }
                ),
            ])
    )
}

function SelectedCount(rg: RenderGroup<{
    state: UrlExplorerState;
}>) {
    return div({ class: "b row justify-content-center", style: "padding: 0 10px;" }, [
        rg.text(({ state }) => {
            const total = state.allUrls.size;
            const filtered = state._filteredUrls.length;

            return total !== filtered ? (
                filtered + " / " + total
            ) : (
                "" + total
            );

        })
    ]);
}

function UrlsScreen(rg: RenderGroup<{
    state: UrlExplorerState;
    onNavigate(): void;
    onHighlightUrl(url: string): void;
}>) {

    function getSelectedUrlText() {
        const { state } = getState(rg);

        const sb = [];
        const sortedUrls = [...state.selectedUrls].sort();
        for (const url of sortedUrls) {
            sb.push(url);
            if (sb.length === 10) {
                sb.push("and " + (sortedUrls.length - 10) + " more...");
                break;
            }
        }

        return formatStringArray(sb, "No urls selected");
    }

    function isCurrentUrlVisible(): boolean {
        const { state } = getState(rg);
        const url = getFirstOrNone(state.selectedUrls);
        if (!url) {
            return false;
        }
        return state._currentlyVisibleUrls.has(url);
    }

    function allUrlsSelected() {
        const { state } = getState(rg);
        return state._filteredUrls.every(info => state.selectedUrls.has(info.url));
    }

    let urlFilterInputDebounceTimeout = 0;
    function handleFilterInputChange(val: string) {
        const s = getState(rg);
        clearTimeout(urlFilterInputDebounceTimeout);
        urlFilterInputDebounceTimeout = setTimeout(() => {
            s.state.urlFilter.urlContains = val;
            s.state.renderUrlExplorer();
        }, DEBOUNCE_AMOUNT);
    }

    function handleToggleSelect() {
        const { state } = getState(rg);
        const shouldSelect = !allUrlsSelected();
        for (const info of state._filteredUrls) {
            setSelectedSet(state.selectedUrls, info.url, shouldSelect);
        }
        state.renderUrlExplorer();
    }

    function onHighlightSelected() {
        const s = getState(rg);
        const { state } = s;
        const urlInfo = getCurrentUrlInfo(state);
        if (urlInfo) {
            s.onHighlightUrl(urlInfo.url);
        }
    }

    async function handleDeleteSelectedUrls() {
        const { state } = getState(rg);
        if (!confirm(`Are you sure you want to delete these urls? (${state.selectedUrls.size})`)) {
            return;
        }

        await deleteUrls([...state.selectedUrls]);
        await state.refetchData({ refetchUrls: true, refetchDomains: true });
    }

    return div({ class: "flex-1 p-5 col" }, [
        makeSeparator(),
        div({ class: "text-align-center" }, [
            () => {
                const children: InsertableList = [
                    rg.with(
                        ({ state }) => {
                            const urlInfo = getCurrentUrlInfo(state)
                            return urlInfo ? { urlInfo } : undefined;
                        },
                        rg => div({}, [
                            div({ class: "text-align-center" }, "One selected"),
                            rg.c(UrlInfoDetails, (c, s) => c.render(s))
                        ])
                    ),
                    rg.else(
                        rg => div({  }, [
                            div({ class: "text-align-center" }, "Multiple selected"),
                            div({ class: "b" }, [
                                rg.text(() => getSelectedUrlText() || "...")
                            ])
                        ]),
                    )
                ];

                return rg.c(HeaderButton, (c, s) => c.render({
                    onClick: s.onNavigate,
                    children,
                }));
            },
        ]),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 10px" }, [
            div({ class: "b", style: "padding-right: 10px" }, "Filters: "),
            div({ class: "flex-1" }, [
                rg.inlineFn(
                    setAttrs(newComponent(TextInput), { style: "width: 100%" }),
                    (c, s) => c.render({
                        text: s.state.urlFilter.urlContains,
                        placeholder: "Url contains...",
                        onChange: handleFilterInputChange
                    })
                )
            ]),
            rg.c(SmallButton, (c, s) => c.render({
                text: s.state.isTileView ? "Tiled" : "List",
                onClick() {
                    s.state.isTileView = !s.state.isTileView;
                    s.state.renderUrlExplorer();
                },
                noBorderRadius: true,
            })),
            span({}, "|"),
            rg.c(SmallButton, (c, s) => c.render({
                text: "Images " + (s.state.showImages ? "enabled" : "disabled"),
                onClick() {
                    s.state.showImages = !s.state.showImages;
                    s.state.renderUrlExplorer();
                },
                toggled: s.state.showImages,
                noBorderRadius: true,
            })),
            span({}, "|"),
            rg.c(SmallButton, (c, s) => c.render({
                text: "Pages",
                onClick() {
                    s.state.urlFilter.showPages = !s.state.urlFilter.showPages;
                    s.state.renderUrlExplorer();
                },
                toggled: s.state.urlFilter.showPages,
                noBorderRadius: true,
            })),
            rg.c(SmallButton, (c, s) => c.render({
                text: "Assets",
                onClick() {
                    s.state.urlFilter.showAssets = !s.state.urlFilter.showAssets;
                    s.state.renderUrlExplorer();
                },
                toggled: s.state.urlFilter.showAssets,
                noBorderRadius: true,
            })),
        ]),
        makeSeparator(),
        div({ class: "row gap-5 align-items-center", style: "padding: 0 5px;" }, [
            rg.if(
                isCurrentUrlVisible,
                rg => rg.c(SmallButton, (c) => c.render({
                    text: "Where?",
                    onClick: onHighlightSelected,
                }))
            ),
            rg.if(
                (s) => s.state.selectedUrls.size > 0,
                rg => rg.c(SmallButton, (c, s) => c.render({
                    text: s.state.selectedUrls.size === 1 ? "Open link" : "Open several links",
                    onClick: s.onNavigate,
                }))
            ),
            rg.inlineFn(
                setAttrs(newComponent(SmallButton), { class: " nowrap" }, true),
                (c) => c.render({
                    text: allUrlsSelected() ? "Deselect all" : "Select all",
                    onClick: handleToggleSelect,
                })
            ),
            div({ style: "width: 100px" }),
            rg.if(
                ({ state }) => state.selectedUrls.size > 0,
                rg => rg.c(SmallButton, (c) => c.render({
                    text: "Delete selected urls",
                    onClick: handleDeleteSelectedUrls,
                }))
            ),
            div({ class: "flex-1" }),
            rg.c(SelectedCount, (c, s) => c.render(s)),
            div({ class: "flex-1" }),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg.c(UrlList, (c, s) => c.render({
                // TODO: links on this domain/ TODO: links on this domain
                state: s.state
            }))
        ]),
        makeSeparator(),
    ]);
}


type DomainData = {
    url: string;
    count: number | undefined;
};

type UrlExplorerStateRefetchOptions = { refetchUrls?: true; refetchDomains?: true; }

type UrlExplorerState = {
    renderUrlExplorer(): void;
    refetchData(options: UrlExplorerStateRefetchOptions): Promise<void>;

    allUrls: Map<string, UrlInfo>;
    allDomains: DomainData[];
    _filteredUrls: UrlInfo[];
    _filteredUrlsLastSelectedIdx: number;
    selectedUrls: Set<string>;
    _currentlyVisibleUrls: Set<string>;
    selectedDomains: Set<string>;
    _filteredDomains: DomainData[];
    _filteredDomainsLastSelectedIdx: number;

    showImages: boolean;
    isTileView: boolean;
    urlFilter: UrlListFilter;
    currentScreen: "url" | "domain";
    domainFilter: { urlContains: string; };

    status: string;
};

function recomputeState(state: UrlExplorerState) {
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
        state._filteredDomains.sort((a, b) => (b.count || 0) - (a.count || 0));
    }

    // recompute filtered urls
    {
        // TODO: check if this is hella slow or nah

        clear(state._filteredUrls);
        function pushSubset(recent: boolean, image: boolean) {
            for (const urlInfo of state.allUrls.values()) {
                const isRecent = state._currentlyVisibleUrls.has(urlInfo.url);

                if (recent !== isRecent) {
                    continue;
                }

                const isAsset = urlInfo.type !== "url";
                if (!state.urlFilter.showAssets && isAsset) {
                    continue;
                }

                if (!state.urlFilter.showPages && !isAsset) {
                    continue;
                }

                if (image !== (urlInfo.type === "image")) {
                    continue;
                }

                // This expensive check goes last
                const urlContains = state.urlFilter.urlContains;
                if (urlContains && (
                    !urlInfoContains(urlInfo, urlContains)
                )) {
                    // fallback to splitting the query string and anding all the results
                    if (!urlContains.split(" ").every(queryPart => {
                        return urlInfoContains(urlInfo, queryPart.trim());
                    })) {
                        continue;
                    }
                }

                state._filteredUrls.push(urlInfo);
            }
        }

        // put all the currently visible urls above the other ones.
        pushSubset(true, true);
        pushSubset(false, true);
        pushSubset(true, false);
        pushSubset(false, false);
    }
}

function getCurrentUrlInfo(state: UrlExplorerState): UrlInfo | undefined {
    const currentId = getFirstOrNone(state.selectedUrls);
    if (!currentId) {
        return;
    }

    return state.allUrls.get(currentId);
}


function HeaderButton(rg: RenderGroup<{ children: InsertableList; onClick(): void; }>) {
    return div({ class: "row align-items-center justify-content-center", style: "padding: 10px 0" }, [
        el("BUTTON", { type: "button", class: "row flex-1 justify-content-center align-items-center" }, [
            rg.on("click", (s) => s.onClick()),
            rg.children((s) => s.children),
        ])
    ])
}

export function UrlExplorer(rg: RenderGroup<{
    openInNewTab: boolean;
    onHighlightUrl(url: string): void;
}>) {
    const state: UrlExplorerState = {
        // data structures that hold urls

        renderUrlExplorer,
        refetchData,
        showImages: false,
        isTileView: true,
        currentScreen: "url",
        _currentlyVisibleUrls: new Set(),
        _filteredUrls: [],
        _filteredUrlsLastSelectedIdx: -1,
        selectedDomains: new Set(),
        selectedUrls: new Set(),
        domainFilter: {
            urlContains: "",
        },
        allDomains: [],
        _filteredDomains: [],
        _filteredDomainsLastSelectedIdx: -1,
        allUrls: new Map(),
        status: "",
        urlFilter: {
            urlContains: "",
            showAssets: false,
            showPages: true,
        }
    };

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

        return formatStringArray(sb, "No domains selected");
    }

    function allDomainsSelected() {
        return state._filteredDomains.every(d => state.selectedDomains.has(d.url));
    }

    function handleShowHideDomains() {
        if (state.currentScreen === "url") {
            state.currentScreen = "domain";
        } else {
            state.currentScreen = "url";
        }

        renderUrlExplorer();
    }

    function handleSelectDeselectDomains() {
        const shouldSelect = !allDomainsSelected();
        for (const domain of state._filteredDomains) {
            setSelectedSet(state.selectedDomains, domain.url, shouldSelect);
        }
        state.refetchData({ refetchUrls: true });
    }

    function handleNavigate() {
        const s = getState(rg);

        if (state.selectedUrls.size === 0) {
            return;
        }

        const urlInfo = getCurrentUrlInfo(state);
        if (urlInfo) {
            if (s.openInNewTab) {
                navigateToUrl(urlInfo.url, true, false);
            } else {
                navigateToUrl(urlInfo.url, false, false);
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
    }

    async function refetchData(options: UrlExplorerStateRefetchOptions) {
        try {
            let t0 = Date.now();
            let domainsFetched = 0;
            let urlsFetched = 0;

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


                const lastSelected = state.selectedDomains;
                state.allDomains = [];
                state.selectedDomains = new Set();
                for (const domainUrl of allDomains) {
                    if (lastSelected.has(domainUrl)) {
                        state.selectedDomains.add(domainUrl);
                    }

                    state.allDomains.push({
                        url: domainUrl,
                        count: countData[domainUrl],
                    });
                }

                domainsFetched = state.allDomains.length;
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

                // fetch all domains and urls
                const allUrls = [];
                {
                    // fetch the data

                    state.status = "loading all data..."
                    renderUrlExplorer();

                    const readTx: Record<string, any> = {};
                    for (const domain of state.selectedDomains) {
                        readTx["allUrls:" + domain] = "allUrls:" + domain;
                        readTx["allUrlsCount:" + domain] = "allUrlsCount:" + domain;
                    }
                    if (tabId !== undefined) {
                        readTx["currentVisbleUrlsRead"] = "currentVisibleUrls:" + tabId;
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

                    state._currentlyVisibleUrls.clear();
                    if (currentVisibleUrlsRead) {
                        for (const url of currentVisibleUrlsRead) {
                            state._currentlyVisibleUrls.add(url);
                        }
                    }
                }

                // fetch url metadata
                {
                    const readTx2: Record<string, any> = {};
                    for (const url of allUrls) {
                        readTx2[url] = getSchemaInstanceFields(urlSchema, url, [
                            "linkImageUrl",
                            "linkText",
                            "urlFrom",
                            "type"
                        ]);
                    }

                    state.status = "fetching url metadata..."
                    renderUrlExplorer();
                    const data = await runReadTx(readTx2);

                    state.status = "done"

                    const lastSelected = state.selectedUrls;
                    state.selectedUrls = new Set();
                    state.allUrls.clear();
                    for (const id of allUrls) {
                        const urlInfo = data[id];
                        state.allUrls.set(id, urlInfo);

                        if (lastSelected.has(urlInfo.url)) {
                            state.selectedUrls.add(urlInfo.url);
                        }
                    }

                    urlsFetched = state.allUrls.size;

                    renderUrlExplorer();
                }
            }

            state.status = "fetched " + domainsFetched + " domains and " + urlsFetched + " urls in " + (Date.now() - t0) + "ms";
            // + " (cache had " + kvCache.size + " entries)";
            renderUrlExplorer();
        } catch (e) {
            console.error(e);
            state.status = "An error occured: " + e;
            renderUrlExplorer();
        }
    }

    function renderUrlExplorer() {
        rg.renderWithCurrentState();
    }

    let fetchedOnce = false;
    rg.preRenderFn(() => {
        recomputeState(state);

        if (!fetchedOnce) {
            fetchedOnce = true;
            refetchData({ refetchDomains: true, refetchUrls: true });
        }
    })

    return div({ class: "flex-1 p-5 col" }, [
        newComponent(HeaderButton, {
            onClick: handleShowHideDomains,
            children: [
                div({ class: "row align-items-center justify-content-center b", style: "padding: 0 5px" }, [
                    rg.text(() => state.currentScreen === "url" ? "Show domains > " : "Hide domains v "),
                ]),
                div({ class: "flex-1" }),
                div({ class: "b" }, [
                    rg.text(() => {
                        return getDomainsText() + " " + state.selectedDomains.size + "/"
                            + state.allDomains.length || "<No domain>";
                    }),
                ]),
                div({ class: "flex-1" }),
            ]
        }),
        rg.if(
            () => state.currentScreen === "domain",
            rg => div({ class: "pointer row p-5 justify-content-center", style: "gap: 10px;" }, [
                div({ class: "pointer row p-5", style: "gap: 10px;" }, [
                    rg.inlineFn(
                        setAttrs(newComponent(SmallButton), { class: " nowrap" }, true),
                        (c) => c.render({
                            text: allDomainsSelected() ? "Deselect all" : "Select all",
                            onClick: handleSelectDeselectDomains,
                        })
                    )
                ]),
                div({ style: "width: 10px" }),
                rg.if(
                    () => state.selectedDomains.size > 0,
                    rg => rg.inlineFn(
                        setAttrs(newComponent(SmallButton), { class: " nowrap" }, true),
                        (c) => c.render({
                            text: "Delete selected domains",
                            async onClick() {
                                if (!confirm(`Are you sure you want to delete these domains? (${state.selectedDomains.size})`)) {
                                    return;
                                }

                                await deleteDomains([...state.selectedDomains]);
                                await state.refetchData({ refetchUrls: true });
                            }
                        })
                    )
                ),
            ]),
        ),
        rg.c(DomainsScreen, (c) => c.render({
            state,
            visible: state.currentScreen === "domain",
        })),
        rg.c(UrlsScreen, (c, s) => c.render({
            state,
            onNavigate: handleNavigate,
            onHighlightUrl: s.onHighlightUrl,
        })),
        makeSeparator(),
        div({}, [
            rg.text(() => state.status),
        ])
    ]);
}
