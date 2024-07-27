import { div, newComponent, newRenderGroup, newState, newStyleGenerator, on, setAttr, setClass } from "./utils/dom-utils";

const sg = newStyleGenerator();

const cnSmallButton = sg.makeClass("small-button", [
    ` { color: var(--fg-color); background-color: var(--bg-color); user-select: none; }`,
    `:hover { cursor:pointer; background-color: var(--bg-color-focus) }`,
    `.inverted { color: var(--bg-color); background-color: var(--fg-color); }`,
    `.radius { border: 2px solid black; border-radius: 5px; padding: 0 10px; }`,
]);

export function SmallButton() {
    const s = newState<{
        text: string;
        onClick(): void;

        // optional effects
        toggled?: boolean;
        title?: string; // This is the html default tooltip, in case you've forgotten
        noBorderRadius?: boolean;
    }>();

    const rg = newRenderGroup();
    const root = div({ class: cnSmallButton }, [
        rg.text(() => s.args.text)
    ])

    on(root, "click", () => {
        s.args.onClick();
    });

    function render() {
        rg.render();
        setClass(root, "inverted", s.args.toggled === true);
        setClass(root, "radius", s.args.noBorderRadius !== true);
        setAttr(root, "title", s.args.title);
    }

    return newComponent(root, render, s);
}


