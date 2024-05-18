import './styles.css'
import './style-utils.css'
import { Insertable, appendChild, div, newComponent, newListRenderer, setCssVars, setText } from './dom-utils'
import { AppTheme, state } from './state';
import browser from "webextension-polyfill";

function getTheme(): AppTheme {
    if (state.currentTheme === "Dark") {
        return "Dark";
    }

    return "Light";
};

function setTheme(theme: AppTheme) {
    state.currentTheme = theme;

    if (theme === "Light") {
        setCssVars([
            ["--bg-in-progress", "rgb(255, 0, 0, 1"],
            ["--fg-in-progress", "#FFF"],
            ["--bg-color", "#FFF"],
            ["--bg-color-focus", "#CCC"],
            ["--bg-color-focus-2", "rgb(0, 0, 0, 0.4)"],
            ["--fg-color", "#000"],
            ["--unfocus-text-color", "#A0A0A0"],
        ]);
    } else {
        // assume dark theme
        setCssVars([
            ["--bg-in-progress", "rgba(255, 0, 0, 1)"],
            ["--fg-in-progress", "#FFF"],
            ["--bg-color", "#000"],
            ["--bg-color-focus", "#333"],
            ["--bg-color-focus-2", "rgba(255, 255, 255, 0.4)"],
            ["--fg-color", "#EEE"],
            ["--unfocus-text-color", "#707070"],
        ]);
    }
};


function App() {
    const textEl = div();
    const messagesRoot = div();
    const list = newListRenderer(messagesRoot, () => {
        const root = div();
        const component = newComponent<{message: any}>(root, renderMessage);
        function renderMessage() {
            let text = "";
            try {
                text = JSON.stringify(component.args.message);
            } catch {
                console.error("failed to stringify:", component.args.message);
                text = "<not stringifieable!>";
            }
            setText(root, text);
        }
        return component;
    });
    
    const root = div({ class: "row solid-border-sm", style: "position: fixed; top: 10px; left: 10px; bottom: 10px; right: 10px;" }, [
        div({ class: "col flex-1 h-100 align-items-center justify-content-center" }, [
            textEl,
            list,
        ])
    ]);

    const component = newComponent(root, rerenderAppComponent);

    function rerenderAppComponent() {
        setText(textEl, "Messages:")
        list.render(() => {
            for (const message of messages) {
                list.getNext().render({ message });
            }
        });
    }

    return component;
}

const app = App();
const root: Insertable = {
    el: document.querySelector<HTMLDivElement>('#app')!,
    _isInserted: true,
};

appendChild(root, app);

function rerenderApp() {
    app.render(app.args);
}

let messages: any[] = [];
setTheme(getTheme());
rerenderApp();

browser.runtime.onMessage.addListener(handleMessage);
function handleMessage(message: any) {
    messages.push(message);
    rerenderApp();
}
