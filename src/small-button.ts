import { RenderGroup, div, getState, newStyleGenerator, setAttr, setClass, setText } from "./utils/dom-utils";

const sg = newStyleGenerator();

const cnSmallButton = sg.makeClass("small-button", [
    ` { color: var(--fg-color); background-color: var(--bg-color); user-select: none; }`,
    `:hover { cursor:pointer; background-color: var(--bg-color-focus) }`,
    `.inverted { color: var(--bg-color); background-color: var(--fg-color); }`,
    `.radius { border: 2px solid black; border-radius: 5px; padding: 0 10px; }`,
]);

export function SmallButton(rg: RenderGroup<{
    text: string;
    onClick(): void;

    // optional effects
    toggled?: boolean;
    title?: string; // This is the html default tooltip, in case you've forgotten
    noBorderRadius?: boolean;
}>) {
    return div({ class: cnSmallButton }, [
        rg.on("click", () => {
            const s = getState(rg);
            s.onClick();
        }),
        rg.functionality((root, s) => {
            setText(root, s.text);
            setClass(root, "inverted", s.toggled === true);
            setClass(root, "radius", s.noBorderRadius !== true);
            setAttr(root, "title", s.title);
        })
    ])
}


