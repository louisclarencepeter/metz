const GOOGLE_ANALYTICS_ID = "G-WJ7L9VS8VZ";

let isInitialized = false;

const canUseAnalytics = () =>
  Boolean(GOOGLE_ANALYTICS_ID) &&
  import.meta.env.PROD &&
  typeof window !== "undefined" &&
  typeof document !== "undefined";

export function initGoogleAnalytics() {
  if (!canUseAnalytics()) {
    return false;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
    document.head.appendChild(script);
  }

  if (!isInitialized) {
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ANALYTICS_ID, { send_page_view: false });
    isInitialized = true;
  }

  return true;
}

export function trackPageView(pagePath = `${window.location.pathname}${window.location.search}`) {
  if (!initGoogleAnalytics()) {
    return;
  }

  window.gtag("event", "page_view", {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
  });
}
