const API_URL = import.meta.env.VITE_API_URL || "";
const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

export { API_URL, WS_URL };
export default API_URL;
