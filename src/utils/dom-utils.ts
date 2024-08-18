type ValidElement = HTMLElement | SVGElement;
export type Insertable<T extends ValidElement = HTMLElement> = {
    el: T;
    _isHidden: boolean;
};

export type InsertableList = (Insertable<any> | undefined)[];

/**
 * Attemps to replace all of the children under a component in such a way that
 * if comp.el.children[i] === children[i].el, no actions are performed.
 *
 * This way, the code path where no data has changed can remain reasonably performant
 */
export function replaceChildren(comp: Insertable<any>, children: InsertableList) {
    replaceChildrenEl(comp.el, children);
};

export function replaceChildrenEl(el: Element, children: InsertableList) {
    let iReal = 0;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) {
            continue;
        }

        setChildAtEl(el, child, i);
        iReal++;
    }

    while (el.children.length > iReal) {
        el.children[el.children.length - 1].remove();
    }
}

/**
 * Attempts to append a child onto the end of a component, but in such a way that
 * if the final element in {@link mountPoint}.children is identical to {@link child}.el,
 * no actions are performed.
 *
 * This way, the code path where no data has changed can remain reasonably performant
 */
export function appendChild(mountPoint: Insertable<any>, child: Insertable<any>) {
    const el = mountPoint.el;
    appendChildEl(el, child);
};

export function appendChildEl(mountPointEl: Element, child: Insertable<any>) {
    const children = mountPointEl.children;
    if (children.length > 0 && children[children.length - 1] === child.el) {
        // This actually increases performance as well.
        // Because of this return statement, list renderers whos children haven't changed at all can be rerendered 
        // over and over again without moving any DOM nodes. And I have actually able to verify that it _does_ make a difference -
        // this return statement eliminated scrollbar-flickering inside of my scrolling list component
        return;
    }

    mountPointEl.appendChild(child.el);
}

/**
 * Attempts to set the ith child on {@link mountPoint} to {@link child}.
 * If this is already the case, no actions are performed.
 * This way, the code path where no data has changed can remain reasonably performant
 */
export function setChildAt(mountPoint: Insertable<any>, child: Insertable<any>, i: number,) {
    setChildAtEl(mountPoint.el, child, i);
}

export function setChildAtEl(mountPointEl: Element, child: Insertable<any>, i: number) {
    const children = mountPointEl.children;

    if (i === children.length) {
        appendChildEl(mountPointEl, child);
    }

    if (children[i] === child.el) {
        // saves perf as above.
        return;
    }

    mountPointEl.replaceChild(child.el, children[i]);
}

/**
 * Removes {@link child} from {@link mountPoint}.
 * Will also assert that {@link mountPoint} is in fact the parent of {@link child}.
 *
 * NOTE: I've never used this method in practice, so there may be glaring flaws...
 */
export function removeChild(mountPoint: Insertable<any>, child: Insertable) {
    const childParent = child.el.parentElement;
    if (!childParent) {
        return;
    }

    if (childParent !== mountPoint.el) {
        throw new Error("This component is not attached to this parent");
    }

    child.el.remove();
};

/**
 * Clears all children under {@link mountPoint}.
 *
 * NOTE: I've never used this method in practice, so there may be glaring flaws...
 */
export function clearChildren(mountPoint: Insertable<any>) {
    mountPoint.el.replaceChildren();
};

type StyleObject<U extends ValidElement> = (U extends HTMLElement ? keyof HTMLElement["style"] : keyof SVGElement["style"]);

/** 
 * A little more performant than setting the style directly.
 * Not as fast as memoizing the variables that effect the style, and then setting this directly only when those vars have changed
 */
export function setStyle<
    U extends ValidElement,
    K extends StyleObject<U>,
>(
    root: Insertable<U>,
    val: K, style: U["style"][K]
) {
    if (root.el.style[val] !== style) {
        root.el.style[val] = style;
    }
}

/** 
 * A little more performant than adding/removing from the classList directly, but still quite slow actually.
 * Not as fast as memoizing the variables that effect the style, and then setting this directly only when those vars have changed
 */
export function setClass<T extends ValidElement>(
    component: Insertable<T>,
    cssClass: string,
    state: boolean,
): boolean {
    const contains = component.el.classList.contains(cssClass);
    if (state === contains) {
        // Yep. this is another massive performance boost. you would imagine that the browser devs would do this on 
        // their end, but they don't...
        // Maybe because if they did an additional check like this on their end, and then I decided I wanted to 
        // memoize on my end (which would be much faster anyway), their thing would be a little slower.
        // At least, that is what I'm guessing the reason is
        return state;
    }

    if (state) {
        component.el.classList.add(cssClass);
    } else {
        component.el.classList.remove(cssClass);
    }

    return state;
};

export function setVisibleGroup(state: boolean, groupIf: Insertable<HTMLElement | SVGElement>[], groupElse?: Insertable<HTMLElement | SVGElement>[]) {
    for (const i of groupIf) {
        setVisible(i, state);
    }

    if (groupElse) {
        for (const i of groupElse) {
            setVisible(i, !state);
        }
    }

    return state;
}

export function setVisible<U extends HTMLElement | SVGElement, T>(component: Insertable<U>, state: T | null | undefined | false | "" | 0): state is T {
    component._isHidden = !state;
    if (state) {
        component.el.style.setProperty("display", "", "")
    } else {
        component.el.style.setProperty("display", "none", "important")
    }
    return !!state;
}

// This is a certified jQuery moment: https://stackoverflow.com/questions/19669786/check-if-element-is-visible-in-dom
// NOTE: this component will also return false if it hasn't been rendered yet. This is to handle the specific case of
// when we might want to prevent a global event handler from running if our component isn't visible in a modal.
// This turns out to be one of the few reasons why I would ever use this method...
export function isVisible(component: Component<unknown, HTMLElement> | Insertable<HTMLElement>): boolean {
    if (wasHiddenOrUninserted(component)) {
        // if _isHidden is set, then the component is guaranteed to be hidden via CSS. 
        return true;
    }

    // If _isHidden is false, we need to perform additional checking to determine if a component is visible or not.
    // This is why we don't call isVisible to disable rendering when a component is hidden.

    if ("argsOrNull" in component && component.argsOrNull === null) {
        // Args are only populated once a component has been rendered for the first time.
        // They can be undefined, or some object.
        // In retrospect, I think I may have mixed up null and undefined here. Might be worth picking a better sentinel value.
        return false;
    }

    return isVisibleElement(component.el);
}

export function isVisibleElement(el: HTMLElement) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

type ValidAttributeName = string;

/** 
 * Any name and string is fine, but I've hardcoded a few for autocomplete. 
 * A common bug is to type 'styles' instead of 'style' and wonder why the layout isn't working
 */
type Attrs = { [qualifiedName: ValidAttributeName]: string | undefined } & {
    style?: string | Record<keyof HTMLElement["style"], string | null>;
    class?: string;
    href?: string;
    src?: string;
}

/**
 * NOTE: I've not actually checked if this has performance gains,
 * just assumed based on every other function.
 */
export function setAttr<T extends ValidElement>(
    el: Insertable<T>,
    key: string,
    val: string | undefined,
    wrap = false,
) {
    if (val === undefined) {
        el.el.removeAttribute(key);
        return;
    }

    if (wrap) {
        el.el.setAttribute(key, (getAttr(el, key) || "") + val);
        return;
    }

    if (getAttr(el, key) !== val) {
        el.el.setAttribute(key, val);
    }
}

export function getAttr<T extends ValidElement>(
    el: Insertable<T>, key: string
) {
    return el.el.getAttribute(key);
}

export function setAttrs<T extends ValidElement, C extends Insertable<T>>(
    ins: C,
    attrs: Attrs,
    wrap = false,
): C {
    for (const attr in attrs) {
        const val = attrs[attr];
        if (attr === "style" && typeof val === "object") {
            const styles = val as Record<keyof HTMLElement["style"], string | null>;
            for (const s in styles) {
                // @ts-expect-error trust me bro
                setStyle(ins, s, styles[s]);
            }
        }

        setAttr(ins, attr, val, wrap);
    }

    return ins;
}

export function addChildren<T extends ValidElement>(ins: Insertable<T>, children: InsertableInitializerList<T>): Insertable<T> {
    const element = ins.el;

    if (!Array.isArray(children)) {
        children = [children];
    }

    for (let c of children) {
        if (c === false) {
            continue;
        }

        if (typeof c === "function") {
            const res = c(ins);
            if (!res) {
                continue;
            }
            c = res;
        }

        if (Array.isArray(c)) {
            for (const insertable of c) {
                element.appendChild(insertable.el);
            }
        } else if (typeof c === "string") {
            element.appendChild(document.createTextNode(c));
        } else {
            element.appendChild(c.el);
        }
    }

    return ins;
}
/**
 * Used to create svg elements, since {@link el} won't work for those.
 * {@link type} needs to be lowercase for this to work as well.
 *
 * Hint: the `g` element can be used to group SVG elements under 1 DOM node. It's basically the `div` of the SVG world, and
 * defers me from having to implement something like React fragments for 1 more day...
 */
export function elSvg<T extends SVGElement>(
    type: string,
    attrs?: Attrs,
    children?: InsertableInitializerList<T>,
) {
    const xmlNamespace = "http://www.w3.org/2000/svg";
    const svgEl = document.createElementNS(xmlNamespace, type) as T;
    if (type === "svg") {
        // Took this from https://stackoverflow.com/questions/8215021/create-svg-tag-with-javascript
        // Not sure if actually needed
        svgEl.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    return elInternal<T>(svgEl, attrs, children);
}

/**
 * Creates an HTML element with the given attributes, and adds chldren.
 * NOTE: For svg elements, you'll need to use `elSvg`
 */
export function el<T extends HTMLElement>(
    type: string,
    attrs?: Attrs,
    children?: InsertableInitializerList<T>,
): Insertable<T> {
    const element = document.createElement(type) as T;
    return elInternal(element, attrs, children);
}

function elInternal<T extends ValidElement>(
    element: T,
    attrs?: Attrs,
    children?: InsertableInitializerList<T>,
): Insertable<T> {
    const insertable = newInsertable<T>(element);

    if (attrs) {
        setAttrs(insertable, attrs);
    }

    if (children) {
        addChildren(insertable, children);
    }

    return insertable;
}

/**
 * A function passed as a 'child' will be invoked on the parent once when it's being constructed.
 * This function will have access to the current parent, so it may hook up various event handlers.
 * It may also return an Insertable, which can be useful in some scenarios.
 */
type Functionality<T extends ValidElement> = (parent: Insertable<T>) => void | Insertable<any>;
type InsertableInitializerListItem<T extends ValidElement> = Insertable<ValidElement> | string | false | Functionality<T>;
export type InsertableInitializerList<T extends ValidElement = HTMLElement> = InsertableInitializerListItem<T> | InsertableInitializerListItem<T>[];

/**
 * Creates a div, gives it some attributes, and then appends some children. 
 * It was so common to use el("div", ... that I've just made this it's own method.
 *
 * I use this instead of {@link el} 90% of the time
 *
 * NOTE: For svg elements, you'll need to use `elSvg`
 */
export function div(attrs?: Attrs, children?: InsertableInitializerList<HTMLDivElement>) {
    return el<HTMLDivElement>("DIV", attrs, children);
}

export function span(attrs?: Attrs, children?: InsertableInitializerList<HTMLSpanElement>) {
    return el<HTMLSpanElement>("SPAN", attrs, children);
}

export function setErrorClass<T extends ValidElement>(root: Insertable<T>, state: boolean) {
    setClass(root, "catastrophic---error", state);
}

export type ListRenderer<R extends ValidElement, T, U extends ValidElement> = Insertable<R> & {
    components: Component<T, U>[];
    lastIdx: number;
    getIdx(): number;
    render: (renderFn: (getNext: () => Component<T, U>) => void) => void;
};

export function newListRenderer<R extends ValidElement, T, U extends ValidElement>(
    root: Insertable<R>,
    // TODO: templateFn?
    createFn: () => Component<T, U>,
): ListRenderer<R, T, U> {
    function getNext() {
        if (renderer.lastIdx > renderer.components.length) {
            throw new Error("Something strange happened when resizing the component pool");
        }

        if (renderer.lastIdx === renderer.components.length) {
            const component = createFn();
            renderer.components.push(component);
            appendChild(root, component);
        }

        return renderer.components[renderer.lastIdx++];
    }

    let renderFn: ((getNext: () => Component<T, U>) => void) | undefined;
    function renderFnBinded() {
        renderFn?.(getNext);
    }

    const renderer: ListRenderer<R, T, U> = {
        el: root.el,
        get _isHidden() { return root._isHidden; },
        set _isHidden(val: boolean) { root._isHidden = val; },
        components: [],
        lastIdx: 0,
        getIdx() {
            // (We want to get the index of the current iteration, not the literal value of lastIdx)
            return this.lastIdx - 1;
        },
        render(renderFnIn) {
            this.lastIdx = 0;

            renderFn = renderFnIn;

            renderFnBinded();

            while (this.components.length > this.lastIdx) {
                const component = this.components.pop()!;
                component.el.remove();
            }
        },
    };

    return renderer;
}

/** 
 * Why extract such simple method calls as `addEventListener` into it's own helper function?
 * It's mainly so that the code minifier can minify all usages of this method, which should reduce the total filesize sent to the user.
 * So in other words, the methods are extracted based on usage frequency and not complexity.
 *
 * Also I'm thinkig it might make defining simple buttons/interactions a bit simpler, but I haven't found this to be the case just yet.
 * TODO: extend to SVG element
 */
export function on<K extends keyof HTMLElementEventMap>(
    ins: Insertable<HTMLElement>,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
) {
    ins.el.addEventListener(type, listener, options);
    return ins;
}

/** I've found this is very rarely used compared to `on`. Not that there's anything wrong with using this, of course */
export function off<K extends keyof HTMLElementEventMap>(
    ins: Insertable<HTMLElement>,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
) {
    ins.el.removeEventListener(type, listener, options);
    return ins;
}

type TextElement = HTMLTextAreaElement | HTMLInputElement;

export function setInputValueAndResize<T extends TextElement>(inputComponent: Insertable<T>, text: string) {
    setInputValue(inputComponent, text);
    resizeInputToValue(inputComponent);
}

/** This is how I know to make an input that auto-sizes to it's text */
export function resizeInputToValue<T extends TextElement>(inputComponent: Insertable<T>) {
    setAttr(inputComponent, "size", "" + inputComponent.el.value.length);
}

function wasHiddenOrUninserted<T extends ValidElement>(ins: Insertable<T>) {
    return ins._isHidden || !ins.el.parentElement;
}

function checkForRenderMistake<T extends ValidElement>(ins: Insertable<T>) {
    if (!ins.el.parentElement) {
        console.warn("A component hasn't been inserted into the DOM, but we're trying to do things with it anyway.");
    }
}

/** 
 * A LOT faster than just setting the text content manually.
 *
 * However, there are some niche use cases (100,000+ components) where you might need even more performance. 
 * In those cases, you will want to avoid calling this function if you know the text hasn't changed.
 */
export function setText(component: Insertable, text: string) {
    if ("rerender" in component) {
        console.warn("You might be overwriting a component's internal contents by setting it's text");
    };

    if (component.el.textContent === text) {
        // Actually a huge performance speedup!
        return;
    }

    component.el.textContent = text;
};

export function isEditingInput(component: Insertable): boolean {
    return document.activeElement === component.el;
}

/** NOTE: assumes that component.el is an HTMLInputElement */
export function setInputValue<T extends TextElement>(component: Insertable<T>, text: string) {
    const inputElement = component.el;

    // Yeah, its up to you to call it on the right component. 
    // I don't want to add proper types here, because I can't infer the type `htmlf` will return
    if (inputElement.value === text) {
        // might be a huge performance speedup! ?
        return;
    }

    const { selectionStart, selectionEnd } = inputElement;

    inputElement.value = text;

    inputElement.selectionStart = selectionStart;
    inputElement.selectionEnd = selectionEnd;
};

export function getState<T>(c: Component<T, any> | RenderGroup<T>): T {
    const s = c.s;
    if (s === undefined) {
        throw new Error(`A component should been rendered with state at least once before we can access it's state!`);
    }

    return s;
}

export function getRoot<T>(c: RenderGroup<T>): Insertable<any> {
    const root = c.instantiatedRoot;
    if (root === undefined) {
        throw new Error(`This render group does not have a root!`);
    }

    return root;
}


export function __newRealComponentInternal<
    T,
    U extends ValidElement,
    Si extends T,
>(root: Insertable<U>, renderFn: (s: T) => void, s: Si | undefined) {
    const component: Component<T, U> = {
        el: root.el,
        instantiated: false,
        get _isHidden() { return root._isHidden; },
        set _isHidden(val: boolean) { root._isHidden = val; },
        s: s,
        render(args: T) {
            component.s = args;
            component.renderWithCurrentState();
        },
        renderWithCurrentState() {
            if (component.instantiated) {
                checkForRenderMistake(this);
            }

            // Setting this value this late allows the component to render once before it's ever inserted.
            component.instantiated = true;

            const s = getState(component);
            renderFn(s);
        }
    };

    return component;
}

export type RenderGroup<S = null> = {
    /**
     * The current state of this render group, 
     * which is passed into every render function in this render group.
     *
     * You have several opportunities and places where you can supply this state, and all of them
     * are valid for various contexts and use-cases - as long as it is supplied before the first render.
     */
    s: S | undefined;
    /** 
     * The name of the template function this render group has been passed into.
     * It's set by internal functions, and can be used for debugging.
     */
    templateName: string;
    /**
     * Internal variable used to check if this component has been instantiated, as well as for error handling.
     */
    instantiatedRoot?: Insertable<any>;
    /* 
     * Has this component rendered once? 
     * Used to detect bugs where a render function may continue to add more handlers during the render part
     */
    instantiated: boolean;
    /* Enables error handling. */
    skipErrorBoundary: boolean;
    /** 
     * An internal variable used by {@link else} and {@link else_if} to determine if the last call to if, else_if or with failed. 
     */
    lastPredicateResult: boolean;
    /**
     * Sets the current state of this render group, and 
     * then immediately calls {@link RenderGroup.renderWithCurrentState}.
     */
    render: (s: S) => void;
    /**
     * Calls every render function in 
     * the order they were appended to the array using the current state {@link RenderGroup.s}.
     *
     * If this value is undefined, this function will throw.
     *
     * Currently, this function *does NOT* perform any error handling - 
     * this is currently done at a per-component level in {@link Component.renderWithCurrentState}.
     */
    renderWithCurrentState: () => void;
    /**
     * Appends a render function to this render group that will 
     * render the text returned by {@link fn} into a span, 
     * and then returns the span that was created.
     *
     * NOTE:
     * If you need to render a component with non-null sate, you'll need to use {@link RenderGroup.cArgs}
     *
     * @example
     * ```
     * function App(rg: RenderGroup) {
     *      return div({}, [ 
     *          rg.c(TopBar),
     *          rg.c(MainContentView)
     *      ]);
     * }
     * ```
     */
    text: (fn: (s: S) => string) => Insertable<HTMLSpanElement>;
    /**
     * Instantiates a component, appends a render function, and then returns what was instantiated.
     * If you want to instantiate a component without state, use {@link RenderGroup.cNull}.
     *
     * @example
     * ```
     * function CExample(rg: RenderGroup<{ state: State }>) {
     *      return div({}, [ 
     *          rg.cNull(TopBar),
     *          rg.cNull(MainContentView),
     *          rg.c(ProgressBar, (c, {state}) => c.render({
     *              percentage: state.loadingProgress,
     *          }),
     *      ]);
     * }
     * ```
     *
     */
    c<T, U extends ValidElement>(templateFn: TemplateFn<T, U>, renderFn: (c: Component<T, U>, s: S) => void): Component<T, U>;
    cNull<U extends ValidElement>(templateFn: TemplateFn<null, U>): Component<null, U>;
    /**
     * Similar to {@link RenderGroup.renderFn}, but it takes in any insertable type as well and
     * then returns it.
     */
    inlineFn: <T extends Insertable<U>, U extends ValidElement>(
        thing: T,
        renderFn: (c: T, s: S) => void,
    ) => T;
    /** 
     * Returns a new {@link ListRenderer} using {@link root} as it's root, {@link templateFn} as the component being instantiated, and
     * renderFn as the function that re-renders this list.
     */
    list: <R extends ValidElement, T, U extends ValidElement>(
        root: Insertable<R>,
        templateFn: TemplateFn<T, U>,
        renderFn: (s: S, getNext: () => Component<T, U>, listRenderer: ListRenderer<R, T, U>) => void,
    ) => ListRenderer<R, T, U>;
    /** Sets a component visible based on a predicate, and only renders it if it is visible */
    if: <U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>) => Component<S, U>,
    /** Sets a component visible if the last predicate was _not_ true, but this one is */
    else_if: <U extends ValidElement> (predicate: (s: S) => boolean, templateFn: TemplateFn<S, U>) => Component<S, U>,
    /** Sets a component visible if the last predicate was _not_ true */
    else: <U extends ValidElement> (templateFn: TemplateFn<S, U>) => Component<S, U>,
    /** Same as `if` - will hide the component if T is undefined, but lets you do type narrowing */
    with: <U extends ValidElement, T> (predicate: (s: S) => T | undefined, templateFn: TemplateFn<T, U>) => Component<T, U>,
    /**
     * Returns functionality that will append an event to the parent component.
     * It's a declarative version of {@link on}.
     *
     * TODO: extend to SVGElement as well. you can still use it for those, but you'll be fighting with TypeScript
     */
    on: <K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (s: S, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ) => Functionality<HTMLElement>;
    /** 
     * Returns functionality that will set attributes on the parent component.
     * If an attribute was already present, it will be overwritten.
     * 
     * It's a declarative version of {@link setAttr}.
     */
    attr: <U extends ValidElement>(attrName: string, valueFn: (s: S) => string) => Functionality<U>;
    /** 
     * Returns functionality that will sets the presence of the current class in the classList 
     * based on the return value of {@link predicate}.
     * It's a declarative version of {@link setClass}.
     */
    class: <U extends ValidElement>(className: string, predicate: (s: S) => boolean) => Functionality<U>;
    /** 
     * Returns functionality that will sets the current value of an element's style 
     * to the value returned by {@link predicate}.
     * It's a declarative version of {@link setStyle}.
     */
    style: <U extends ValidElement, K extends StyleObject<U>>(val: K, valueFn: (s: S) => U["style"][K]) => Functionality<U>;
    /**
     * Returns custom functionality, allowing for declaratively specifying a component's behaviour.
     * See the documentation for {@link el} for info on how that works.
     */
    functionality: <U extends ValidElement> (fn: (val: Insertable<U>, s: S) => void) => Functionality<U>;
    /**
     * Returns functionality that will replace the DOM nodes of the current with the insertables provided in a children array.
     * You should only have one of thse per dom element. There are currently no checks in place to assert if this is the case or not.
     * NOTE: this solution will need some work
     */
    children: <U extends ValidElement>(childArrayFn: (s: S) => InsertableList) => Functionality<U>;
    /**
     * Appends a custom render function to this render group. Usefull for adding functionality to the render group
     * that has nothing to do with the DOM or the UI, or if you find it better to use an imperative approach to 
     * writing a particular component. 
     * Most of the other declarative functions will be implemented using this function.
     *
     * There are also times where you'll have literally thousands of dom nodes under a single component, and it 
     * may just be more efficient to do stuff imperatively and without allocating memory for each render.
     *
     * @example
     * ```
     * // An imperative component.
     * // (most UI frameworks struggle with stuff like this, which is 
     * // what prompted me to write this one in the first place).
     * function RenderFn(rg: RenderGroup) {
     *      function newElement() {
     *          return div({ style: "width: 10px; height: 10px" });
     *      }
     *      
     *      // This could be a much larger grid if we want - think 200 x 200 ...
     *      // Any larger and I'll just have to start using a canvas
     *      const grid = [
     *          [0, 0, 0],
     *          [0, 0, 0],
     *          [0, 0, 0],
     *      ];
     *      const gridElements = grid.map(row => row.map(val => newElement()));
     *
     *      const root = div({});
     *
     *      rg.renderFn((s) => {
     *          for (let i = 0; i < grid.length; i++) {
     *              const row = grid[i];
     *              const elRow = gridElements[i];
     *              for (let j = 0; j < row.length; j++) {
     *                  const val = row[j];
     *                  const el = elRow[j];
     *                  setStyle(el, "backgroundColor", val === 0 ? "black" : "");
     *              }
     *          }
     *      });
     *
     *      return root;
     * }
     * ```
     */
    renderFn: (fn: (s: S) => void, errorRoot?: Insertable<any>) => void;
};

let debug = false;
export function enableDebugMode() {
    debug = true;
}

const renderCounts = new Map<string, { c: number, t: number; s: Set<RenderGroup<any>> }>();
function countRender(name: string, ref: RenderGroup<any>, num: number) {
    if (!debug) return;

    if (!renderCounts.has(name)) {
        renderCounts.set(name, { c: 0, s: new Set(), t: 0 });
    }
    const d = renderCounts.get(name)!;
    d.c += num;
    d.t++;
    d.s.add(ref);
}

export function printRenderCounts() {
    if (!debug) return;

    let totalComponents = 0;
    let totalRenderFns = 0;
    let totalRenders = 0;

    for (const v of renderCounts.values()) {
        totalRenderFns += v.c;
        totalRenders += v.t;
        totalComponents += v.s.size;
    }

    for (const [k, v] of renderCounts) {
        if (v.t === 0) {
            renderCounts.delete(k);
        }
    }

    console.log(
        ([...renderCounts].sort((a, b) => a[1].c - b[1].c))
            .map(([k, v]) => `${k} (${v.s.size} unique) rendered ${v.c} fns and ${v.t} times, av = ${(v.c / v.t).toFixed(2)}`)
            .join("\n") + "\n\n"
        + `total num components = ${totalComponents}, total render fns  ${totalRenderFns}`
    );

    for (const v of renderCounts.values()) {
        v.c = 0;
        v.t = 0;
        v.s.clear();
    }
}

/**
 * Render groups are the foundation of this 'framework'.
 * Fundamentally, a 'render group' is an array of functions that are called in the 
 * same order that they were appended.
 */
function newRenderGroup<S, Si extends S>(
    initialState: Si | undefined,
    templateName: string = "unknown",
    skipErrorBoundary = false,
): RenderGroup<S> {
    const renderFns: ({ fn: (s: S) => void; root: Insertable<any> | undefined })[] = [];
    const wasLastPredicateFalse = () => !rg.lastPredicateResult;

    const rg: RenderGroup<S> = {
        /** 
         * NOTE: 
         * this s is actually a copy of the reference/value passed into this render group - 
         * we need it so that callbacks we add here work.
         */
        s: initialState,
        templateName,
        instantiatedRoot: undefined,
        instantiated: false,
        skipErrorBoundary,
        lastPredicateResult: true,
        render(s) {
            rg.lastPredicateResult = false;
            rg.s = s;
            rg.renderWithCurrentState();
        },
        renderWithCurrentState() {
            rg.instantiated = true;

            const s = getState(rg);
            const defaultErrorRoot = getRoot(rg);

            countRender(rg.templateName, rg, renderFns.length);
            if (rg.skipErrorBoundary) {
                for (let i = 0; i < renderFns.length; i++) {
                    renderFns[i].fn(s);
                }
            } else {
                for (let i = 0; i < renderFns.length; i++) {
                    const errorRoot = renderFns[i].root || defaultErrorRoot;
                    const fn = renderFns[i].fn;

                    // While this still won't catch errors with callbacks, it is still extremely helpful.
                    // By catching the error at this component and logging it, we allow all other components to render as expected, and
                    // It becomes a lot easier to spot the cause of a bug.
                    //
                    // TODO: consider doing this for callbacks as well, it shouldn't be too hard.

                    try {
                        setErrorClass(errorRoot, false);
                        fn(s);
                    } catch (e) {
                        setErrorClass(errorRoot, true);
                        console.error("An error occured while rendering your component:", e);
                    }
                }
            }
        },
        text: (fn) => {
            const e = span();
            rg.renderFn((s) => setText(e, fn(s)), e);
            return e;
        },
        with: (predicate, templateFn) => {
            const c = newComponent(templateFn);
            rg.renderFn((s) => {
                const val = predicate(s);
                rg.lastPredicateResult = val !== undefined;
                if (setVisible(c, rg.lastPredicateResult)) {
                    c.render(val!);
                }
            }, c);

            return c;
        },
        if: (predicate, templateFn) => {
            const c = newComponent(templateFn);

            rg.renderFn((s) => {
                rg.lastPredicateResult = predicate(s);
                if (setVisible(c, rg.lastPredicateResult)) {
                    c.render(s);
                }
            }, c);

            return c;
        },
        // very big brain
        else_if: (predicate, templateFn) => {
            const predicate2 = (s: S) => wasLastPredicateFalse() && predicate(s);
            return rg.if(predicate2, templateFn);
        },
        else: (templateFn) => {
            return rg.if(wasLastPredicateFalse, templateFn);
        },
        c: (templateFn, renderFn) => {
            const component = newComponent(templateFn);
            rg.renderFn(() => renderFn(component, getState(rg)), component);
            return component;
        },
        cNull: (templateFn) => {
            const component = newComponent(templateFn);
            rg.renderFn(() => component.render(null), component);
            return component;
        },
        inlineFn: (component, renderFn) => {
            rg.renderFn((s) => renderFn(component, s), component);
            return component;
        },
        on(type, listener, options) {
            return (parent) => {
                on(parent, type, (e) => {
                    const s = getState(rg);
                    listener(s, e);
                }, options);
            }
        },
        attr: (attrName, valueFn) => {
            return (parent) => {
                rg.renderFn((s) => setAttr(parent, attrName, valueFn(s)), parent);
            }
        },
        list: (root, templateFn, renderFn) => {
            const listRenderer = newListRenderer(root, () => newComponent(templateFn));
            rg.renderFn((s) => {
                listRenderer.render((getNext) => {
                    renderFn(s, getNext, listRenderer);
                });
            }, root);
            return listRenderer;
        },
        class: (className, predicate) => {
            return (parent) => {
                rg.renderFn((s) => setClass(parent, className, predicate(s)), parent);
            }
        },
        style: (styleName, valueFn) => {
            return (parent) => {
                const currentStyle = parent.el.style[styleName];
                rg.renderFn((s) => setStyle(parent, styleName, valueFn(s) || currentStyle), parent);
            };
        },
        children: (childArrayFn) => {
            return (parent) => {
                rg.renderFn((s) => replaceChildren(parent, childArrayFn(s)))
            }
        },
        functionality: (fn) => {
            return (parent) => {
                rg.renderFn((s) => fn(parent, s), parent);
            };
        },
        renderFn: (fn, root) => {
            if (rg.instantiated) {
                throw new Error("Can't add event handlers to this template (" + rg.templateName + ") after it's been instantiated");
            }

            renderFns.push({ fn, root });
        },
    };

    return rg;
}


type TemplateFn<T, U extends ValidElement> = (rg: RenderGroup<T>) => Insertable<U>;
type TemplateFnPRO<T, U extends ValidElement, R> = (rg: RenderGroup<T>) => readonly [Insertable<U>, R];

/**
 * Instantiates a {@link TemplateFn} into a useable component 
 * that can be inserted into the DOM and rendered one or more times.
 *
 * If {@link initialState} is specified, the component will be rendered once here itself.
 */
export function newComponent<T, U extends ValidElement, Si extends T>(
    templateFn: TemplateFn<T, U>,
    initialState?: Si,
    skipErrorBoundary = false
) {
    // NOTE: COPYPASTE: newComponent
    
    const rg = newRenderGroup<T, Si>(
        initialState,
        templateFn.name ?? "unknown fn name",
        skipErrorBoundary,
    );

    const root = templateFn(rg);
    const component = __newRealComponentInternal(root, rg.render, initialState);
    rg.instantiatedRoot = root;

    if (component.s !== undefined) {
        component.renderWithCurrentState();
    }

    return component;
}

/**
 * Similar to {@link newComponent}, but allows your template function to return a second handle object
 * that can be used to interact with the component from the outside. 
 * A similar concept in React is the idea of an "imperative handle".
 *
 * There are specific situations where it's easier to write a component imperatively, and expose it's internal sate
 * using a second object. 
 * Most components won't need this, but some large monolithic components might.
 *
 * ```
 * function MSPaintClone() {
 *      ... several thousand lines of code. it's almost certainly going to be imperative, given
 *      it's complex and self-contained nature.
 *
 *      return [root, internalState];
 * }
 * ```
 *
 * `internalState` could be an object like:
 * ```
 *      const internalState = {
 *          loadImage,
 *          saveCurrentImage,
 *          undoLastChange,
 *          redoLastChange,
 *          getCurrentSelection,
 *          setCurrentSelection,
 *          ... hundreds of other methods
 *      };
 * ```
 */
export function newComponent2<T, U extends ValidElement, R, Si extends T>(
    templateFn: TemplateFnPRO<T, U, R>,
    initialState?: Si,
    skipErrorBoundary = false
): [Component<T, U>, R] {
    // NOTE: COPYPASTE: newComponent
    
    const rg = newRenderGroup<T, Si>(
        initialState,
        templateFn.name ?? "unknown fn name",
        skipErrorBoundary,
    );

    const [root, h] = templateFn(rg);
    const component = __newRealComponentInternal(root, rg.render, initialState);
    rg.instantiatedRoot = root;

    if (component.s !== undefined) {
        component.renderWithCurrentState();
    }

    return [component, h];
}

export function newInsertable<T extends ValidElement>(el: T): Insertable<T> {
    return {
        el,
        _isHidden: false,
    };
}

export type Component<T, U extends ValidElement> = Insertable<U> & {
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has not been set to false (it is true by default), any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    render(args: T): void;
    /**
     * Renders the component with the arguments provided.
     * 
     * if skipErrorBoundary has been set to true, any exceptions are handled by 
     * adding the "catastrophic---error" css class to the root element of this component.
     */
    renderWithCurrentState(): void;
    s: T | undefined;
    instantiated: boolean;
}

export function isEditingTextSomewhereInDocument(): boolean {
    const el = document.activeElement;
    if (!el) {
        return false;
    }

    const type = el.nodeName.toLocaleLowerCase();
    if (
        type === "textarea" ||
        type === "input"
    ) {
        return true;
    }

    return false;
}

/**
 * Scrolls {@link scrollParent} to bring scrollTo into view.
 * {@link scrollToRelativeOffset} specifies where to to scroll to. 0 = bring it to the top of the scroll container, 1 = bring it to the bottom
 */
export function scrollIntoView(
    scrollParent: HTMLElement,
    scrollTo: Insertable<HTMLElement>,
    scrollToRelativeOffset: number,
    horizontal = false,
) {
    if (horizontal) {
        // NOTE: this is a copy-paste from below

        const scrollOffset = scrollToRelativeOffset * scrollParent.offsetWidth;
        const elementWidthOffset = scrollToRelativeOffset * scrollTo.el.getBoundingClientRect().width;

        // offsetLeft is relative to the document, not the scroll container. lmao
        const scrollToElOffsetLeft = scrollTo.el.offsetLeft - scrollParent.offsetLeft;

        scrollParent.scrollLeft = scrollToElOffsetLeft - scrollOffset + elementWidthOffset;

        return;
    }

    const scrollOffset = scrollToRelativeOffset * scrollParent.offsetHeight;
    const elementHeightOffset = scrollToRelativeOffset * scrollTo.el.getBoundingClientRect().height;

    // offsetTop is relative to the document, not the scroll container. lmao
    const scrollToElOffsetTop = scrollTo.el.offsetTop - scrollParent.offsetTop;

    scrollParent.scrollTop = scrollToElOffsetTop - scrollOffset + elementHeightOffset;
}

export function setCssVars(vars: [string, string][]) {
    const cssRoot = document.querySelector(":root") as HTMLElement;
    for (const [k, v] of vars) {
        cssRoot.style.setProperty(k, v);
    }
};

export type StyleGenerator = {
    prefix: string;
    makeClass(className: string, styles: string[]): string;
};

let lastClass = 0;
/**
 * NOTE: this should always be called at a global scope on a *per-module* basis, and never on a per-component basis.
 * Otherwise you'll just have a tonne of duplicate styles lying around in the DOM. 
 */
export function newStyleGenerator(): StyleGenerator {
    const root = el<HTMLStyleElement>("style", { type: "text/css" });
    document.body.appendChild(root.el);

    lastClass++;

    const obj: StyleGenerator = {
        // css class names can't start with numbers, but uuids occasionally do. hence "s".
        // Also, I think the "-" is very important for preventing name collisions.
        prefix: "s" + lastClass + "-",
        makeClass: (className: string, styles: string[]): string => {
            const name = obj.prefix + className;

            for (const style of styles) {
                root.el.appendChild(
                    document.createTextNode(`.${name}${style}\n`)
                );
            }

            return name;
        }
    };

    return obj;
}
