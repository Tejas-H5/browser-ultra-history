import { Insertable, appendChild, div, newComponent, setText } from './dom-utils'
import { getTheme, setTheme } from './state';

if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded main main extension page!!!")
}

// This page exists only for quick actions, and to link to the real extension page.
function App() {
    const text = div();
    const root = div({ 
        class: "fixed row align-items-center justify-content-center", 
        style: "top: 0; bottomn: 0; left: 0; right: 0;" 
    }, [
        text
    ]);

    const component = newComponent(root, () => renderAppComponent());

    async function renderAppComponent() {
        setText(text, "Henlo");
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

(async () => {
    const theme = await getTheme();
    console.log("Set theme", theme);
    await setTheme(theme);
})();

rerenderApp();
