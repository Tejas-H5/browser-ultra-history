import { Insertable, appendChild, div, initEl, newComponent, newListRenderer, newRenderGroup, setText, setVisible } from 'src/utils/dom-utils'
import { getCollectedUrls, getLastCollectedAtIso, getTheme, onStateChange, setTheme } from './state';
import { UrlInfo } from './message';
import { ScrollContainerV } from './components';
import { Trie } from './trie';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

const state = {
    urlsDict: {} as Record<string, UrlInfo>,
    urlsSorted: [] as UrlInfo[],
    lastUrlsCollectedAt: undefined as string | undefined,
    urlsTrie: new Trie(""),
}

async function refetchUrls() {
    // refetch urls from state
    
    const urlsCollectedAt = await getLastCollectedAtIso();
    if (urlsCollectedAt === state.lastUrlsCollectedAt) {
        return;
    }

    state.lastUrlsCollectedAt = urlsCollectedAt;
    if (!state.lastUrlsCollectedAt) {
        return;
    }

    state.urlsDict = await getCollectedUrls();


    // recalculate lookup structures
    for (const key in state.urlsDict) {
        const urlInfo = state.urlsDict[key];
        let url: URL | undefined;
        try {
            url = new URL(urlInfo.url);
        } catch {
            // invalid url smh. 
            delete state.urlsDict[key];
            continue;
        }

        if (!url) {
            continue;
        }

        let t = state.urlsTrie;

        // I think hostname might be better than host here, since different ports may contain different stuff. Based off nothing tho
        t = t.getOrAddNode(url.hostname);

        // Pathname always starts with a '/', hence .substring(1)
        const segments = url.pathname.substring(1).split("/");
        for (const seg of segments) {
            t = t.getOrAddNode(seg);
        }

        // query params. they should be appended under the final segment.
        // The specific combination matters, so they're being added as a single entry instead of multiple.
        const params = [...url.searchParams];
        params.sort((a, b) => a[0].localeCompare(b[0]));
        const queryStr = "?" + params.map(([k, v]) => k + "=" + v).join("&");
        t = t.getOrAddNode(queryStr);
    }

    state.urlsSorted = Object.values(state.urlsDict);
    state.urlsSorted.sort((a, b) => {
        return a.url.localeCompare(b.url);
    });
}


function Breadcrumbs() {
    const root = div({ class: "row sbb1" });
    const list = newListRenderer(root, BreadcrumbItem);

    type Args = {
        path: string[];
    }
    const c = newComponent<Args>(root, render);

    function render() {
        const { path } = c.args;

        list.render(() => {
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                const listEl = list.getNext();
                listEl.render({
                    segment,
                    divider: i !== path.length,
                });
            }
        });
    }

    return c;

    function BreadcrumbItem() {
        const rg = newRenderGroup();
        const divider = div({ style: "padding: 0 10px" }, [ ">" ]);
        const root = div({ class: "row" }, [
            rg(div(), (el) => setText(el, c.args.segment)),
            rg(divider, (el) => setVisible(el, c.args.divider)),
            divider,
        ]);

        type Args = {
            divider: boolean;
            segment: string;
        }
        const c = newComponent<Args>(root, rg.render);

        return c;
    }
}

/** Renders a URL Trie */
function UrlTrie() {
    function PathList() {
        function UrlComponent() {
            const rg = newRenderGroup();
            const root = div({
                class: "handle-long-words row",
                style: "max-width: 500px",
            }, [
                rg(div(), (el) => setText(el, c.args.thisTrie.prefix)),
                div({ class: "flex-1", style: "min-width: 10px" }),
                rg(div(), (el) => setText(el, "" + c.args.thisTrie._count)),
            ]);

            type Args = {
                thisTrie: Trie;
                idx: number;
                onClick(idx: number): void;
            }

            const c = newComponent<Args>(root, rg.render);

            root.el.addEventListener("click", () => {
                c.args.onClick(c.args.idx)
            });

            return c;
        }

        const autoscroller = initEl(ScrollContainerV(), { class: "flex-1 h-100", style: "padding: 5px" });
        const root = div({ class: "col h-100" }, [
            autoscroller,
        ]);
        const urlComponentList = newListRenderer(autoscroller, UrlComponent);

        type Args = { 
            lastTrie: Trie; 
            thisTrie: Trie | undefined; 
            pathIdx: number;
            onClick(pathIndex: number, prefixIndex: number): void;
        };
        const c = newComponent<Args>(root, renderPathList);

        function onClickItem(i: number) {
            c.args.onClick(c.args.pathIdx, i);
        }

        function renderPathList() {
            const { lastTrie, thisTrie } = c.args;

            let scrollEl: Insertable | null = null;
            lastTrie.recomputeChildrenSortedByCount();
            const sortedChildren = lastTrie._childrenSortedByCount;
            urlComponentList.render(() => {
                for (let i = 0; i < sortedChildren.length; i++) {
                    const isFocued = sortedChildren[i].prefix === thisTrie?.prefix;

                    const listEl = urlComponentList.getNext();
                    const thisTrieChild = sortedChildren[i];
                    listEl.render({
                        thisTrie: thisTrieChild,
                        idx: i,
                        onClick: onClickItem
                    });

                    if (isFocued) {
                        scrollEl = listEl;
                    }
                }
            });

            const ONE_SECOND = 1000;
            autoscroller.render({
                scrollEl,
                rescrollMs: 10 * ONE_SECOND,
            });
        }

        return c;
    }


    const listRoot = div({ class: "flex-1 row", style: "gap: 10px" });
    const list = newListRenderer(listRoot, PathList);
    const breadcrumbs = Breadcrumbs();
    const root = div({ class: "col flex-1 overflow-y-auto" }, [
        breadcrumbs,
        listRoot,
    ]);

    const currentPath: string[] = [];

    type Args = {
        urlTrie: Trie;
    }
    const c = newComponent<Args>(root, renderUrlTrie);

    async function renderUrlTrie() {
        const { urlTrie } = c.args;

        urlTrie.recomputeCountsRecursive();

        if (!setVisible(root, urlTrie.children.length > 0)) {
            return;
        }

        list.render(() => {
            let lastTrie = urlTrie;

            console.log("started rendering trie");
            for (let i = 0; i < currentPath.length; i++) {

                console.log("started rendering trie", currentPath[i]);
                const segment = currentPath[i];
                let thisTrie = lastTrie.getNode(segment);
                if (!thisTrie) {
                    console.warn("bad path!");
                    return;
                }

                const listEl = list.getNext();
                listEl.render({
                    lastTrie,
                    thisTrie,
                    pathIdx: i,
                    onClick: onClickUrl,
                });

                lastTrie = thisTrie;
            }

            console.log("started rendering trie", "final");
            const listEl = list.getNext();
            listEl.render({
                lastTrie,
                thisTrie: undefined,
                pathIdx: currentPath.length,
                onClick: onClickUrl,
            });
        });

        // render at  the end - other render functions will 'correct' the path if required,
        // i.e some path components are invalid/non-existent, etc
        breadcrumbs.render({ path: currentPath });
    }

    function onClickUrl(parentPathIndex: number, prefixIdx: number) {
        let trie = c.args.urlTrie;

        for (let i = 0; i < parentPathIndex; i++) {
            const children = trie._childrenSortedByCount;

            if (i === currentPath.length) {
                if (children.length === 0) {
                    console.warn("How tf were we able to click on this??")
                    return;
                }

                currentPath.push(children[i].prefix);
                console.warn("invalid path, aborting early");
                return;
            }

            const nextTrie = trie.getNode(currentPath[i]);
            if (!nextTrie) {
                if (children.length === 0) {
                    console.warn("How tf were we able to click on this??")
                    return;
                }

                while (currentPath.length > i && currentPath.length !== 0) {
                    currentPath.pop();
                }

                currentPath.push(children[i].prefix);
                console.warn("invalid path, aborting early");
                return;
            }

            trie = nextTrie;
        }

        console.log({ parentPathIndex, prefixIdx });

        const newSegment = trie._childrenSortedByCount[prefixIdx].prefix;;
        if (newSegment !== currentPath[parentPathIndex]) {
            currentPath[parentPathIndex] = newSegment;
            currentPath.splice(parentPathIndex + 1, currentPath.length - parentPathIndex - 1);
        }

        renderUrlTrie();
    }

    return c;
}

function App() {
    const rg = newRenderGroup();
    const root = div({ 
        class: "fixed row", 
        style: "top: 0; bottom: 0; left: 0; right: 0;" 
    }, [
        rg(div({ class: "row align-items-center justify-content-center" }, ["No urls collected yet"]),
            (el) => setVisible(el, !state.lastUrlsCollectedAt)
        ),
        rg(UrlTrie(), (urlList) => {
            urlList.render({
                urlTrie: state.urlsTrie,
            });
        })
    ]);

    const c = newComponent(root, render);

    async function render() {
        await refetchUrls();

        rg.render();
    }

    return c;
}

const app = App();

const root: Insertable = {
    el: document.querySelector<HTMLDivElement>('#app')!,
    _isInserted: true,
};

appendChild(root, app);

async function rerenderApp() {
    await app.render(app.args);
}

onStateChange(() => {
    rerenderApp();
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
