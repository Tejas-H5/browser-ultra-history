import { Insertable, appendChild, div, initEl, newComponent, newListRenderer, setStyle, setText, setVisible } from 'src/utils/dom-utils'
import { formatDate } from 'src/utils/datetime';
import { getCollectedUrls, getLastCollectedAtIso, getTheme, onStateChange, setTheme } from './state';
import { UrlInfo } from './message';
import * as trie from 'src/utils/trie';
import { commands } from 'webextension-polyfill';
import { ScrollContainerV } from './components';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

const state = {
    urlsDict: {} as Record<string, UrlInfo>,
    urlsSorted: [] as UrlInfo[],
    lastUrlsCollectedAt: undefined as string | undefined,
    urlsTrie: trie.newNode(""),
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
        t = trie.getOrAddNode(t, url.hostname);

        // Pathname always starts with a '/', hence .substring(1)
        const segments = url.pathname.substring(1).split("/");
        for (const seg of segments) {
            t = trie.getOrAddNode(t, seg);
        }

        // query params. they should be appended under the final segment,
        // so the t = trie.getOrAddNode pattern doesn't apply here anymore
        const finalSegmentNode = t;
        for (const [k, v] of url.searchParams) {
            const tK = trie.getOrAddNode(finalSegmentNode, k)
            trie.getOrAddNode(tK, v)
        }
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
        const segmentEl = div();
        const divider = div({ style: "padding: 0 10px" }, [ ">" ]);
        const root = div({ class: "row" }, [
            segmentEl,
            divider,
        ]);

        type Args = {
            divider: boolean;
            segment: string;
        }
        const c = newComponent<Args>(root, render);

        function render() {
            setText(segmentEl, c.args.segment);
            setVisible(divider, c.args.divider);
        }

        return c;
    }
}

/** Renders a URL Trie */
function UrlTrie() {
    const listRoot = div({ class: "flex-1 row", style: "gap: 10px" });
    const list = newListRenderer(listRoot, PathList);
    const breadcrumbs = Breadcrumbs();
    const root = div({ class: "col flex-1 overflow-y-auto" }, [
        breadcrumbs,
        listRoot,
    ]);

    const currentPath: string[] = [];

    function fixCurrentPath() {
        const { urlTrie } = component.args;

        let lastTrie = urlTrie;
        for (let i = 0; i < currentPath.length; i++) {
            const segment = currentPath[i];
            let thisTrie = trie.getNode(lastTrie, segment);
            if (!thisTrie) {
                if (lastTrie.children.length === 0) {
                    currentPath.splice(i + 1, currentPath.length - i - 1);
                    break;
                }
                
                thisTrie = lastTrie.children[0];
                currentPath[i] = thisTrie.prefix;
            }

            lastTrie = thisTrie;
        }
    }

    type Args = {
        urlTrie: trie.TrieNode;
    }
    const component = newComponent<Args>(root, renderUrlTrie);

    async function renderUrlTrie() {
        const { urlTrie } = component.args;

        if (!setVisible(root, urlTrie.children.length > 0)) {
            return;
        }

        fixCurrentPath();

        list.render(() => {
            let lastTrie = urlTrie;
            for (let i = 0; i < currentPath.length; i++) {
                const segment = currentPath[i];
                let thisTrie = trie.getNode(lastTrie, segment);

                if (!thisTrie) {
                    console.warn("The path wasn't fixed properly!");
                    break;
                }

                const listEl = list.getNext();
                listEl.render({
                    lastTrie,
                    thisTrie,
                    onClick: handleClickPathItem,
                    pathIdx: i,
                });

                lastTrie = thisTrie;
            }

            const listEl = list.getNext();
            listEl.render({
                lastTrie,
                thisTrie: undefined,
                onClick: handleClickPathItem,
                pathIdx: currentPath.length,
            });
        });

        // render at  the end - other render functions will 'correct' the path if required,
        // i.e some path components are invalid/non-existent, etc
        breadcrumbs.render({ path: currentPath });
    }

    function handleClickPathItem(pathIdx: number, thisTrie: trie.TrieNode) {
        // NOTE: pathIdx can also === currentPath.length here
        if (pathIdx > currentPath.length) {
            return;
        }

        currentPath[pathIdx] = thisTrie.prefix;

        renderUrlTrie();
    }

    return component;

    function PathList() {
        const root = initEl(ScrollContainerV(), { class: "h-100" });
        const list = newListRenderer(root, UrlComponent);

        type Args = { 
            lastTrie: trie.TrieNode; 
            thisTrie: trie.TrieNode | undefined; 
            pathIdx: number;
            onClick: (pathIdx: number, t: trie.TrieNode) => void;
        };
        const c = newComponent<Args>(root, renderPathList);

        function renderPathList() {
            const { lastTrie, thisTrie, onClick, pathIdx } = c.args;

            let scrollEl: Insertable | null = null;
            list.render(() => {
                for (let i = 0; i < lastTrie.children.length; i++) {
                    const isFocued = lastTrie.children[i].prefix === thisTrie?.prefix;

                    const listEl = list.getNext();
                    listEl.render({
                        thisTrie: lastTrie.children[i],
                        pathIdx,
                        onClick,
                    });

                    if (isFocued) {
                        scrollEl = listEl;
                    }
                }
            });

            const ONE_SECOND = 1000;
            root.render({
                scrollEl,
                rescrollMs: 10 * ONE_SECOND,
            });
        }

        return c;

        function UrlComponent() {
            const pathEl = div();
            const root = div({
                class: "handle-long-words row",
            }, [
                pathEl,
            ]);

            type Args = {
                thisTrie: trie.TrieNode;
                pathIdx: number;
                onClick: (pathIdx: number, t: trie.TrieNode) => void;
            }
            const c = newComponent<Args>(root, render);

            function render() {
                const { thisTrie } = c.args;
                setText(pathEl, thisTrie.prefix);
            }

            root.el.addEventListener("click", () => {
                c.args.onClick(c.args.pathIdx, c.args.thisTrie);
            });

            return c;
        }
    }
}

// This page exists only for quick actions, and to link to the real extension page.
function App() {
    const urlList = UrlTrie();
    const empty = div({ class: "row align-items-center justify-content-center" }, [ "No urls collected yet" ]);
    const root = div({ 
        class: "fixed row", 
        style: "top: 0; bottom: 0; left: 0; right: 0;" 
    }, [
        empty,
        urlList,
    ]);

    const c = newComponent(root, render);

    async function render() {
        await refetchUrls();

        setVisible(empty, !state.lastUrlsCollectedAt)
        if (setVisible(urlList, !!state.lastUrlsCollectedAt)) {
            await urlList.render({
                urlTrie: state.urlsTrie,
            });
        }
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
