import { RenderGroup, div, getState, newComponent, } from 'src/utils/dom-utils';
import { openExtensionTab } from './open-pages';
import { renderContext } from './render-context';
import { SmallButton } from './small-button';
import { EnabledFlags, clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getEnabledFlags, getStateJSON, loadStateJSON, setEnabledFlags } from './state';
import { loadFile, saveText } from './utils/file-download';

export function makeTopBar(isMain: boolean) {
    return function TopBar(rg: RenderGroup) {
        let needsRefetch = true;
        let enabledFlags: EnabledFlags = {
            extension: true,
            deepCollect: false,
        };

        async function refetchState() {
            try {
                rg.renderWithCurrentState();

                enabledFlags = await getEnabledFlags();

                rg.renderWithCurrentState();
            } catch (e) {
                rg.renderWithCurrentState();

                needsRefetch = true;
            }
        }

        rg.renderFn(() => {
            if (needsRefetch || renderContext.forceRefetch) {
                needsRefetch = false;
                refetchState();
            }
        });

        return div({ class: "row sb1b", style: "gap: 3px" }, [
            rg.c(SmallButton, c => c.render({
                text: enabledFlags.extension ? "Active" : "Disabled",
                title: "Enable or disable url collection functionality",
                onClick: async () => {
                    enabledFlags.extension = !enabledFlags.extension;
                    await setEnabledFlags(enabledFlags);
                    await refetchState();
                },
                toggled: enabledFlags.extension,
            })),
            rg.c(SmallButton, c => c.render({
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
            isMain && (
                rg.c(SmallButton, c => c.render({
                    text: "Collect from this tab",
                    onClick: async () => {
                        await collectUrlsFromActiveTab();
                        await refetchState();
                    }
                }))
            ),
            !isMain && (
                rg.c(SmallButton, c => c.render({
                    text: "Collect from all tabs",
                    onClick: async () => {
                        await collectUrlsFromTabs();
                    }
                }))
            ),
            rg.c(SmallButton, c => c.render({
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

            !isMain && (
                rg.c(SmallButton, c => c.render({
                    text: "Open Extension Tab",
                    onClick: async () => {
                        await openExtensionTab();
                        await refetchState();
                    }
                }))
            ),
            rg.c(SmallButton, c => c.render({
                text: "Save JSON",
                onClick: async () => {
                    const jsonString = await getStateJSON();
                    saveText(jsonString, "Browser-Graph-State-" + Date.now() + ".json");
                }
            })),
            rg.c(SmallButton, c => c.render({
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
            }))
        ]);
    }
}
