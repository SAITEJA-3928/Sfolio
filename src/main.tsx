import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@/lib/custom-fetch";
import { defaultApiConfig } from "@/lib/api-config";

setBaseUrl(`${defaultApiConfig.baseUrl}${defaultApiConfig.prefix}`);

createRoot(document.getElementById("root")!).render(<App />);
