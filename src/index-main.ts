import { RenderGroup, appendChild, div, newComponent, newInsertable } from 'src/utils/dom-utils';
import { onStateChange } from './default-storage-area';
import { getTheme, setTheme } from './state';
import { makeTopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

const TopBar = makeTopBar(true);

function App(rg: RenderGroup) {
    return div({
        class: "fixed col", 
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        div({ class: "flex-1 col" }, [
            div({ class: "sbb1" }, [
                rg.cNull(TopBar),
            ]),
            div({ class: "flex-1 row " }, [
                div({ class: "flex-1 col" }, [
                    rg.c(UrlExplorer, (c) => c.render({
                        openInNewTab: true,
                        onHighlightUrl(url) { },
                    }))
                ]),
            ])
        ])
    ]);
}

const app = newComponent(App);
appendChild(
    newInsertable(document.body),
    app
);

function rerenderApp() {
    app.render(null);
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
