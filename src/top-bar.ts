import { div, newComponent, newRenderGroup, } from 'src/utils/dom-utils';
import { openExtensionTab } from './open-pages';
import { renderContext } from './render-context';
import { SmallButton } from './small-button';
import { EnabledFlags, clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getEnabledFlags, getStateJSON, loadStateJSON, setEnabledFlags } from './state';
import { loadFile, saveText } from './utils/file-download';
import { newRefetcher } from './utils/refetcher';


export function TopBar(isMain: boolean) {
    const rg = newRenderGroup();
    const root = div({ class: "row sb1b", style: "gap: 3px" }, [
        rg.cArgs(SmallButton(), () => ({
            text: enabledFlags.extension ? "Active" : "Disabled",
            title: "Enable or disable url collection activities. Though disabled, you will still be able to traverse what you've collected",
            onClick: async () => {
                enabledFlags.extension = !enabledFlags.extension;
                await setEnabledFlags(enabledFlags);
                refetcher.refetch();
            },
            toggled: enabledFlags.extension,
        })),
        rg.cArgs(SmallButton(), () => ({
            text: "Deep collect",
            title: "Some of these collection strategies are frankly unnecessary and cause a lot of lag for regular use. Only enable this on if you want to have some fun!",
            onClick: async () => {
                enabledFlags.deepCollect = !enabledFlags.deepCollect;
                await setEnabledFlags(enabledFlags);
                refetcher.refetch();
            },
            // extension MUST be on for any of the other flags to take effect.
            toggled: (enabledFlags.extension && enabledFlags.deepCollect),
        })),
        !isMain && (
            rg.cArgs(SmallButton(), () => ({
                text: "Collect from this tab",
                onClick: async () => {
                    await collectUrlsFromActiveTab();
                    refetcher.refetch();
                }
            }))
        ),
        isMain && (
            rg.cArgs(SmallButton(), () => ({
                text: "Collect from all tab",
                onClick: async () => {
                    await collectUrlsFromTabs();
                    refetcher.refetch();
                }
            }))
        ),
        !isMain && (
            rg.cArgs(SmallButton(), () => ({
                text: "Clear",
                onClick: async () => {
                    await clearAllData();
                    refetcher.refetch();
                }
            }))
        ),

        div({ class: "flex-1" }),

        // rg.text(() => "" + count + " urls collected"),

        div({ class: "flex-1" }),

        ...(!isMain ? [
            rg.cArgs(SmallButton(), () => ({
                text: "Open Extension Tab",
                onClick: async () => {
                    await openExtensionTab();
                    refetcher.refetch();
                }
            })),
        ] : [
            rg.cArgs(SmallButton(), () => ({
                text: "Save JSON",
                onClick: async () => {
                    const jsonString = await getStateJSON();
                    saveText(jsonString, "Browser-Graph-State-" + Date.now() + ".json");
                }
            })),
            rg.cArgs(SmallButton(), () => ({
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

    const refetcher = newRefetcher({
        refetch: async () => {
            render();

            enabledFlags = await getEnabledFlags();

            render();

            firstRefetch = true;
        }, 
        onError: () => {
            render();
        }
    });

    function render() {
        rg.render();
    }

    async function rerenderAsync() {
        if (!firstRefetch  || renderContext.forceRefetch) {
            await refetcher.refetch();
        }
    }

    return component;
}
