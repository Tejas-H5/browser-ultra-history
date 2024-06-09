import { CurrentLocationData, getCurrentLocationData, getCurrentTabUrl } from "./state";
import { divStyled, newComponent, newRenderGroup } from "./utils/dom-utils";

export function UrlExplorer() {
    const rg = newRenderGroup();
    const root = divStyled("flex-1 p-5 align-items-center justify-content-center", "", [
        rg.text(() => {
            if (loading) {
                return "Loading ...";
            }

            if (!data) {
                return "Loading failed!";
            }

            return data.incoming.length + " incoming, " + data.outgoing.length + " outgoing, metadata: " + JSON.stringify(data.metadata);
        }),
    ]);

    let loading = false;

    const c = newComponent(root, () => renderAsync());

    let data : CurrentLocationData | undefined;

    function render(loadingState: boolean) {
        loading = loadingState
        rg.render();
    }

    async function renderAsync() {
        const currentLocation = await getCurrentTabUrl();
        if (!currentLocation) {
            return;
        }

        render(true);

        data = await getCurrentLocationData(currentLocation);

        render(false);
    }

    return c;
}
