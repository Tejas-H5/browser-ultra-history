import { appendChild, div, el, newComponent, newInsertable, newRenderGroup } from 'src/utils/dom-utils';
import { NetworkGraph } from './network-graph';
import { getAllData, getRecentlyVisitedUrls, getTheme, onStateChange, setTheme } from './state';
import { TopBar } from './top-bar';
import { LinkItem, UrlExplorer } from './url-explorer';
import { newRefetcher } from './utils/refetcher';
import { CollectedUrlsViewer } from './collected-urls-viewer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

function App() {
    const rg = newRenderGroup();
    const appRoot = div({
        class: "fixed col", 
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        div({ class: "flex-1 col" }, [
            div({ class: "sbb1" }, [
                rg.c(TopBar(true)),
            ]),
            div({ class: "flex-1 row " }, [
                div({ class: "flex-1 col" }, [
                    div({ class: "flex-1 col" }, [
                        rg.c(NetworkGraph())
                    ]),
                    div({ class: "flex-1 col" }, [
                        rg.cArgs(CollectedUrlsViewer(), () => allData),
                    ]),
                ]),
                div({ style: "width: 25%" }, [
                    el("H3", {}, "Recently visited"),
                    rg.list(div(), LinkItem, (getNext) => {
                        for(const url of recentUrls) {
                            getNext().render({ 
                                linkUrl: url,
                                onClick: onNavigate,
                            });
                        }
                    })
                ])
            ])
        ])
    ]);

    let allData: any | undefined;
    let recentUrls: string[] = [];

    const c = newComponent(appRoot, () => renderAsync());

    const fetchState = newRefetcher(render, async () => {
        allData = await getAllData();
        recentUrls = await getRecentlyVisitedUrls();
        recentUrls.reverse();
    });

    function render() {
        rg.render();
    }

    function onNavigate(url: string) {
        // TODO: open new tab to url, or copy to clipboard
    }

    async function renderAsync() {
        if (asyncStateInvalidated) {
            asyncStateInvalidated = false;

            await fetchState.refetch();

            if (fetchState.state !== "loaded") {
                asyncStateInvalidated = true;
            }
        }

        render();
    }

    return c;
}

const app = App();
appendChild(
    newInsertable(document.body),
    app
);

function rerenderApp() {
    app.render(undefined);
}

let stateChangeDebounceTimout = 0;
let asyncStateInvalidated = true;
onStateChange(() => {
    clearTimeout(stateChangeDebounceTimout);
    stateChangeDebounceTimout = setTimeout(() => {
        asyncStateInvalidated = true;
        rerenderApp();
    }, 1000);
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
