import { div, newComponent, newRenderGroup, newStyleGenerator, on, setAttr, setClass } from "./utils/dom-utils";

const sg = newStyleGenerator();

const cnSmallButton = sg.makeClass("small-button", [
    ` { color: var(--fg-color); background-color: var(--bg-color); }`,
    `:hover { cursor:pointer; background-color: var(--bg-color-focus) }`,
    `.inverted { color: var(--bg-color); background-color: var(--fg-color); }`,
    `.radius { border: 2px solid black; border-radius: 5px; padding: 0 10px; }`,
]);

export function SmallButton() {
    type Args = {
        text: string;
        onClick(): void;

        // optional effects
        toggled?: boolean;
        title?: string;
        noBorderRadius?: boolean;
    };

    const rg = newRenderGroup();
    const root = div({ class: cnSmallButton }, [
        rg.text(() => c.args.text)
    ])

    on(root, "click", () => {
        c.args.onClick();
    });

    const c = newComponent<Args>(root, render);
    function render() {
        rg.render();
        setClass(root, "inverted", c.args.toggled === true);
        setClass(root, "radius", c.args.noBorderRadius !== true);
        setAttr(root, "title", c.args.title);
    }

    return c;
}


