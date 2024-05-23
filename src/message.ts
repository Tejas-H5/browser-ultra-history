import browser from "webextension-polyfill";

// Should become a massive union type.
export type Message = {
    type: "collect_urls",
} | {
    type: "urls";
    urls: UrlInfo[];
} | {
    type: "log";
    message: string;
    tabUrl: string;
};

export type UrlInfo = {
    url: string;
    urlCollectedFrom: string;
    visitedAt: string;
    metadata: UrlMetadata;
} 

export type UrlMetadata =
    { source: "directly-visited" } |
    { source: "text", text: string } |
    { source: "style", styleName: string } |
    { source: "attribute", attrName: string }


export function sendMessage(message: Message) {
    browser.runtime.sendMessage(message);
}

export function recieveMessage(callback: (message: Message, sender: object, response: (message: Message) => void) => void, _debug: string = "idk") {
    browser.runtime.onMessage.addListener((...args) => {
        callback(...args);
    });
}

export async function sendMessageToTabs(message: Message) {
    const tabs = await browser.tabs.query({});
    const responses: Promise<Message>[] = [];

    for(const tab of tabs) {
        const tabId = tab.id;
        if (!tabId) {
            continue;
        }

        responses.push(browser.tabs.sendMessage(tabId, message));
    }

    const responsesSettled = await Promise.allSettled(responses);
    const fulfilled: Message[] = [];
    for (const res of responsesSettled) {
        if (res.status === "fulfilled") {
            fulfilled.push(res.value);
        }
    }

    return fulfilled;
}
