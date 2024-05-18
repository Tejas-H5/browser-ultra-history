(() => {
    if (window.__ran_content_script) return;
    window.__ran_content_script = true;

    const POLL_INTERVAL = 5000;

    browser.runtime.sendMessage("Registed an event handler.");
    setInterval(() => {
        console.log("Sending da message");
        browser.runtime.sendMessage("Hi bg scropt. how u doin bro");
    }, POLL_INTERVAL);
})();
