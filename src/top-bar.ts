import { RenderGroup, div } from 'src/utils/dom-utils';
import { openExtensionTab } from './open-pages';
import { SmallButton } from './small-button';
import { EnabledFlags, clearAllData, collectUrlsFromActiveTab, collectUrlsFromTabs, getEnabledFlags, getStateJSON, loadStateJSON, setEnabledFlags } from './state';
import { loadFile, saveText } from './utils/file-download';
import { hasExternalStateChanged, rerenderApp } from './render-context';

export function makeTopBar(isMain: boolean) {
    return function TopBar(rg: RenderGroup) {
        let enabledFlagsOrUndefined: EnabledFlags | undefined;

        async function refetchState() {
            try {
                enabledFlagsOrUndefined = await getEnabledFlags();

                rerenderApp();
            } catch (e) {
                rerenderApp();
            }
        }

        rg.preRenderFn(() => {
            if (hasExternalStateChanged()) {
                setTimeout(refetchState, 1);
            }
        });

        return div({ style: "gap: 3px" }, [
            rg.c(ActionsRow, c => c.render({ isMain })),
            rg.with(() => enabledFlagsOrUndefined, FeatureTogglesRow),
            rg.else(rg => 
                div({}, ["Loading feature flags..."])
            )
        ]);
    }
}

function ActionsRow(rg: RenderGroup<{ isMain: boolean }>) {
    let isMain = false;

    rg.preRenderFn((s) => isMain = s.isMain);

    return div({ class: "row sb1b", style: "gap: 3px" }, [
        isMain && (
            rg.c(SmallButton, c => c.render({
                text: "Collect from this tab",
                onClick: async () => {
                    await collectUrlsFromActiveTab();
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
            }
        })),

        div({ class: "flex-1" }),

        !isMain && (
            rg.c(SmallButton, c => c.render({
                text: "Open Extension Tab",
                onClick: async () => {
                    await openExtensionTab();
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


function FeatureTogglesRow(rg: RenderGroup<EnabledFlags>) {
    return div({ class: "row sb1b", style: "gap: 5px" }, [
        rg.c(SmallButton, (c, s) => c.render({
            text: s.extension ? "Collections enabled!" : "Collections disabled",
            noBorderRadius: true,
            title: "Enable or disable core ",
            onClick: async () => {
                s.extension = !s.extension;
                await setEnabledFlags(s);
            },
            toggled: s.extension,
        })),
        rg.if((s) => s.extension, rg =>
            rg.c(SmallButton, (c, s) => c.render({
                text: "Silent",
                noBorderRadius: true,
                title: "Collects urls without an overlay message on the webpage itself.",
                onClick: async () => {
                    s.silent = !s.silent;
                    await setEnabledFlags(s);
                },
                toggled: s.silent,
            }))
        ),
        rg.if((s) => s.extension, rg =>
            rg.c(SmallButton, (c, s) => c.render({
                text: "Deep collect [!]",
                noBorderRadius: true,
                title: "Enables collections that are far less performant, and can generate in a lot of spammy useless URLs being collected. Enable this at your own peril",
                onClick: async () => {
                    s.deepCollect = !s.deepCollect;
                    await setEnabledFlags(s);
                },
                toggled: s.deepCollect,
            }))
        ),
    ])
}
