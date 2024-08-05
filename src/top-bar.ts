import { div, newComponent, setVisible } from 'src/utils/dom-utils';
import { openExtensionTab } from './open-pages';
import { renderContext } from './render-context';
import { SmallButton } from './small-button';
import { EnabledFlags, clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getEnabledFlags, getStateJSON, loadStateJSON, setEnabledFlags } from './state';
import { loadFile, saveText } from './utils/file-download';


export function TopBar(isMain: boolean) {
    const extensionActiveButton = SmallButton();
    const deepCollectActiveButton = SmallButton();
    const collectFromTabButton = SmallButton();
    const collectFromAllTabsButton = SmallButton();
    const clearAllDataButton = SmallButton();
    const openExtensionTabButton = SmallButton();
    const saveJSONButton = SmallButton();
    const loadJSONButton = SmallButton();

    const root = div({ class: "row sb1b", style: "gap: 3px" }, [
        extensionActiveButton,
        deepCollectActiveButton,
        collectFromTabButton,
        collectFromAllTabsButton,
        clearAllDataButton,

        div({ class: "flex-1" }),

        openExtensionTabButton,
        saveJSONButton,
        loadJSONButton,
    ]);

    let firstRefetch = false;
    const component = newComponent(root, () => rerenderAsync());

    let enabledFlags: EnabledFlags = { 
        extension: false,
        deepCollect: false, 
    };

    async function refetchState() {
        try {
            render();

            enabledFlags = await getEnabledFlags();

            render();

            firstRefetch = true;
        } catch(e) {
            render();
        }
    }

    function render() {
        extensionActiveButton.render({
            text: enabledFlags.extension ? "Active" : "Disabled",
            title: "Enable or disable url collection activities. Though disabled, you will still be able to traverse what you've collected",
            onClick: async () => {
                enabledFlags.extension = !enabledFlags.extension;
                await setEnabledFlags(enabledFlags);
                await refetchState();
            },
            toggled: enabledFlags.extension,
        });

        deepCollectActiveButton.render({
            text: "Deep collect",
            title: "Some of these collection strategies are frankly unnecessary and cause a lot of lag for regular use. Only enable this on if you want to have some fun!",
            onClick: async () => {
                enabledFlags.deepCollect = !enabledFlags.deepCollect;
                await setEnabledFlags(enabledFlags);
                await refetchState();
            },
            // extension MUST be on for any of the other flags to take effect.
            toggled: (enabledFlags.extension && enabledFlags.deepCollect),
        });

        if (!setVisible(collectFromTabButton, !isMain)) {
            collectFromTabButton.render({
                text: "Collect from this tab",
                onClick: async () => {
                    await collectUrlsFromActiveTab();
                    await refetchState();
                }
            })
        }

        if (!setVisible(collectFromAllTabsButton, !isMain)) {
            collectFromAllTabsButton.render({
                text: "Collect from all tabs",
                onClick: async () => {
                    await collectUrlsFromTabs();
                }
            });
        }

        clearAllDataButton.render({
            text: "Clear all data",
            onClick: async () => {
                if (!confirm("Are you sure you want to clear ALL your data?!?!")) {
                    return;
                }

                await clearAllData();
                await refetchState();
            }
        })

        if (!setVisible(openExtensionTabButton, !isMain)) {
            openExtensionTabButton.render({
                text: "Open Extension Tab",
                onClick: async () => {
                    await openExtensionTab();
                    await refetchState();
                }
            })
        }

        saveJSONButton.render({
            text: "Save JSON",
            onClick: async () => {
                const jsonString = await getStateJSON();
                saveText(jsonString, "Browser-Graph-State-" + Date.now() + ".json");
            }
        });

        loadJSONButton.render({
                text: "Load JSON",
                onClick: async () => {
                    loadFile((file) => {
                        if (!file) {
                            return;
                        }

                        file.text().then((text) => {
                            loadStateJSON(text);
                        });
                    });
                }
            })
    }

    async function rerenderAsync() {
        if (!firstRefetch  || renderContext.forceRefetch) {
            await refetchState();
        }
    }

    return component;
}
