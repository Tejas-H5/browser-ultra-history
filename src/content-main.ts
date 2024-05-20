import { recieveMessage } from "./message";
declare global {
    interface Window {
        __ran_content_script?: boolean;
    }
}


if (process.env.ENVIRONMENT === "dev") {
    console.log("Loaded content main!")
}

recieveMessage((message, _sender, response) => {
    if (message.type === "collect_urls") {
        response({
            type: "urls",
            urls: [window.location.href],
        });
    }
}, "content");
