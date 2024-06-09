import { div, divStyled, initSPA, newComponent, newRenderGroup } from 'src/utils/dom-utils';
import { NetworkGraph } from './network-graph';
import { getTheme, onStateChange, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';
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
            divStyled("sbb1", "", [
                rg.component(TopBar(true)),
            ]),
            divStyled("flex-1 row align-items-center justify-content-center", "", [
                rg.component(NetworkGraph())
            ]),
            divStyled("flex-1 row", "height: 40%;", [
                rg.component(UrlExplorer()),
                rg.component(CollectedUrlsViewer()),
            ]),
        ])
    ]);

    const c = newComponent(appRoot, rg.render);

    return c;
}

const app = App();
initSPA("#app", app);

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
