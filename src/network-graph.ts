import { divStyled, newComponent, newRenderGroup } from "./utils/dom-utils";

export function NetworkGraph() {
    const rg = newRenderGroup();
    const root = divStyled("flex-1 p-5 align-items-center justify-content-center", "", [
        rg.text(() => "Network graph - TODO")
    ]);

    const c = newComponent(root, rg.render);

    return c;
}
