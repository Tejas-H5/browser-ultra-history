import { div, initSPA, newComponent, newRefetcher, newRenderGroup } from 'src/utils/dom-utils';
import { CollectedUrlsViewer } from './collected-urls-viewer';
import { NetworkGraph } from './network-graph';
import { getAllData, getCurrentLocationDataFromAllData, getTheme, onStateChange, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

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
                rg.component(TopBar(true)),
            ]),
            div({ class: "flex-1 col flex-center" }, [
                rg.component(NetworkGraph())
            ]),
            div({ class: "flex-1 col" }, [
                rg.componentArgs(UrlExplorer(), () => {
                    if (!currentTabUrl || !allData) {
                        return;
                    }

                    return { data: getCurrentLocationDataFromAllData(currentTabUrl, allData) };
                }),
                rg.componentArgs(CollectedUrlsViewer(), () => allData),
            ]),
        ])
    ]);

    let currentTabUrl: string | undefined;
    let allData: any | undefined;

    const c = newComponent(appRoot, () => renderAsync());

    const fetchState = newRefetcher(render, async () => {
        return await getAllData();
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
initSPA("#app", app);

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
