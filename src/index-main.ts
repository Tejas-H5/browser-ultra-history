import { RenderGroup, appendChild, div, newComponent, newInsertable, setCssVars } from 'src/utils/dom-utils';
import { insertAndInitializeAppAndRenderContext } from './render-context';
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
                        onHighlightUrl(url) {
                            // TODO: move to the tab and do the highlight...
                        },
                    }))
                ]),
            ])
        ])
    ]);
}

const app = newComponent(App, null);
setCssVars([["--font-size", "18px"]])
appendChild(newInsertable(document.body), app);
insertAndInitializeAppAndRenderContext(app.renderWithCurrentState);

