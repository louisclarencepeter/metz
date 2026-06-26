import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowUpRight, Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { Linkedin, Twitter, Facebook, Instagram } from "./components/Icons.jsx";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import LanguageToggle from "./components/LanguageToggle.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import { useI18n } from "./i18n.jsx";
import { company } from "./data/content.js";
import { telHref } from "./utils/format.js";
import { trackPageView } from "./utils/googleAnalytics.js";
import Home from "./pages/Home.jsx";

const About = lazy(() => import("./pages/About.jsx"));
const Contact = lazy(() => import("./pages/Contact.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Projects = lazy(() => import("./pages/Projects.jsx"));
const Services = lazy(() => import("./pages/Services.jsx"));

const legacyRoutes = {
  "/home.html": "/",
  "/about.html": "/about",
  "/services.html": "/services",
  "/projects.html": "/projects",
  "/contact.html": "/contact",
};

const navItems = [
  { to: "/", key: "nav.home" },
  { to: "/about", key: "nav.about" },
  { to: "/services", key: "nav.services" },
  { to: "/projects", key: "nav.projects" },
  { to: "/contact", key: "nav.contact" },
];

function usePageEffects() {
  const { pathname } = useLocation();
  const { t, locale } = useI18n();

  useEffect(() => {
    const canonicalPath = legacyRoutes[pathname] ?? pathname;
    const page = navItems.find((item) => item.to === canonicalPath);

    document.title = page ? `${t(page.key)} | METZ Engineering` : "METZ Engineering";
    trackPageView(canonicalPath);
    window.scrollTo({ top: 0, left: 0 });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealTargets = document.querySelectorAll(
      ".page-hero, .stats-band, .content-band, .callout, .service-card, .project-card, .portfolio-card, .person-card, .detail-panel, .contact-panel, .contact-form",
    );

    revealTargets.forEach((target) => {
      target.classList.add("reveal-target");

      const rect = target.getBoundingClientRect();
      const startsInView = rect.top < window.innerHeight * 0.9;

      if (reduceMotion || startsInView) {
        target.classList.add("is-visible");
      }
    });

    if (reduceMotion) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    revealTargets.forEach((target) => {
      if (!target.classList.contains("is-visible")) {
        observer.observe(target);
      }
    });

    return () => observer.disconnect();
  }, [pathname, locale, t]);
}

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 981px)");
    const closeOnDesktop = (event) => {
      if (event.matches) {
        setIsOpen(false);
      }
    };

    closeOnDesktop(desktopQuery);
    desktopQuery.addEventListener("change", closeOnDesktop);
    return () => desktopQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <header className="site-header">
      <div className="topbar">
        <span>
          <MapPin size={16} aria-hidden="true" />
          {company.address}
        </span>
        <a href={telHref(company.phonePrimary)}>
          <Phone size={16} aria-hidden="true" />
          {company.phonePrimary}
        </a>
      </div>

      <div className="navbar">
        <NavLink className="brand" to="/" aria-label={t("nav.aria.brandHome")}>
          <img src="/icons/icon-192.png" alt="METZ Engineering logo" width="50" height="50" />
          <span>
            <strong>METZ</strong>
            <small>Engineering Co. Limited</small>
          </span>
        </NavLink>

        <button
          className="icon-button nav-toggle"
          type="button"
          aria-label={isOpen ? t("nav.aria.close") : t("nav.aria.open")}
          aria-controls="mobile-navigation"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <Menu size={22} />
        </button>

        <nav className="primary-nav" aria-label={t("nav.aria.main")}>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{t(item.key)}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Backdrop */}
      <div
        className={`drawer-backdrop${isOpen ? " is-visible" : ""}`}
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-in Drawer */}
      <aside
        id="mobile-navigation"
        className={`mobile-drawer${isOpen ? " is-open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="drawer-header">
          <NavLink className="brand" to="/" aria-label={t("nav.aria.brandHome")} onClick={() => setIsOpen(false)}>
            <img src="/icons/icon-192.png" alt="METZ Engineering logo" width="38" height="38" />
            <span>
              <strong>METZ</strong>
              <small>Engineering Co. Limited</small>
            </span>
          </NavLink>
          <button
            className="drawer-close"
            type="button"
            aria-label={t("nav.aria.close")}
            onClick={() => setIsOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="drawer-nav" aria-label={t("nav.aria.main")}>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} onClick={() => setIsOpen(false)}>
                  <span>{t(item.key)}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="drawer-footer">
          <div className="drawer-social">
            <a href="#" aria-label="LinkedIn"><Linkedin size={18} /></a>
            <a href="#" aria-label="Twitter"><Twitter size={18} /></a>
            <a href="#" aria-label="Facebook"><Facebook size={18} /></a>
            <a href="#" aria-label="Instagram"><Instagram size={18} /></a>
          </div>
          <div className="drawer-contact">
            <a href={telHref(company.phonePrimary)}>
              <Phone size={13} aria-hidden="true" />
              {company.phonePrimary}
            </a>
            <a href={`mailto:${company.email}`}>
              <Mail size={13} aria-hidden="true" />
              {company.email}
            </a>
          </div>
        </div>
      </aside>
    </header>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <img src="/icons/icon-192.png" alt="" width="50" height="50" />
          <h2>METZ Engineering Co. Limited</h2>
          <p>{t(company.tagline)}</p>
        </div>

        <address>
          <strong>{t("footer.visit")}</strong>
          <span>{company.postal}</span>
          <span>{company.address}</span>
        </address>

        <div className="footer-contact">
          <strong>{t("footer.contact")}</strong>
          <a href={telHref(company.phonePrimary)}>
            <Phone size={16} aria-hidden="true" />
            {company.phonePrimary}
          </a>
          <a href={telHref(company.phoneSecondary)}>
            <Phone size={16} aria-hidden="true" />
            {company.phoneSecondary}
          </a>
          <a href={`mailto:${company.email}`}>
            <Mail size={16} aria-hidden="true" />
            {company.email}
          </a>
        </div>
      </div>
      <div className="footer-base">
        <div className="footer-base__inner">
          <p>{t("footer.copy", { year: new Date().getFullYear() })}</p>
          <div className="footer-controls">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}

function LegacyRedirect({ to }) {
  return <Navigate to={to} replace />;
}

function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main-content">
      {t("nav.skip")}
    </a>
  );
}

export default function App() {
  usePageEffects();

  return (
    <div className="app-shell">
      <SkipLink />
      <Header />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/services" element={<Services />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/contact" element={<Contact />} />
          {Object.entries(legacyRoutes).map(([from, to]) => (
            <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Footer />
    </div>
  );
}
