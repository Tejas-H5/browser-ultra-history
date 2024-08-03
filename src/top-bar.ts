import { div, newComponent, newRenderGroup, } from 'src/utils/dom-utils';
import { openExtensionTab } from './open-pages';
import { renderContext } from './render-context';
import { SmallButton } from './small-button';
import { EnabledFlags, clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getEnabledFlags, getStateJSON, loadStateJSON, setEnabledFlags } from './state';
import { loadFile, saveText } from './utils/file-download';
import { commands } from 'webextension-polyfill';


export function TopBar(isMain: boolean) {
    const rg = newRenderGroup();
    const root = div({ class: "row sb1b", style: "gap: 3px" }, [
        rg(SmallButton(), c => c.render({
            text: enabledFlags.extension ? "Active" : "Disabled",
            title: "Enable or disable url collection activities. Though disabled, you will still be able to traverse what you've collected",
            onClick: async () => {
                enabledFlags.extension = !enabledFlags.extension;
                await setEnabledFlags(enabledFlags);
                await refetchState();
            },
            toggled: enabledFlags.extension,
        })),
        rg(SmallButton(), c => c.render({
            text: "Deep collect",
            title: "Some of these collection strategies are frankly unnecessary and cause a lot of lag for regular use. Only enable this on if you want to have some fun!",
            onClick: async () => {
                enabledFlags.deepCollect = !enabledFlags.deepCollect;
                await setEnabledFlags(enabledFlags);
                await refetchState();
            },
            // extension MUST be on for any of the other flags to take effect.
            toggled: (enabledFlags.extension && enabledFlags.deepCollect),
        })),
        !isMain && (
            rg(SmallButton(), c => c.render({
                text: "Collect from this tab",
                onClick: async () => {
                    await collectUrlsFromActiveTab();
                    await refetchState();
                }
            }))
        ),
        isMain && (
            rg(SmallButton(), c => c.render({
                text: "Collect from all tabs",
                onClick: async () => {
                    await collectUrlsFromTabs();
                }
            }))
        ),
        rg(SmallButton(), c => c.render({
            text: "Clear all data",
            onClick: async () => {
                if (!confirm("Are you sure you want to clear ALL your data?!?!")) {
                    return;
                }

                await clearAllData();
                await refetchState();
            }
        })),

        div({ class: "flex-1" }),

        // rg.text(() => "" + count + " urls collected"),

        div({ class: "flex-1" }),

        ...(!isMain ? [
            rg(SmallButton(), c => c.render({
                text: "Open Extension Tab",
                onClick: async () => {
                    await openExtensionTab();
                    await refetchState();
                }
            })),
        ] : [
            rg(SmallButton(), c => c.render({
                text: "Save JSON",
                onClick: async () => {
                    const jsonString = await getStateJSON();
                    saveText(jsonString, "Browser-Graph-State-" + Date.now() + ".json");
                }
            })),
            rg(SmallButton(), c => c.render({
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
            })),
        ]),
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
        rg.render();
    }

    async function rerenderAsync() {
        if (!firstRefetch  || renderContext.forceRefetch) {
            await refetchState();
        }
    }

    return component;
}
