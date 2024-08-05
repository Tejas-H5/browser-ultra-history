import { appendChild, div, newComponent, newInsertable } from 'src/utils/dom-utils';
import { onStateChange } from './default-storage-area';
import { getTheme, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

function App() {
    const topBar = TopBar(true);
    const urlExplorer = UrlExplorer();

    const appRoot = div({
        class: "fixed col", 
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        div({ class: "flex-1 col" }, [
            div({ class: "sbb1" }, [
                topBar,
            ]),
            div({ class: "flex-1 row " }, [
                div({ class: "flex-1 col" }, [
                    urlExplorer,
                ]),
            ])
        ])
    ]);

    let fetching = false;
    async function refetchState() {
        try {
            fetching = true;
            render();
        } catch (e) {
            // TODO: Log the error in a better place
            console.error("Error refetching main state:", e);
        } finally {
            fetching = false;
            render();
        }
    }

    function render() {
        topBar.render(undefined);
        urlExplorer.render({
            openInNewTab: true, 
            onHighlightUrl(_url) { },
        });
    }

    async function renderAsync() {
        await refetchState();
    }

    return newComponent(appRoot, () => renderAsync());
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
onStateChange(() => {
    clearTimeout(stateChangeDebounceTimout);
    stateChangeDebounceTimout = setTimeout(() => {
        rerenderApp();
    }, 1000);
});

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
