import { SKIP_READ_KEY, getSchemaInstanceFields, runReadTx } from "./default-storage-area";
import { navigateToUrl } from "./open-pages";
import { SmallButton } from "./small-button";
import { UrlInfo, deleteDomains, deleteUrls, getCurrentTab, getUrlDomain, groupByUrlDomain, urlSchema } from "./state";
import { clear, filterInPlace } from "./utils/array-utils";
import { __experimental__inlineComponent, div, divClass, el, newComponent, newListRenderer, newRenderGroup, newState, newStyleGenerator, on, setAttr, setAttrs, setClass, setInputValue, setStyle, setVisible, span } from "./utils/dom-utils";

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

function UrlList() {
    const s = newState<{
        state: UrlExplorerState;
    }>();

    function ListItem() {
        const s = newState<{
            urlInfo: UrlInfo;
            state: UrlExplorerState;
            urlText: string;
            onClick(info: UrlInfo, type: SelectionType): void;
            isSelected: boolean;
            isTile: boolean;

            isVisibleOnCurrentPage?: boolean;
        }>();

        const rg = newRenderGroup();
        const img = el<HTMLImageElement>("img");
        const root = divClass(`hover-parent hover handle-long-words ${cnLinkItem}`, {}, [
            setAttrs(img, { class: "w-100 checkerboard overflow-y-auto", loading: "lazy", style: "max-height: 200vh;" }),
            div({ class: "handle-long-words" }, [
                rg.text(() => s.args.isVisibleOnCurrentPage ? "[Visible] " : ""),
                span({ class: "b" }, [
                    rg.text(() => s.args.urlText),
                ]),
                rg.text(() => " (" + s.args.urlInfo.url + ")"),
            ])
        ]);

        function render() {
            rg.render();

            setClass(root, "selected", s.args.isSelected);
            if (s.args.isTile) {
                setStyle(root, "width", "25%");
                setStyle(root, "textWrap", "wrap");
                setStyle(root, "display", "inline-block");
            } else {
                setStyle(root, "width", "");
                setStyle(root, "textWrap", "");
                setStyle(root, "display", "block");
            }

            const state = s.args.state;
            const urlInfo = s.args.urlInfo;

            if (setVisible(
                img,
                state.showImages
                && urlInfo.linkImageUrl && urlInfo.linkImageUrl.length > 0
            )) {
                setAttr(img, "src", urlInfo.linkImageUrl![urlInfo.linkImageUrl!.length - 1]);
            } else {
                setAttr(img, "src", "");
            }
        }

        on(root, "mousedown", (e) => {
            const { onClick, urlInfo: linkInfo } = s.args;
            onClick(linkInfo, getSelectionType(e));
        });

        return newComponent(root, render, s);
    }

    function onItemClick(urlInfo: UrlInfo, type: SelectionType) {
        const { state } = s.args;
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

    const listViewRoot = div({
        class: "nowrap overflow-y-auto",
        // Need padding for the scrollbar
        style: "padding-bottom: 10px",
    });

    const mediaViewRoot = div({
        class: "overflow-y-auto",
        // Need padding for the scrollbar
        style: "padding-bottom: 10px",
    });

    const rg = newRenderGroup();
    const root = divClass("flex-1 overflow-x-auto", {}, [
        rg(newListRenderer(listViewRoot, ListItem), c => c.render((getNext) => {
            const { _currentlyVisibleUrls, selectedUrls, _filteredUrls, urlFilter } = s.args.state;

            // const isTileView = urlFilter.showAssets;
            // Turns out that this view is better for viewing a large number of links as well. lol.
            const isTileView = true;

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
                    urlText: urlInfo.linkText?.join(", ") ?? "",
                    onClick: onItemClick,
                    isVisibleOnCurrentPage: isVisible,
                    isSelected: selectedUrls.has(urlInfo.url),
                    isTile: isTileView,
                    state: s.args.state,
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


// TODO: needs to render multiple urls
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
        rg(newListRenderer(
            div(),
            () => __experimental__inlineComponent<{
                key: string; value: string[] | undefined; alwaysRenderKey?: boolean;
            }>((rg, c) => {
                const hasValue = () => !!c.args.value && c.args.value.length > 0;

                return div({ class: "row" }, [
                    // always render a key
                    rg.if(() => c.args.alwaysRenderKey || hasValue(),
                        rg => div({ class: "b" }, [rg.text(() => "" + c.args.key)])),
                    // only render this value if we have a value
                    rg.if(hasValue, (rg) => span({}, [
                        span({ class: "b" }, [":"]),
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

                if (s.args.linkInfo.type !== "url") {
                    getNext().render({
                        alwaysRenderKey: true,
                        key: "type=" + s.args.linkInfo.type,
                        value: undefined,
                    });
                }

                getNext().render({
                    key: "Link Text",
                    value: s.args.linkInfo.linkText,
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

function setSelectedSet<K extends string | number>(set: Set<K>, key: K, val: boolean) {
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
            if (count === undefined) {
                return "unknown count";
            }

            return "" + count;
        }

        const g = newRenderGroup();
        const root = div({ class: "row" }, [
            rg.text(() => s.args.domain + " (" + getCountText() + ")")
        ]);

        on(root, "mousedown", (e) => {
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

    // TODO: literally use scroll container
    const scrollContainer = div({
        class: "nowrap overflow-y-auto",
        // Need padding for the scrollbar
        style: "padding-bottom: 10px"
    });
    const rg = newRenderGroup();
    const root = div({ class: "p-5 col", style: "max-height: 50%" }, [
        div({ class: "align-items-center row gap-5" }, [
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

            for (let i = 0; i < state._filteredDomains.length; i++) {
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

                        s.args.state.refetchData({ refetchUrls: true });

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
            s.args.state.refetchData({ refetchDomains: true });
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
        for (const url of sortedUrls) {
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
        return state._currentlyVisibleUrls.has(url);
    }

    function allUrlsSelected() {
        const { state } = s.args;
        return state._filteredUrls.every(info => state.selectedUrls.has(info.url));
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        makeSeparator(),
        div({ class: "row justify-content-center" }, [
            rg.if(() => !!getCurrentUrlInfo(s.args.state), rg => rg(LinkInfoDetails(), (c) => {
                const currentUrlInfo = getCurrentUrlInfo(s.args.state);
                if (currentUrlInfo)  {
                    c.render({ linkInfo: currentUrlInfo  });
                }
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
                text: "Images " + (s.args.state.showImages ? "enabled" : "disabled"),
                onClick() {
                    s.args.state.showImages = !s.args.state.showImages;
                    s.args.state.renderUrlExplorer();
                },
                toggled: s.args.state.showImages,
                noBorderRadius: true,
            })),
            span({}, "|"),
            rg(SmallButton(), c => c.render({
                text: "Pages",
                onClick() {
                    s.args.state.urlFilter.showPages = !s.args.state.urlFilter.showPages;
                    s.args.state.renderUrlExplorer();
                },
                toggled: s.args.state.urlFilter.showPages,
                noBorderRadius: true,
            })),
            rg(SmallButton(), c => c.render({
                text: "Assets",
                onClick() {
                    s.args.state.urlFilter.showAssets = !s.args.state.urlFilter.showAssets;
                    s.args.state.renderUrlExplorer();
                },
                toggled: s.args.state.urlFilter.showAssets,
                noBorderRadius: true,
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
            rg.if(() => s.args.state.selectedUrls.size > 0, rg =>
                rg(SmallButton(), c => {
                    c.render({
                        text: s.args.state.selectedUrls.size === 1 ? "Open link" : "Open several links",
                        onClick() {
                            s.args.onNavigate();
                        }
                    })
                })
            ),
            rg(setAttrs(SmallButton(), { class: " nowrap" }, true), c => {
                c.render({
                    text: allUrlsSelected() ? "Deselect all" : "Select all",
                    onClick() {
                        const { state } = s.args;
                        const shouldSelect = !allUrlsSelected();
                        for (const info of state._filteredUrls) {
                            setSelectedSet(state.selectedUrls, info.url, shouldSelect);
                        }
                        state.renderUrlExplorer();
                    }
                })
            }),
            div({ style: "width: 100px" }),
            rg.if(() => s.args.state.selectedUrls.size > 0, rg =>
                rg(SmallButton(), c => {
                    c.render({
                        text: "Delete selected urls",
                        async onClick() {
                            const { state } = s.args;
                            if (!confirm(`Are you sure you want to delete these urls? (${state.selectedUrls.size})`)) {
                                return;
                            }

                            await deleteUrls([...state.selectedUrls]);
                            await state.refetchData({ refetchUrls: true, refetchDomains: true });
                        }
                    })
                })
            ),
            div({ class: "flex-1" }),
            div({ class: "row justify-content-center", style: "padding: 0 10px;" }, [
                div({ class: "b" }, [rg.text(() => {
                    const { state } = s.args;
                    const total = state.allUrls.size;
                    const filtered = state._filteredUrls.length;

                    if (total !== filtered) {
                        return filtered + " / " + total;
                    }

                    return "" + total;
                })]),
            ]),
            div({ class: "flex-1" }),
        ]),
        makeSeparator(),
        div({ class: "flex-1 col" }, [
            rg(UrlList(), c => c.render({
                // TODO: links on this domain
                state: s.args.state,
            })),
        ]),
        makeSeparator(),
    ]);

    function onHighlightSelected() {
        const { state } = s.args;
        const urlInfo = getCurrentUrlInfo(state);
        if (urlInfo) {
            s.args.onHighlightUrl(urlInfo.url);
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
    urlFilter: UrlListFilter;
    currentScreen: "url" | "domain";
    domainFilter: { urlContains: string; };

    status: string;
};

function getCurrentUrlInfo(state: UrlExplorerState): UrlInfo | undefined {
    const currentId = getFirstOrNone(state.selectedUrls);
    if (!currentId) {
        return;
    }

    return state.allUrls.get(currentId);
}


export function UrlExplorer() {
    const s = newState<{
        openInNewTab: boolean;
        onHighlightUrl(url: string): void;
    }>();

    const state: UrlExplorerState = {
        // data structures that hold urls


        renderUrlExplorer,
        refetchData,
        showImages: false,
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

    function allDomainsSelected() {
        return state._filteredDomains.every(d => state.selectedDomains.has(d.url));
    }

    const rg = newRenderGroup();
    const root = div({ class: "flex-1 p-5 col" }, [
        div({ class: "pointer b row p-5", style: "gap: 10px;" }, [
            rg(SmallButton(), c => {
                c.render({
                    text: state.currentScreen === "url" ? "Show domains" : "Hide domains",
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
            rg.if(() => state.currentScreen === "domain", rg => 
                div({ class: "pointer b row p-5", style: "gap: 10px;" }, [
                    rg(setAttrs(SmallButton(), { class: " nowrap" }, true), c => {
                        c.render({
                            text: allDomainsSelected() ? "Deselect all" : "Select all",
                            onClick() {
                                const shouldSelect = !allDomainsSelected();
                                for (const domain of state._filteredDomains) {
                                    setSelectedSet(state.selectedDomains, domain.url, shouldSelect);
                                }
                                state.refetchData({ refetchUrls: true });
                            }
                        })
                    }),
                ]),
            ),
            div({ style: "width: 50px" }),
            rg.if(() => state.selectedDomains.size > 0, rg => rg(setAttrs(SmallButton(), { class: " nowrap" }, true), c => {
                c.render({
                    text: "Delete selected domains",
                    async onClick() {
                        if (!confirm(`Are you sure you want to delete these domains? (${state.selectedDomains.size})`)) {
                            return;
                        }

                        await deleteDomains([...state.selectedDomains]);
                        await state.refetchData({ refetchUrls: true });
                    }
                })
            })),
            div({ class: "flex-1" }),
            rg.text(() => getDomainsText() + " " + state.selectedDomains.size + "/" + state.allDomains.length || "<No domain>"),
            div({ class: "flex-1" }),
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

                const urlInfo = getCurrentUrlInfo(state);
                if (urlInfo) {
                    if (s.args.openInNewTab) {
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

            state.status = "fetched " + domainsFetched + " domains and " + urlsFetched + " urls in " + (Date.now() - t0) + "ms";
                // + " (cache had " + kvCache.size + " entries)";
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

        rg.render();
    }

    function renderAsync() {
        console.log("cleared");
        refetchData({ refetchDomains: true, refetchUrls: true });
    }

    return newComponent(root, renderAsync, s);
}
