import { div, newComponent, newState, newStyleGenerator, on, setAttr, setClass, setText } from "./utils/dom-utils";

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

    const root = div({ class: cnSmallButton });

    on(root, "click", () => {
        s.args.onClick();
    });

    function render() {
        setText(root, s.args.text);
        setClass(root, "inverted", s.args.toggled === true);
        setClass(root, "radius", s.args.noBorderRadius !== true);
        setAttr(root, "title", s.args.title);
    }

    return newComponent(root, render, s);
}


