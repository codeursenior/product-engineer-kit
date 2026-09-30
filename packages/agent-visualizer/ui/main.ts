import { provideHttpClient } from "@angular/common/http";
import { provideBrowserGlobalErrorListeners } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app";

bootstrapApplication(App, {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
}).catch(console.error);
