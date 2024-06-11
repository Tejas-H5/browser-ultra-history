import { div, init, newComponent, newRenderGroup } from 'src/utils/dom-utils';
import { makeButton } from './components';
import { openExtensionTab } from './open-pages';
import { clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getStateJSON, loadStateJSON } from './state';
import { loadFile, saveText } from './utils/file-download';


export function TopBar(isMain: boolean) {
    const rg = newRenderGroup();
    const root = div({ class: "row sb1b", style: "gap: 3px" }, [
        !isMain && (
            init(makeButton("Collect from this tab"), (button) => {
                button.el.addEventListener("click", async () => {
                    await collectUrlsFromActiveTab();
                    render();
                });
            })
        ),
        isMain && (
            init(makeButton("Collect all tabs"), (button) => {
                button.el.addEventListener("click", async () => {
                    await collectUrlsFromTabs();
                    render();
                });
            })
        ),
        rg(makeButton(), (el) => {
            // TODO:: enable/disable button
        }),
        ...(!isMain ? [] : [
            (
                init(makeButton("Clear"), (button) => {
                    button.el.addEventListener("click", async () => {
                        await clearAllData();
                        render();
                    });
                })
            ),
        ]),


        div({ class: "flex-1" }),

        // rg.text(() => "" + count + " urls collected"),

        div({ class: "flex-1" }),

        ...(!isMain ? [
            init(makeButton("Open Extension Tab"), (button) => {
                button.el.addEventListener("click", async () => {
                    await openExtensionTab();
                });
            })
        ] : [
            init(makeButton("Save JSON"), (button) => {
                button.el.addEventListener("click", async () => {
                    const jsonString = await getStateJSON();
                    saveText(jsonString, "Browser-Graph-State-" + Date.now() + ".json");
                });
            }),
            init(makeButton("Load JSON"), (button) => {
                button.el.addEventListener("click", async () => {
                    loadFile((file) => {
                        if (!file) {
                            return;
                        }

                        file.text().then((text) => {
                            loadStateJSON(text);
                        });
                    });
                });
            })
        ]),
    ]);

    let loading = false;
    let count = 0;

    const component = newComponent(root, render);

    async function refetch() {
    }

    async function render() {
        loading = true;
        rg.render();

        try {
            await refetch();
        } catch(e) {
            // TODO: push an error notification here
            count = 0;
        } finally {
            loading = false;
            rg.render();
        }
    }

    return component;
}
