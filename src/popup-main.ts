import { div, initSPA, newComponent, newRenderGroup } from 'src/utils/dom-utils';
import { getTheme, onStateChange, setTheme } from './state';
import { TopBar } from './top-bar';
import { UrlExplorer } from './url-explorer';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded popup main!")
}

// This page exists only for quick actions, and to link to the real extension page.
// Also, it exists to navigate the 
function PopupAppRoot() {
    const rg = newRenderGroup();

    const appRoot = div({
        class: "fixed col", 
        style: "top: 0; bottom: 0; left: 0; right: 0;"
    }, [
        rg.component(TopBar(false)),
        rg.component(UrlExplorer()),
    ])

    const component = newComponent(appRoot, render);

    async function render() {
        await rg.render();
    }

    return component;
}

const app = PopupAppRoot();
initSPA("#app", app);

// Set the size to max
const body = document.querySelector("body")!;
body.style.width = "800px";
body.style.height = "600px";

async function rerenderApp() {
    await app.render(app.args);
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
