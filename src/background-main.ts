
let installed = false;
browser.runtime.onInstalled.addListener(() => {
    if (installed) return;
    installed = true;

    console.log("Content main!");
    browser.runtime.onMessage.addListener(notify);
});

function notify(message: any) {
    console.log("Got a message from somewhere idk", message);
}
