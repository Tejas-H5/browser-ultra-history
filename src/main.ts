import './styles.css'
import './style-utils.css'
import { Insertable, appendChild, div, newComponent, setCssVars, setText } from './dom-utils'
import { AppTheme, state } from './state';
import { makeButton } from './generic-components';

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
    let count = 0;

    const textEl = div();
    const countEl = div();
    const btn = makeButton("Count++;");
    const root = div({ class: "row solid-border-sm", style: "position: fixed; top: 10px; left: 10px; bottom: 10px; right: 10px;" }, [
        div({ class: "col flex-1 h-100 align-items-center justify-content-center" }, [
            textEl,
            countEl,
            btn,
        ])
    ]);

    const component = newComponent(root, rerenderAppComponent);

    function rerenderAppComponent() {
        setText(textEl, "Hello world!")
        setText(countEl, "" + count);
    }

    btn.el.addEventListener("click", () => {
        count++;
        rerenderAppComponent();
    });

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

setTheme(getTheme());
rerenderApp();
