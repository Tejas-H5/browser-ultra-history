import { clearAllForDev } from "./state";
import browser from "webextension-polyfill";

browser.runtime.onInstalled.addListener(() => {
    if (process.env.ENVIRONMENT === "dev") {
        console.log("Loaded background main!")
        clearAllForDev();
    }
});
