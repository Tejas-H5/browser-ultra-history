import { appendChild, div, newComponent, newInsertable, newRenderGroup } from 'src/utils/dom-utils';
import { getAllData, onStateChange } from './default-storage-area';
import { navigateToUrl } from './open-pages';
import { getRecentlyVisitedUrls, getTheme, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';
import { newRefetcher } from './utils/refetcher';

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
                    // div({ class: "flex-1 col" }, [
                    //     rg.c(NetworkGraph())
                    // ]),
                    // div({ class: "flex-1 col" }, [
                    //     rg(CollectedUrlsViewer(), c => c.render(allData)),
                    // ]),
                    rg(UrlExplorer(), c => c.render({
                        onNavigate(url, newTab) {
                            navigateToUrl(url, true, false);
                        },
                        onHighlightUrl(url) {
                            console.log("TODO");
                        }
                    })),
                ]),
            ])
        ])
    ]);

    let allData: any | undefined;
    let recentUrls: string[] = [];

    const c = newComponent(appRoot, () => renderAsync());

    const fetchState = newRefetcher({
        refetch: async () => {
            render();

            allData = await getAllData();

            render();

            recentUrls = await getRecentlyVisitedUrls();

            render();

            recentUrls.reverse();

            render();
        }, onError: () => {
            render();
        }
    });

    function render() {
        rg.render();
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
